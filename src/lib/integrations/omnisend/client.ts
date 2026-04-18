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
/** Statistics API batch — saiu do Beta em 2026-03-15 (GA) */
export const OMNISEND_V2026 = `${OMNISEND_API_BASE}/v2026-03-15`

/** Rate limit global: 400 req/min ≈ 150ms minimo entre requests.
 *  Atencao: endpoint /v3/campaigns esta em tier "1 RPS per Client" — usar
 *  OMNISEND_CAMPAIGNS_INTERVAL_MS para operacoes contra esse endpoint. */
const MIN_REQUEST_INTERVAL_MS = 160
export const OMNISEND_CAMPAIGNS_INTERVAL_MS = 1100
const MAX_RETRY_AFTER_MS = 10_000
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
  }
): Promise<T | null> {
  const { method = "GET", body, logTag = "Omnisend" } = options || {}
  const url = endpoint.startsWith("http") ? endpoint : `${OMNISEND_API_BASE}${endpoint}`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(1500 * Math.pow(2, attempt - 1), 16000)
      log.info(`[${logTag}] Retry ${attempt}/${MAX_RETRIES} - waiting ${backoff}ms`)
      await sleep(backoff)
    }

    await waitForRateLimit(apiKey)

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "X-API-KEY": apiKey,
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        ...(body && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(OMNISEND_FETCH_TIMEOUT_MS),
      })

      log.info(`[${logTag}] ${method} ${endpoint} → ${response.status}`)

      // ── Rate limiting (429) ───────────────────────────
      if (response.status === 429) {
        const resetHeader = response.headers.get("X-Rate-Limit-Reset")
        const rawWaitTime = resetHeader ? parseInt(resetHeader) * 1000 : 2000

        if (rawWaitTime > MAX_RETRY_AFTER_MS) {
          log.warn(`[${logTag}] Rate limited ${rawWaitTime}ms (>${MAX_RETRY_AFTER_MS}ms cap). Throwing.`)
          throw new OmnisendRateLimitError(rawWaitTime)
        }

        log.warn(`[${logTag}] Rate limited. Waiting ${rawWaitTime}ms`)
        if (attempt < MAX_RETRIES) {
          await sleep(rawWaitTime)
          continue
        }
        throw new OmnisendRateLimitError(rawWaitTime)
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
