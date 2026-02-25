import { NextRequest } from "next/server"

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key)
    }
  }
}, 5 * 60 * 1000)

interface RateLimitOptions {
  /** Max requests allowed in the window */
  limit: number
  /** Window size in seconds */
  windowSeconds: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

export function rateLimit(
  request: NextRequest,
  keyPrefix: string,
  options: RateLimitOptions
): RateLimitResult {
  const ip = getClientIp(request)
  const key = `${keyPrefix}:${ip}`
  const now = Date.now()

  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    // New window
    store.set(key, { count: 1, resetAt: now + options.windowSeconds * 1000 })
    return { allowed: true, remaining: options.limit - 1, resetAt: now + options.windowSeconds * 1000 }
  }

  entry.count++

  if (entry.count > options.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  return { allowed: true, remaining: options.limit - entry.count, resetAt: entry.resetAt }
}

/** Check rate limit and return 429 Response if exceeded, or null if allowed */
export function checkRateLimit(
  request: NextRequest,
  keyPrefix: string,
  options: RateLimitOptions
): Response | null {
  const result = rateLimit(request, keyPrefix, options)
  if (!result.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
        },
      }
    )
  }
  return null
}

// Pre-configured rate limiters for common use cases
export const RATE_LIMITS = {
  /** Auth endpoints: 10 requests per minute */
  auth: { limit: 10, windowSeconds: 60 },
  /** Webhook endpoints: 100 requests per minute */
  webhook: { limit: 100, windowSeconds: 60 },
  /** Admin endpoints: 30 requests per minute */
  admin: { limit: 30, windowSeconds: 60 },
  /** Migration endpoints: 3 requests per minute */
  migration: { limit: 3, windowSeconds: 60 },
  /** Public onboarding form: 3 requests per hour */
  publicForm: { limit: 3, windowSeconds: 3600 },
  /** Public file upload: 10 requests per hour */
  publicUpload: { limit: 10, windowSeconds: 3600 },
} as const
