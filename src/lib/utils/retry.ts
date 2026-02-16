import { logger } from "@/lib/logger"

const log = logger.child("RetryUtil")

export interface RetryOptions {
  /** Maximum number of retries (default: 3) */
  maxRetries?: number
  /** Base delay in ms for exponential backoff (default: 1500) */
  baseDelay?: number
  /** Maximum delay in ms (default: 16000) */
  maxDelay?: number
  /** Custom predicate to decide whether to retry based on response (default: 429 + 5xx) */
  retryOn?: (response: Response) => boolean
  /** Optional callback on each retry */
  onRetry?: (attempt: number, delay: number) => void
  /** AbortSignal to cancel retries */
  signal?: AbortSignal
}

const DEFAULTS = {
  maxRetries: 3,
  baseDelay: 1500,
  maxDelay: 16000,
}

/** Add ±25% jitter to avoid thundering herd */
function jitter(delay: number): number {
  return delay * (0.75 + Math.random() * 0.5)
}

/** Parse Retry-After header: seconds (integer) or HTTP-date */
function parseRetryAfter(value: string): number | null {
  const seconds = Number(value)
  if (!Number.isNaN(seconds) && seconds >= 0) return seconds * 1000

  const date = Date.parse(value)
  if (!Number.isNaN(date)) {
    const ms = date - Date.now()
    return ms > 0 ? ms : 0
  }

  return null
}

/**
 * fetch() wrapper with exponential backoff retry logic.
 *
 * - Retries on 429 (rate limit), respecting Retry-After header
 * - Retries on 5xx server errors
 * - Exponential backoff: baseDelay * 2^(attempt-1), capped at maxDelay
 * - Returns the response (even if failed) after all retries are exhausted
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: RetryOptions
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? DEFAULTS.maxRetries
  const baseDelay = options?.baseDelay ?? DEFAULTS.baseDelay
  const maxDelay = options?.maxDelay ?? DEFAULTS.maxDelay
  const signal = options?.signal

  const shouldRetry =
    options?.retryOn ??
    ((res: Response) => res.status === 429 || res.status >= 500)

  let lastResponse: Response | undefined
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    signal?.throwIfAborted()

    try {
      const response = await fetch(url, { ...init, signal })

      if (!shouldRetry(response) || attempt === maxRetries) {
        return response
      }

      lastResponse = response

      // Respect Retry-After header for 429
      let delay: number
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after")
        delay = retryAfter ? (parseRetryAfter(retryAfter) ?? baseDelay) : baseDelay
      } else {
        delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
      }

      delay = jitter(delay)

      log.warn(`Retry ${attempt + 1}/${maxRetries} for ${init?.method ?? "GET"} ${url} (${response.status}) — waiting ${Math.round(delay)}ms`)
      options?.onRetry?.(attempt + 1, delay)
      await new Promise(resolve => setTimeout(resolve, delay))
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? new Error("Aborted")

      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt === maxRetries) {
        log.error(`All ${maxRetries} retries failed for ${url}`, { error: lastError.message })
        throw lastError
      }

      const delay = jitter(Math.min(baseDelay * Math.pow(2, attempt), maxDelay))
      log.warn(`Retry ${attempt + 1}/${maxRetries} for ${url} (network error) — waiting ${Math.round(delay)}ms`)
      options?.onRetry?.(attempt + 1, delay)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  // Should not reach here, but satisfy TypeScript
  if (lastResponse) return lastResponse
  throw lastError ?? new Error("fetchWithRetry: unexpected state")
}

/**
 * Generic async retry wrapper for non-fetch operations.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Pick<RetryOptions, "maxRetries" | "baseDelay" | "maxDelay" | "onRetry" | "signal">
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULTS.maxRetries
  const baseDelay = options?.baseDelay ?? DEFAULTS.baseDelay
  const maxDelay = options?.maxDelay ?? DEFAULTS.maxDelay
  const signal = options?.signal

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    signal?.throwIfAborted()

    try {
      return await fn()
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? new Error("Aborted")

      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt === maxRetries) {
        log.error(`All ${maxRetries} retries exhausted`, { error: lastError.message })
        throw lastError
      }

      const delay = jitter(Math.min(baseDelay * Math.pow(2, attempt), maxDelay))
      log.warn(`Retry ${attempt + 1}/${maxRetries} — waiting ${Math.round(delay)}ms`, { error: lastError.message })
      options?.onRetry?.(attempt + 1, delay)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError ?? new Error("withRetry: unexpected state")
}
