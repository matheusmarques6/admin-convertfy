/**
 * Rate limit em memoria pro endpoint /api/ai/chat.
 *
 * Janela deslizante por user (timestamps das ultimas requests). Como
 * roda em serverless, cada lambda tem seu proprio Map — nao protege
 * 100% contra abuso distribuido, mas previne spam acidental e da um
 * sinal claro quando user ta consumindo demais.
 *
 * Pra protecao forte multi-instancia, trocar por Upstash Redis depois.
 */

const WINDOW_MS = 60_000 // 1 minuto
const MAX_REQUESTS = 15 // 15 msgs/min por user

const buckets = new Map<string, number[]>()

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

export function checkAiRateLimit(userId: string): RateLimitResult {
  const now = Date.now()
  const cutoff = now - WINDOW_MS
  const arr = (buckets.get(userId) ?? []).filter((t) => t > cutoff)
  if (arr.length >= MAX_REQUESTS) {
    const oldest = arr[0]
    const retryAfterSec = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000))
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec,
    }
  }
  arr.push(now)
  buckets.set(userId, arr)
  return {
    allowed: true,
    remaining: MAX_REQUESTS - arr.length,
    retryAfterSec: 0,
  }
}
