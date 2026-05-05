/**
 * Omnisend API Client
 *
 * Single source of truth for all Omnisend API communication.
 * Follows the same pattern as the Klaviyo client (client.ts).
 *
 * Omnisend API docs: https://api-docs.omnisend.com/reference/overview
 *   - Auth: X-API-KEY header
 *   - Rate limit: 400 req/min (headers: X-Rate-Limit-*)
 *   - Base: https://api.omnisend.com
 *   - Versions: v3 (campaigns, automations, orders) / v5 (contacts, brands)
 */

import { logger } from "@/lib/logger"

const log = logger.child("OmnisendClient")

// ── Error classes ────────────────────���────────────────────

export class OmnisendRateLimitError extends Error {
  public retryAfterMs: number
  constructor(retryAfterMs: number) {
    super(`Omnisend rate limited (Retry-After: ${retryAfterMs}ms)`)
    this.name = "OmnisendRateLimitError"
    this.retryAfterMs = retryAfterMs
  }
}

export class OmnisendInvalidKeyError extends Error {
  constructor(detail: string) {
    super(`Omnisend API key is invalid: ${detail}`)
    this.name = "OmnisendInvalidKeyError"
  }
}

export class OmnisendPermissionError extends Error {
  constructor(detail: string) {
    super(`Omnisend permission error: ${detail}`)
    this.name = "OmnisendPermissionError"
  }
}

// ── Constants ─────────────────────────────────────────────

export const OMNISEND_API_BASE = "https://api.omnisend.com"
export const OMNISEND_V3 = `${OMNISEND_API_BASE}/v3`
export const OMNISEND_V5 = `${OMNISEND_API_BASE}/v5`
export const OMNISEND_API = `${OMNISEND_API_BASE}/api`

/** Rate limit global documentado: 400 req/min (≈150ms entre requests).
 *  https://api-docs.omnisend.com/reference/rate-limit-timeouts-errors
 *  NOTE: OMNISEND_CAMPAIGNS_INTERVAL_MS (1100ms) e defesa EMPIRICA para 429
 *  observados em /v3/campaigns — NAO ha documentacao oficial de tier
 *  "1 RPS per Client". Manter como workaround ate confirmar com a Omnisend. */
const MIN_REQUEST_INTERVAL_MS = 160
export const OMNISEND_CAMPAIGNS_INTERVAL_MS = 1100
const MAX_RETRY_AFTER_MS = 120_000
const OMNISEND_FETCH_TIMEOUT_MS = 15_000
const MAX_RETRIES = 3

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ── Simple rate limiter (per API key) ─────────────────────

const lastRequestTime = new Map<string, number>()

async function waitForRateLimit(apiKey: string): Promise<void> {
  const keyHash = apiKey.slice(-8)
  const last = lastRequestTime.get(keyHash) || 0
  const elapsed = Date.now() - last
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed)
  }
  lastRequestTime.set(keyHash, Date.now())
}

// ── Statistics/Reports API rate limiter (mais restrito) ──
//
// Limites oficiais confirmados pelo suporte da Omnisend (2026-05-05):
//   - 10 requests POR MINUTO
//   - 55 requests POR DIA (por brand, ou seja, por API key)
//
// Esses limites sao ESPECIFICOS para /api/analytics/statistics e
// /api/analytics/reports — outros endpoints (/v3, /v5, /api/segments)
// usam o rate limit global de 400/min ja coberto por waitForRateLimit.
//
// Estrategia (recomendada pelo suporte):
//   - Throttle: 6.5s entre calls (~9.2/min, dentro de 10/min)
//   - Limite diario: contador in-memory por keyHash + reset em UTC
//   - Backoff: 30s -> 60s -> 120s nos 429 (em vez de Retry-After cego)
//
// IMPORTANTE: o contador diario reseta em UTC. Se Lambda reciclar,
// o contador zera prematuramente. Para controle robusto producao
// real, mover pra Supabase. Por ora, in-memory ja reduz drasticamente
// o burn de budget vs nao ter nada.
const STATS_MIN_INTERVAL_MS = 6_500          // ~9.2/min, abaixo do 10/min limit
const STATS_DAILY_LIMIT = 50                 // 55 oficial - 5 buffer pra retries
const STATS_BACKOFF_SCHEDULE_MS = [30_000, 60_000, 120_000]

