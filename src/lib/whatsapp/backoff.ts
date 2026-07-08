/**
 * Exponential backoff com jitter (estratégia AWS) — portado do worder.
 * Usado pelo client da Cloud API pra retry de rate limit/5xx da Meta.
 */

export interface BackoffOptions {
  baseDelay?: number // Delay inicial em ms (default: 1000)
  maxDelay?: number // Delay máximo em ms (default: 30000)
  maxRetries?: number // Tentativas máximas (default: 5)
  jitter?: "full" | "equal" | "decorrelated" | "none"
}

export interface RetryOptions extends BackoffOptions {
  shouldRetry?: (error: unknown, attempt: number) => boolean
  onRetry?: (error: unknown, attempt: number, delay: number) => void
  /**
   * Substitui o delay calculado quando retornado. Útil pra honrar Retry-After
   * (Meta envia em segundos no header em 429). Retornar undefined cai no
   * cálculo normal de jitter. Resultado é clampado por maxDelay.
   */
  getDelayOverride?: (error: unknown, attempt: number) => number | undefined
}

export function calculateBackoff(attempt: number, options: BackoffOptions = {}): number {
  const { baseDelay = 1000, maxDelay = 30000, jitter = "decorrelated" } = options

  let delay: number

  switch (jitter) {
    case "none":
      delay = baseDelay * Math.pow(2, attempt - 1)
      break

    case "full":
      delay = Math.random() * baseDelay * Math.pow(2, attempt - 1)
      break

    case "equal": {
      const temp = baseDelay * Math.pow(2, attempt - 1)
      delay = temp / 2 + Math.random() * (temp / 2)
      break
    }

    case "decorrelated":
    default:
      // Decorrelated jitter: sleep = min(cap, random(base, sleep * 3))
      if (attempt === 1) {
        delay = baseDelay + Math.random() * baseDelay
      } else {
        const prevDelay = calculateBackoff(attempt - 1, { ...options, jitter: "decorrelated" })
        delay = Math.random() * (prevDelay * 3 - baseDelay) + baseDelay
      }
      break
  }

  return Math.min(Math.round(delay), maxDelay)
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = 5,
    baseDelay = 1000,
    maxDelay = 30000,
    jitter = "decorrelated",
    shouldRetry = defaultShouldRetry,
    onRetry,
    getDelayOverride,
  } = options

  let lastError: unknown

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (!shouldRetry(error, attempt) || attempt === maxRetries) {
        throw error
      }

      const override = getDelayOverride?.(error, attempt)
      const delay =
        override !== undefined
          ? Math.min(Math.round(override), maxDelay)
          : calculateBackoff(attempt, { baseDelay, maxDelay, jitter })

      onRetry?.(error, attempt, delay)

      await sleep(delay)
    }
  }

  throw lastError
}

/** Retry default: erros de rede, rate limit da Meta e 5xx. */
function defaultShouldRetry(error: unknown, _attempt: number): boolean {
  const err = error as { code?: unknown; status?: number; message?: string }

  if (err.code === "ETIMEDOUT" || err.code === "ECONNRESET" || err.code === "ENOTFOUND") {
    return true
  }

  // Rate limits da Meta
  const rateLimitCodes = [429, "429", 80007, "80007", 130429, "130429", 131056, "131056"]
  if (rateLimitCodes.includes(err.code as never)) return true

  if (typeof err.status === "number" && err.status >= 500 && err.status < 600) return true

  if (err.message?.includes("fetch failed")) return true
  if (err.message?.includes("network")) return true

  return false
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
