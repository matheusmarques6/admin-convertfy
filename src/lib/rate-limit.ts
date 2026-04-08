import { NextRequest } from "next/server"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// ---------------------------------------------------------------------------
// Redis client — fail-open if not configured (dev local) or unavailable
// ---------------------------------------------------------------------------

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RateLimitOptions {
  /** Max requests allowed in the window */
  limit: number
  /** Window size in seconds */
  windowSeconds: number
  /**
   * When true and Redis is unavailable in production, return 503 instead of
   * allowing the request.  Use for auth endpoints where fail-open would
   * remove brute-force protection.
   *
   * In development (no Redis configured) requests are always allowed
   * regardless of this flag.
   */
  failClosed?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

/**
 * Build (or reuse) an Upstash Ratelimit instance for the given options.
 * Cached per "limit:window" combo to avoid recreating on every call.
 */
const limiterCache = new Map<string, Ratelimit>()

function getLimiter(options: RateLimitOptions): Ratelimit | null {
  if (!redis) return null

  const cacheKey = `${options.limit}:${options.windowSeconds}`
  let limiter = limiterCache.get(cacheKey)
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(
        options.limit,
        `${options.windowSeconds} s`
      ),
      prefix: "rl",
    })
    limiterCache.set(cacheKey, limiter)
  }
  return limiter
}

// ---------------------------------------------------------------------------
// Main API — async, fail-open
// ---------------------------------------------------------------------------

/**
 * Check rate limit and return a 429 Response if exceeded, or null if allowed.
 *
 * Fail-open behaviour:
 *  - If Redis is not configured (dev local): allows the request, logs once.
 *  - If Redis is unavailable at runtime: allows the request, logs warning.
 */
export async function checkRateLimit(
  request: NextRequest,
  keyPrefix: string,
  options: RateLimitOptions,
  extraHeaders?: Record<string, string>
): Promise<Response | null> {
  const limiter = getLimiter(options)

  if (!limiter) {
    // No Redis configured — in dev this is expected, always allow.
    // In production with failClosed, return 503 instead of silently allowing.
    const isDev =
      process.env.NODE_ENV !== "production" ||
      !process.env.UPSTASH_REDIS_REST_URL

    if (isDev) {
      console.debug(
        `[rate-limit] Redis not configured — skipping rate limit for ${keyPrefix}`
      )
      return null
    }

    // Production but Redis not configured
    if (options.failClosed) {
      console.error(
        "[rate-limit] Rate limiting unavailable for fail-closed endpoint",
        { keyPrefix }
      )
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      )
    }

    console.warn(
      `[rate-limit] Redis not configured in production — skipping rate limit for ${keyPrefix}`
    )
    return null
  }

  try {
    const ip = getClientIp(request)
    const identifier = `${keyPrefix}:${ip}`
    const { success, reset } = await limiter.limit(identifier)

    if (!success) {
      const retryAfter = Math.max(
        1,
        Math.ceil((reset - Date.now()) / 1000)
      )
      console.warn(
        `[rate-limit] 429 — ${keyPrefix} ip=${ip} retry_after=${retryAfter}s`
      )
      return new Response(
        JSON.stringify({ error: "Too many requests. Try again later." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
            ...extraHeaders,
          },
        }
      )
    }

    return null
  } catch (err) {
    // If Redis is down and this is a fail-closed endpoint, return 503
    if (options.failClosed) {
      console.error(
        "[rate-limit] Rate limiting unavailable for fail-closed endpoint",
        {
          keyPrefix,
          error: err instanceof Error ? err.message : String(err),
        }
      )
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      )
    }

    // Fail-open: if Redis is down, allow the request
    console.warn("[rate-limit] Redis error — allowing request (fail-open)", {
      keyPrefix,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ---------------------------------------------------------------------------
// Pre-configured rate limits
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
  /** Auth endpoints: 10 requests per minute */
  auth: { limit: 10, windowSeconds: 60 },
  /** Webhook endpoints: 100 requests per minute */
  webhook: { limit: 100, windowSeconds: 60 },
  /** Admin endpoints: 30 requests per minute */
  admin: { limit: 30, windowSeconds: 60 },
  /** Migration endpoints: 3 requests per minute */
  migration: { limit: 3, windowSeconds: 60 },
  /** Cliente onboarding form: 3 requests per hour */
  clienteForm: { limit: 3, windowSeconds: 3600 },
  /** Cliente file upload: 10 requests per hour */
  clienteUpload: { limit: 10, windowSeconds: 3600 },
  /** Public onboarding form: 3 requests per hour */
  publicForm: { limit: 3, windowSeconds: 3600 },
  /** Public file upload: 10 requests per hour */
  publicUpload: { limit: 10, windowSeconds: 3600 },
} as const