interface StatsRateLimitState {
  lastCallAt: number
  todayCount: number
  todayResetAt: number  // timestamp da meianoite UTC seguinte
}

const statsRateLimit = new Map<string, StatsRateLimitState>()

function getNextUtcMidnight(): number {
  const now = new Date()
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0))
  return utc.getTime()
}

/** Aguarda interval entre calls + verifica limite diario.
 *  Throw OmnisendRateLimitError se ja batemos limite diario. */
async function waitForStatsRateLimit(apiKey: string): Promise<void> {
  const keyHash = apiKey.slice(-8)
  const now = Date.now()
  let state = statsRateLimit.get(keyHash)
  if (!state) {
    state = { lastCallAt: 0, todayCount: 0, todayResetAt: getNextUtcMidnight() }
    statsRateLimit.set(keyHash, state)
  }

  // Reset diario em UTC midnight
  if (now >= state.todayResetAt) {
    state.todayCount = 0
    state.todayResetAt = getNextUtcMidnight()
  }

  // Limite diario — falhar rapido em vez de chamar API
  if (state.todayCount >= STATS_DAILY_LIMIT) {
    const msUntilReset = state.todayResetAt - now
    throw new OmnisendRateLimitError(msUntilReset)
  }

  // Throttle interval
  const elapsed = now - state.lastCallAt
  if (elapsed < STATS_MIN_INTERVAL_MS) {
    await sleep(STATS_MIN_INTERVAL_MS - elapsed)
  }
  state.lastCallAt = Date.now()
  state.todayCount++
}

/** Backoff progressivo do schedule recomendado pelo suporte.
 *  attempt 0 = 30s, 1 = 60s, 2 = 120s. */
export function getStatsBackoffMs(attempt: number): number {
  return STATS_BACKOFF_SCHEDULE_MS[Math.min(attempt, STATS_BACKOFF_SCHEDULE_MS.length - 1)]
}

/** Indica se o endpoint usa o rate limit restrito da Statistics/Reports API. */
function isStatsEndpoint(url: string): boolean {
  return url.includes("/api/analytics/statistics") || url.includes("/api/analytics/reports")
}

// ── Main request function ─────────────────────────────────

/**
 * Make an authenticated request to the Omnisend API.
 *
 * @param apiKey - Omnisend API key
 * @param endpoint - Relative path like "/v3/campaigns" or full URL
 * @param options - Method, body, logTag
 * @returns Parsed JSON response or null on non-retryable errors
 */
