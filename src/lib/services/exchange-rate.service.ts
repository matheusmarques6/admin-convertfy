/**
 * Exchange Rate Service
 *
 * Fetches real-time exchange rates from open.er-api.com (free, no key required).
 * Uses in-memory cache (1h TTL) + DB fallback via exchange_rate_cache.
 * All rates are relative to BRL (1 USD = X BRL).
 *
 * Protecoes contra cache stampede (incidente 2026-07-26, 503 em rajada):
 * - singleflight: N chamadas concorrentes compartilham UMA busca em voo;
 * - stale-on-error: falha de INFRA no L2 devolve cotacao velha em vez de
 *   cair pro L3 — evitar castigar um banco que ja esta fora do ar;
 * - cooldown: apos falha, servir stale por um periodo sem retentar.
 *
 * API docs: https://www.exchangerate-api.com/docs/free
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("ExchangeRate")

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const API_URL = "https://open.er-api.com/v6/latest/BRL"

// Chave da linha única em exchange_rate_cache (tabela própria — migration
// 20260720_exchange_rate_cache.sql; câmbio é global, não pertence a loja)
const GLOBAL_CACHE_KEY = "latest"

interface ExchangeRates {
  rates: Record<string, number> // e.g. { USD: 0.175, EUR: 0.161, ... } (1 BRL = X foreign)
  fetchedAt: number
}

// Janela em que, apos uma falha de L2/L3, servimos o cache velho sem
// retentar. Curto de proposito: cotacao move devagar, mas o banco pode
// voltar a qualquer momento.
const FAILURE_COOLDOWN_MS = 60 * 1000 // 1 minute

// In-memory L1 cache
let memoryCache: ExchangeRates | null = null

// Singleflight: a PROMISE em voo (nao o valor). Enquanto ela existe, toda
// chamada concorrente aguarda a mesma busca em vez de abrir a sua.
let inFlight: Promise<ExchangeRates | null> | null = null

// Epoch ate o qual nao tentamos L2/L3 de novo (ver FAILURE_COOLDOWN_MS).
let cooldownUntil = 0

/** Reseta o estado de modulo. Existe para os testes — nao usar em runtime. */
export function __resetExchangeRateCacheForTests(): void {
  memoryCache = null
  inFlight = null
  cooldownUntil = 0
}

/** Resultado detalhado da conversao — `converted=false` sinaliza que o valor
 *  saiu NA MOEDA ORIGINAL (fallback), permitindo ao chamador exibir um badge
 *  "câmbio indisponível" em vez de misturar moedas silenciosamente. */
export interface BRLConversion {
  valueBRL: number
  converted: boolean
  reason?: "same-currency" | "zero" | "no-rates" | "no-currency-rate"
}

/**
 * Convert an amount from a given currency to BRL, retornando metadado.
 *
 * Example: convertToBRLDetailed(100, "USD") when 1 BRL = 0.175 USD
 *   → { valueBRL: 571.43, converted: true }
 */
export async function convertToBRLDetailed(
  amount: number,
  currency: string,
): Promise<BRLConversion> {
  if (currency === "BRL") return { valueBRL: amount, converted: true, reason: "same-currency" }
  if (amount === 0) return { valueBRL: 0, converted: true, reason: "zero" }

  const rates = await getExchangeRates()
  if (!rates) {
    log.warn("[ExchangeRate] No rates available, returning unconverted", { currency, amount })
    return { valueBRL: amount, converted: false, reason: "no-rates" }
  }

  const rateFromBRL = rates.rates[currency]
  if (!rateFromBRL || rateFromBRL === 0) {
    log.warn("[ExchangeRate] No rate for currency, returning unconverted", { currency, amount })
    return { valueBRL: amount, converted: false, reason: "no-currency-rate" }
  }

  // rates are "1 BRL = X foreign", so to convert foreign to BRL: amount / rate
  const converted = amount / rateFromBRL
  return { valueBRL: Math.round(converted * 100) / 100, converted: true }
}

/**
 * Convert an amount from a given currency to BRL.
 *
 * Wrapper de compatibilidade sobre convertToBRLDetailed — mantido para os
 * muitos call-sites que so precisam do numero. Em falha de câmbio devolve o
 * valor NAO convertido (mesmo comportamento historico).
 *
 * Example: convertToBRL(100, "USD") when 1 BRL = 0.175 USD → 100 / 0.175 = R$ 571.43
 */
