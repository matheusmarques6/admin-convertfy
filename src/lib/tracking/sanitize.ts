/**
 * Sanitization utilities for PostgREST filter safety.
 * Used by the tracking lookup endpoint to prevent filter injection.
 */

/** Remove characters that could manipulate PostgREST filter syntax */
export function sanitizePostgrestValue(val: string): string {
  return val.replace(/[^a-zA-Z0-9\s\-#]/g, "")
}

/** Escape LIKE wildcards for safe use in ilike filters */
export function escapePostgrestLike(val: string): string {
  return val.replace(/[%_\\]/g, "\\$&")
}

/** Detect obvious PostgREST injection attempts */
const POSTGREST_INJECTION_RE = /[,;].*\.(eq|neq|gt|lt|gte|lte|like|ilike|is|in|not)\./i

export function isSuspiciousQuery(q: string): boolean {
  return POSTGREST_INJECTION_RE.test(q)
}
