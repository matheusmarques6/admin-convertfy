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
  /**
   * Quantos REAIS vale 1 unidade da moeda (ex.: EUR → 5.9589).
   *
   * É o inverso do que o provedor manda (`rates` é "1 BRL = X moeda"),
   * porque é assim que a conta é lida por quem confere: "€ 12.400 ×
   * 5,9589 = R$ 73.890". Sem expor a taxa, o número em real não é
   * verificável por ninguém — foi a lacuna que fez o valor convertido
   * parecer inventado.
   */
  rate?: number
  /** Dia (YYYY-MM-DD) da cotação usada. */
  rateDate?: string
  /**
   * A cotação NÃO é a do dia pedido — é a mais próxima que tínhamos.
   * Acontece para datas anteriores ao início do histórico diário. Quem
   * mostra o valor precisa poder dizer isso.
   */
  rateApproximate?: boolean
}

/** Uma parcela em moeda estrangeira, para o resumo de composição. */
export interface ConversionPart {
  currency: string
  amount: number
  amountBRL: number
  rate?: number
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
  return convertToBRLOn(amount, currency, null)
}

/**
 * Converte usando a cotação DE UM DIA.
 *
 * `day` (YYYY-MM-DD) null = cotação corrente, o comportamento histórico.
 *
 * Por que existe: a receita de uma janela de 90 dias era convertida
 * inteira pela cotação de hoje. Além do erro de valor, o MESMO período
 * dava um total diferente a cada dia — relatório que muda sozinho não
 * fecha com nada. Com a taxa do dia, o dia 12/08 vale sempre o que valia
 * em 12/08.
 *
 * Fora do histórico disponível a função NÃO inventa: devolve a cotação
 * mais próxima que existe com `rateApproximate: true`, e quem mostra o
 * número diz que é aproximada.
 */
export async function convertToBRLOn(
  amount: number,
  currency: string,
  day: string | null,
): Promise<BRLConversion> {
  const moeda = (currency || "BRL").toUpperCase()
  if (moeda === "BRL") return { valueBRL: amount, converted: true, reason: "same-currency", rate: 1 }
  if (amount === 0) return { valueBRL: 0, converted: true, reason: "zero" }

  const cotacao = day ? await getRatesForDay(day) : await cotacaoCorrente()
  if (!cotacao) {
    log.warn("[ExchangeRate] No rates available, returning unconverted", { currency: moeda, amount })
    return { valueBRL: amount, converted: false, reason: "no-rates" }
  }

  const rateFromBRL = cotacao.rates[moeda]
  if (!rateFromBRL || rateFromBRL === 0) {
    log.warn("[ExchangeRate] No rate for currency, returning unconverted", { currency: moeda, amount })
    return { valueBRL: amount, converted: false, reason: "no-currency-rate", rateDate: cotacao.day }
  }

  // O provedor manda "1 BRL = X moeda"; para ir de moeda a BRL divide-se.
  // `rate` sai invertido porque é como a conta é conferida por quem lê.
  const converted = amount / rateFromBRL
  return {
    valueBRL: Math.round(converted * 100) / 100,
    converted: true,
    rate: Math.round((1 / rateFromBRL) * 10000) / 10000,
    rateDate: cotacao.day,
    rateApproximate: cotacao.approximate || undefined,
  }
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

/** Cotação resolvida para uma data, com a procedência da resolução. */
interface Cotacao {
  rates: Record<string, number>
  /** Dia da cotação REALMENTE usada (YYYY-MM-DD). */
  day: string
  /** A cotação não é do dia pedido — é a mais próxima que existe. */
  approximate: boolean
}

/** YYYY-MM-DD em UTC — mesmo eixo em que o histórico é gravado. */
function diaUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function cotacaoCorrente(): Promise<Cotacao | null> {
  const r = await getExchangeRates()
  if (!r) return null
  return { rates: r.rates, day: diaUtc(new Date(r.fetchedAt)), approximate: false }
}

// Cotação por dia: dia → resultado. Dia fechado NÃO muda, então o cache
// não expira dentro da vida do processo. Só o dia de hoje é excluído (a
// cotação dele ainda pode ser atualizada).
const cotacaoPorDia = new Map<string, Cotacao | null>()

/** Reseta o estado de módulo. Existe para os testes — não usar em runtime. */
export function __resetDailyRatesCacheForTests(): void {
  cotacaoPorDia.clear()
}

/**
 * Cotação de um dia: a do próprio dia; senão a mais recente ANTES dele.
 *
 * A busca é "<= dia, mais recente primeiro" porque cotação de dia futuro
 * não pode valer para o passado — usar a de amanhã para converter ontem
 * seria inventar informação que não existia no momento do faturamento.
 */
export async function getRatesForDay(day: string): Promise<Cotacao | null> {
  const alvo = day.slice(0, 10)
  const hoje = diaUtc(new Date())
  if (alvo !== hoje && cotacaoPorDia.has(alvo)) return cotacaoPorDia.get(alvo) ?? null

  let resultado: Cotacao | null = null
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("exchange_rate_daily")
      .select("day, rates")
      .lte("day", alvo)
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error && data?.rates) {
      resultado = {
        rates: data.rates as Record<string, number>,
        day: String(data.day).slice(0, 10),
        approximate: String(data.day).slice(0, 10) !== alvo,
      }
    }
  } catch (e) {
    log.warn("[ExchangeRate] histórico diário indisponível", { day: alvo, erro: String(e) })
  }

  // Antes do início do histórico (ou tabela ainda sem a migration) sobra
  // a cotação corrente — declarada como aproximada, nunca como exata.
  if (!resultado) {
    const corrente = await cotacaoCorrente()
    if (corrente) resultado = { ...corrente, approximate: corrente.day !== alvo }
  }

  if (alvo !== hoje) cotacaoPorDia.set(alvo, resultado)
  return resultado
}