export async function convertToBRL(amount: number, currency: string): Promise<number> {
  const { valueBRL } = await convertToBRLDetailed(amount, currency)
  return valueBRL
}

/**
 * Get exchange rates (1 BRL = X foreign currency).
 * Checks: in-memory cache → DB cache → API fetch.
 *
 * So esta funcao decide QUANDO buscar; o COMO fica em refreshRates(). A
 * separacao existe para o singleflight: a promise em voo precisa envolver
 * a cadeia L2+L3 inteira, senao duas chamadas concorrentes ainda abririam
 * dois fetches externos.
 */
async function getExchangeRates(): Promise<ExchangeRates | null> {
  // L1: In-memory cache
  if (memoryCache && (Date.now() - memoryCache.fetchedAt) < CACHE_TTL_MS) {
    return memoryCache
  }

  // Cooldown pos-falha: devolve o que tiver (stale ou null) sem tocar em
  // L2/L3. Sem isto, um banco fora do ar vira uma tempestade de retries.
  if (Date.now() < cooldownUntil) {
    return memoryCache
  }

  // Singleflight: quem chegar durante a busca aguarda a MESMA promise.
  if (inFlight) return inFlight

  inFlight = refreshRates().finally(() => {
    inFlight = null
  })
  return inFlight
}

/**
 * Cadeia L2 (banco) → L3 (API). Chamada apenas via getExchangeRates(), que
 * garante uma execucao por vez.
 */
async function refreshRates(): Promise<ExchangeRates | null> {
  // L2: DB cache
  try {
    const supabase = createAdminClient()
    const { data: cached, error } = await supabase
      .from("exchange_rate_cache")
      .select("rates")
      .eq("key", GLOBAL_CACHE_KEY)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle()

    // CRITICO: o supabase-js NAO lanca excecao em erro HTTP — devolve
    // { data: null, error }. Ignorar o `error` (como este codigo fazia)
    // torna um 503 indistinguivel de "nao ha cache", e manda todo mundo
    // pro L3 justamente quando o banco esta caindo.
    if (error) {
      log.warn("[ExchangeRate] L2 indisponivel, servindo stale", {
        code: error.code,
        message: error.message,
        hasStale: memoryCache !== null,
      })
      cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS
      return memoryCache
    }

    if (cached?.rates) {
      memoryCache = { rates: cached.rates as Record<string, number>, fetchedAt: Date.now() }
      log.info("[ExchangeRate] Loaded from DB cache")
      return memoryCache
    }
  } catch (e) {
    // Falha de rede/transporte antes de chegar ao PostgREST — mesmo
    // tratamento do erro logico acima.
    log.warn("[ExchangeRate] L2 falhou (transporte), servindo stale:", e)
    cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS
    return memoryCache
  }

  // Miss legitimo (linha ausente ou expirada) → L3
  return fetchAndCacheRates()
}

/**
 * Fetch rates from the free API and save to both memory and DB.
 */
async function fetchAndCacheRates(): Promise<ExchangeRates | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(API_URL, { signal: controller.signal })
    clearTimeout(timeout)

    if (!response.ok) {
      log.warn(`[ExchangeRate] API returned ${response.status}`)
      cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS
      return memoryCache // Return stale if available
    }

    const data = await response.json() as {
      result: string
      rates: Record<string, number>
    }

    if (data.result !== "success" || !data.rates) {
      log.warn("[ExchangeRate] API returned unexpected format")
      cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS
      return memoryCache
    }

    memoryCache = { rates: data.rates, fetchedAt: Date.now() }
    log.info(`[ExchangeRate] Fetched ${Object.keys(data.rates).length} rates from API`)

    // Write-back no L2. Best-effort: o L1 ja foi populado acima, entao
    // falhar aqui nao invalida a cotacao que vamos devolver.
    try {
      const supabase = createAdminClient()
      const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString()
      const { error: upsertError } = await supabase.from("exchange_rate_cache").upsert(
        {
          key: GLOBAL_CACHE_KEY,
          rates: data.rates,
          fetched_at: new Date().toISOString(),
          expires_at: expiresAt,
        },
        { onConflict: "key" }
      )
      if (upsertError) {
        log.warn("[ExchangeRate] Failed to save to DB cache:", upsertError.message)
      }
    } catch (e) {
      log.warn("[ExchangeRate] Failed to save to DB cache:", e)
    }

    return memoryCache
  } catch (error) {
    log.error("[ExchangeRate] Failed to fetch rates:", error)
    cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS
    return memoryCache // Return stale if available
  }
}
