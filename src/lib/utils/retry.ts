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
}

const DEFAULTS = {
  maxRetries: 3,
  baseDelay: 1500,
  maxDelay: 16000,
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

  const shouldRetry =
    options?.retryOn ??
    ((res: Response) => res.status === 429 || res.status >= 500)

  let lastResponse: Response | undefined
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init)

      if (!shouldRetry(response) || attempt === maxRetries) {
        return response
      }

      lastResponse = response

      // Respect Retry-After header for 429
      let delay: number
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after")
        delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : baseDelay
      } else {
        delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
      }

      log.warn(`Retry ${attempt + 1}/${maxRetries} for ${init?.method ?? "GET"} ${url} (${response.status}) — waiting ${delay}ms`)
      options?.onRetry?.(attempt + 1, delay)
      await new Promise(resolve => setTimeout(resolve, delay))
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt === maxRetries) {
        log.error(`All ${maxRetries} retries failed for ${url}`, { error: lastError.message })
        throw lastError
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
      log.warn(`Retry ${attempt + 1}/${maxRetries} for ${url} (network error) — waiting ${delay}ms`)
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
  options?: Pick<RetryOptions, "maxRetries" | "baseDelay" | "maxDelay" | "onRetry">
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULTS.maxRetries
  const baseDelay = options?.baseDelay ?? DEFAULTS.baseDelay
  const maxDelay = options?.maxDelay ?? DEFAULTS.maxDelay

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt === maxRetries) {
        log.error(`All ${maxRetries} retries exhausted`, { error: lastError.message })
        throw lastError
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
      log.warn(`Retry ${attempt + 1}/${maxRetries} — waiting ${delay}ms`, { error: lastError.message })
      options?.onRetry?.(attempt + 1, delay)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError ?? new Error("withRetry: unexpected state")
}