/**
 * Cotação FRESCA direto do provedor, com a metainformação dele.
 *
 * Existe para o cron diário: ali queremos a cotação do dia, não o que
 * estiver no cache de 1 h. Não mexe em `memoryCache` — o cron não deve
 * influenciar o que as telas estão servindo.
 */
export async function getLatestRatesForSnapshot(): Promise<{
  rates: Record<string, number>
  provider: string
  providerUpdatedAt: string | null
} | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(API_URL, { signal: controller.signal, cache: "no-store" })
    clearTimeout(timeout)
    if (!response.ok) {
      log.warn("[ExchangeRate] snapshot: API respondeu", { status: response.status })
      return null
    }
    const data = (await response.json()) as {
      result: string
      rates: Record<string, number>
      provider?: string
      time_last_update_utc?: string
    }
    if (data.result !== "success" || !data.rates) return null
    return {
      rates: data.rates,
      provider: data.provider ?? "open.er-api.com",
      providerUpdatedAt: data.time_last_update_utc
        ? new Date(data.time_last_update_utc).toISOString()
        : null,
    }
  } catch (e) {
    log.warn("[ExchangeRate] snapshot falhou", { erro: String(e) })
    return null
  }
}

/**
 * Guarda a cotação de hoje no histórico. Idempotente por dia.
 *
 * Chamada de dentro do fetch (oportunista: quem já foi buscar a cotação
 * grava de graça) e pelo cron diário — que existe porque um dia sem
 * NENHUMA visita ao dashboard não teria linha, e o buraco só apareceria
 * meses depois, na conversão de um período antigo.
 */
export async function snapshotDailyRates(
  rates: Record<string, number>,
  meta?: { provider?: string; providerUpdatedAt?: string | null },
): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from("exchange_rate_daily").upsert(
      {
        day: diaUtc(new Date()),
        base: "BRL",
        rates,
        provider: meta?.provider ?? "open.er-api.com",
        provider_updated_at: meta?.providerUpdatedAt ?? null,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "day" },
    )
    if (error) log.warn("[ExchangeRate] não gravou o histórico do dia", { message: error.message })
  } catch (e) {
    // Best-effort: o histórico é para o futuro, não pode derrubar a
    // conversão de agora.
    log.warn("[ExchangeRate] falha ao gravar histórico diário", { erro: String(e) })
  }
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
      provider?: string
      time_last_update_utc?: string
    }

    if (data.result !== "success" || !data.rates) {
      log.warn("[ExchangeRate] API returned unexpected format")
      cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS
      return memoryCache
    }

    memoryCache = { rates: data.rates, fetchedAt: Date.now() }
    log.info(`[ExchangeRate] Fetched ${Object.keys(data.rates).length} rates from API`)

    // Histórico do dia, de graça: quem já pagou a chamada grava a linha.
    // `time_last_update_utc` é do PROVEDOR — o feed gratuito atualiza uma
    // vez por dia, então sem ele não dá para distinguir "cotação de hoje"
    // de "cotação de ontem lida hoje".
    //
    // AWAIT, não `void`: promise solta em serverless morre quando o
    // processo congela depois da resposta (foi assim que os eventos de
    // conversão da Meta se perderam). O custo é um upsert a mais no
    // caminho da 1a conversão depois do cache expirar — uma vez por hora.
    await snapshotDailyRates(data.rates, {
      provider: data.provider ?? "open.er-api.com",
      providerUpdatedAt: data.time_last_update_utc
        ? new Date(data.time_last_update_utc).toISOString()
        : null,
    })

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