export async function omnisendRequest<T>(
  apiKey: string,
  endpoint: string,
  options?: {
    method?: "GET" | "POST" | "PATCH" | "PUT"
    body?: Record<string, unknown>
    logTag?: string
    /** Override da versao da Omnisend API — util para /api/analytics/statistics
     *  que o Ryan validou usando `2026-preview` especificamente. Default
     *  `2026-03-15` funciona para todos os outros endpoints. */
    omnisendVersion?: string
    /** Estilo de autenticacao:
     *   - "default" (padrao): envia X-API-KEY + Authorization + Omnisend-Version.
     *     Cobre /v3/* e /v5/* legacy (que exigem X-API-KEY).
     *   - "bearer": envia APENAS Authorization + Omnisend-Version.
     *     Obrigatorio para /api/analytics/statistics — a Statistics API
     *     rejeita silenciosamente (retorna rows vazias/0) quando recebe
     *     X-API-KEY junto com Authorization. Validado via curl do Ryan em
     *     22/04 com Azzurro Milano: retornou €371k total + €12.853
     *     attributed usando SOMENTE Authorization. */
    authStyle?: "default" | "bearer"
  }
): Promise<T | null> {
  const { method = "GET", body, logTag = "Omnisend", omnisendVersion = "2026-03-15", authStyle = "default" } = options || {}
  const url = endpoint.startsWith("http") ? endpoint : `${OMNISEND_API_BASE}${endpoint}`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(1500 * Math.pow(2, attempt - 1), 16000)
      log.info(`[${logTag}] Retry ${attempt}/${MAX_RETRIES} - waiting ${backoff}ms`)
      await sleep(backoff)
    }

    // Statistics/Reports API tem rate limit MUITO mais restrito (10/min,
    // 55/dia/brand). Endpoints comuns (/v3, /v5, /api/segments) usam o
    // rate limiter global de 400/min.
    if (isStatsEndpoint(url)) {
      try {
        await waitForStatsRateLimit(apiKey)
      } catch (err) {
        if (err instanceof OmnisendRateLimitError) {
          log.warn(`[${logTag}] Stats rate limit DAILY exhausted (${STATS_DAILY_LIMIT}/day), throwing`, {
            retryAfterMs: err.retryAfterMs,
          })
          throw err
        }
        throw err
      }
    } else {
      await waitForRateLimit(apiKey)
    }

    try {
      // Omnisend aceita multiplas formas de auth, mas a combinacao delas
      // nao e universalmente aceita:
      //   /v3/* e /v5/* legacy:           exigem X-API-KEY
      //   /v5/segments e /api/*:          exigem Authorization + Omnisend-Version
      //   /api/analytics/statistics:      SO aceita Authorization sozinho —
      //     se receber X-API-KEY junto, retorna 200 com rows vazias (sem erro,
      //     revenue fica zerado silenciosamente). Por isso authStyle="bearer".
      const baseHeaders: Record<string, string> = {
        "Authorization": `Omnisend-API-Key ${apiKey}`,
        "Omnisend-Version": omnisendVersion,
        "Accept": "application/json",
        "Content-Type": "application/json",
      }
      if (authStyle === "default") {
        baseHeaders["X-API-KEY"] = apiKey
      }
      const response = await fetch(url, {
        method,
        headers: baseHeaders,
        ...(body && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(OMNISEND_FETCH_TIMEOUT_MS),
      })

      log.info(`[${logTag}] ${method} ${endpoint} → ${response.status}`)

      // ── Rate limiting (429) ───────────────────────────
      if (response.status === 429) {
        const resetHeader = response.headers.get("X-Rate-Limit-Reset")
        const rawWaitTime = resetHeader ? parseInt(resetHeader) * 1000 : 2000

        // Para Statistics/Reports API, usa o backoff progressivo
        // recomendado pelo suporte (30s -> 60s -> 120s) em vez de
        // confiar em Retry-After (que pode ser absurdamente alto, ate 24h)
        const isStats = isStatsEndpoint(url)
        const waitTime = isStats ? getStatsBackoffMs(attempt) : rawWaitTime

        if (waitTime > MAX_RETRY_AFTER_MS && !isStats) {
          log.warn(`[${logTag}] Rate limited ${waitTime}ms (>${MAX_RETRY_AFTER_MS}ms cap). Deferring.`)
          throw new OmnisendRateLimitError(waitTime)
        }

        log.warn(`[${logTag}] Rate limited. Waiting ${waitTime}ms ${isStats ? "(stats backoff)" : ""} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`)
        if (attempt < MAX_RETRIES) {
          await sleep(waitTime + 500)
          continue
        }
        throw new OmnisendRateLimitError(waitTime)
      }

      // ── Server errors (5xx) ─────────────────────────���─
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        log.warn(`[${logTag}] Server error ${response.status}, retrying...`)
        continue
      }

      const responseText = await response.text()

      if (!response.ok) {
        if (response.status === 401) {
          log.error(`[${logTag}] 401 Unauthorized — invalid API key`)
          throw new OmnisendInvalidKeyError("API key is invalid or expired")
        }

        if (response.status === 403) {
          log.error(`[${logTag}] 403 Forbidden`)
          throw new OmnisendPermissionError("Insufficient permissions for this endpoint")
        }

        if (response.status === 404) {
          log.info(`[${logTag}] 404 Not Found — endpoint or resource does not exist`)
          return null
        }

        log.error(`[${logTag}] API ERROR ${response.status}:`, responseText.substring(0, 500))
        return null
      }

      const data = JSON.parse(responseText) as T
      return data
    } catch (error) {
      if (
        error instanceof OmnisendRateLimitError ||
        error instanceof OmnisendInvalidKeyError ||
        error instanceof OmnisendPermissionError
      ) {
        throw error
      }

      if (error instanceof Error && error.name === "AbortError") {
        log.error(`[${logTag}] TIMEOUT after ${OMNISEND_FETCH_TIMEOUT_MS}ms: ${endpoint}`)
        if (attempt < MAX_RETRIES) continue
        return null
      }

      if (error instanceof TypeError && error.message.includes("ByteString")) {
        throw new OmnisendInvalidKeyError("Non-ASCII character in API key")
      }

      log.error(`[${logTag}] REQUEST ERROR:`, error)
      if (attempt < MAX_RETRIES) continue
      return null
    }
  }

  return null
}

