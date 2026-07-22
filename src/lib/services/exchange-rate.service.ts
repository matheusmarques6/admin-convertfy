/**
 * Exchange Rate Service
 *
 * Fetches real-time exchange rates from open.er-api.com (free, no key required).
 * Uses in-memory cache (1h TTL) + DB fallback via dashboard_cache.
 * All rates are relative to BRL (1 USD = X BRL).
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

// In-memory L1 cache
let memoryCache: ExchangeRates | null = null

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
 */
async function getExchangeRates(): Promise<ExchangeRates | null> {
  // L1: In-memory cache
  if (memoryCache && (Date.now() - memoryCache.fetchedAt) < CACHE_TTL_MS) {
    return memoryCache
  }

  // L2: DB cache
  try {
    const supabase = createAdminClient()
    const { data: cached } = await supabase
      .from("exchange_rate_cache")
      .select("rates")
      .eq("key", GLOBAL_CACHE_KEY)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle()

    if (cached?.rates) {
      memoryCache = { rates: cached.rates as Record<string, number>, fetchedAt: Date.now() }
      log.info("[ExchangeRate] Loaded from DB cache")
      return memoryCache
    }
  } catch {
    // DB cache miss — continue to API
  }

  // L3: Fetch from API
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
      return memoryCache // Return stale if available
    }

    const data = await response.json() as {
      result: string
      rates: Record<string, number>
    }

    if (data.result !== "success" || !data.rates) {
      log.warn("[ExchangeRate] API returned unexpected format")
      return memoryCache
    }

    memoryCache = { rates: data.rates, fetchedAt: Date.now() }
    log.info(`[ExchangeRate] Fetched ${Object.keys(data.rates).length} rates from API`)

    // Save to DB cache (fire-and-forget)
    try {
      const supabase = createAdminClient()
      const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString()
      await supabase.from("exchange_rate_cache").upsert(
        {
          key: GLOBAL_CACHE_KEY,
          rates: data.rates,
          fetched_at: new Date().toISOString(),
          expires_at: expiresAt,
        },
        { onConflict: "key" }
      )
    } catch (e) {
      log.warn("[ExchangeRate] Failed to save to DB cache:", e)
    }

    return memoryCache
  } catch (error) {
    log.error("[ExchangeRate] Failed to fetch rates:", error)
    return memoryCache // Return stale if available
  }
}