// ── Pagination helpers ────────────────────────────────────

/**
 * Paginate through an Omnisend v5 list endpoint (cursor-based).
 *
 * Omnisend v5 returns `paging.next` as a FULL URL with an opaque cursor
 * embedded in it. We follow that URL directly instead of building
 * offset-based query params.
 *
 * Returns all items and the total count of pages fetched. Stops at
 * `maxPages` for safety (default 200 pages ≈ 50k items with limit=250).
 */
export async function omnisendPaginateV5<TItem>(
  apiKey: string,
  basePath: string,
  itemsKey: string,
  options?: {
    logTag?: string
    maxPages?: number
    limit?: number
    queryParams?: Record<string, string>
  }
): Promise<TItem[]> {
  const { logTag = "Omnisend", maxPages = 200, limit = 250, queryParams = {} } = options || {}
  const allItems: TItem[] = []

  const initialParams = new URLSearchParams({ ...queryParams, limit: String(limit) })
  let url: string | null = `${basePath}${basePath.includes("?") ? "&" : "?"}${initialParams}`

  for (let page = 0; page < maxPages && url; page++) {
    const response: Record<string, unknown> | null = await omnisendRequest<Record<string, unknown>>(apiKey, url, { logTag })
    if (!response) break

    const items = (response[itemsKey] as TItem[]) || []
    allItems.push(...items)

    const paging = response.paging as { next?: string; previous?: string } | undefined
    url = paging?.next || null
    if (!url) break
  }

  return allItems
}

/**
 * Paginate through an Omnisend v3 list endpoint.
 * Omnisend v3 uses offset/limit pagination with a `paging` object.
 */
export async function omnisendPaginateV3<TItem>(
  apiKey: string,
  basePath: string,
  itemsKey: string,
  options?: {
    logTag?: string
    maxPages?: number
    limit?: number
    queryParams?: Record<string, string>
    /** Intervalo minimo entre paginas. Usar OMNISEND_CAMPAIGNS_INTERVAL_MS
     *  (1100ms) para endpoints de tier "1 RPS per Client" como /v3/campaigns. */
    intervalMs?: number
  }
): Promise<TItem[]> {
  const { logTag = "Omnisend", maxPages = 20, limit = 250, queryParams = {}, intervalMs } = options || {}
  const allItems: TItem[] = []
  let offset = 0

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      ...queryParams,
      limit: String(limit),
      offset: String(offset),
    })
    const url = `${basePath}?${params}`

    const response = await omnisendRequest<Record<string, unknown>>(apiKey, url, { logTag })
    if (!response) break

    const items = (response[itemsKey] as TItem[]) || []
    allItems.push(...items)

    // Check paging
    const paging = response.paging as { next?: string } | undefined
    if (!paging?.next || items.length < limit) break

    offset += items.length

    // Respeita tier de rate limit especifico do endpoint (alguns sao 1 RPS)
    if (intervalMs && intervalMs > MIN_REQUEST_INTERVAL_MS) {
      await sleep(intervalMs - MIN_REQUEST_INTERVAL_MS)
    }
  }

  return allItems
}
