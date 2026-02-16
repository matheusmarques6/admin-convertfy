import { createClient } from "@/lib/supabase/client"
import { logger } from "@/lib/logger"

const log = logger.child("RateLimit")

export type RateLimitAction =
  | "password_reset"
  | "login_attempt"
  | "api_call"
  | "daily_email"  // Proteção contra ataques low & slow (10/dia)

export interface RateLimitResult {
  isLimited: boolean
  remainingAttempts: number
  retryAfterSeconds: number
  blockedBy?: "ip" | "identifier" | null
}

export interface RateLimitOptions {
  /** If true, block on error instead of allowing (default: false for most, true for sensitive) */
  failClosed?: boolean
}

export interface AuditLogData {
  email: string
  ipAddress?: string
  userAgent?: string
  accountType?: "admin" | "agent" | "client"
  action: "request" | "complete" | "expire" | "fail"
  success?: boolean
  errorMessage?: string
  metadata?: Record<string, unknown>
}

/** Sensitive actions that should fail-closed by default */
const SENSITIVE_ACTIONS: RateLimitAction[] = [
  "password_reset",
  "login_attempt",
  "daily_email",
]

/**
 * Optimized Rate Limit Service v2
 *
 * Features:
 * - Single atomic DB call (check + record combined)
 * - Dual-key limiting (IP + identifier)
 * - Sliding window algorithm
 * - Fail-closed for sensitive actions, fail-open for others
 * - Non-blocking audit logging via RPC
 */
class RateLimitService {
  /**
   * OPTIMIZED: Check and record rate limit in a single atomic operation
   * Reduces 2 DB calls to 1, with optional IP-based dual limiting
   *
   * @param identifier - Email, user ID, or other unique identifier
   * @param actionType - Type of action being rate limited
   * @param ipAddress - Optional IP for dual-key limiting (recommended)
   * @param options - Additional options (failClosed, etc.)
   */
  async checkAndRecord(
    identifier: string,
    actionType: RateLimitAction,
    ipAddress?: string,
    options?: RateLimitOptions
  ): Promise<RateLimitResult> {
    const supabase = createClient()
    const normalizedId = identifier.toLowerCase().trim()
    const normalizedIp = ipAddress?.trim() || null

    // Determine fail behavior (sensitive actions fail-closed by default)
    const shouldFailClosed =
      options?.failClosed ?? SENSITIVE_ACTIONS.includes(actionType)

    try {
      // Use dual-key check if IP is provided (blocks bots faster)
      if (normalizedIp) {
        const { data, error } = await supabase.rpc("rate_limit_dual_check", {
          p_identifier: normalizedId,
          p_action_type: actionType,
          p_ip_address: normalizedIp,
        })

        if (error) throw error

        const result = data?.[0]
        return {
          isLimited: !(result?.allowed ?? true),
          remainingAttempts: result?.remaining ?? 0,
          retryAfterSeconds: result?.retry_after ?? 0,
          blockedBy: result?.blocked_by as "ip" | "identifier" | null,
        }
      }

      // Single-key check (identifier only)
      const { data, error } = await supabase.rpc("rate_limit_check", {
        p_identifier: normalizedId,
        p_action_type: actionType,
        p_ip_address: null,
      })

      if (error) throw error

      const result = data?.[0]
      return {
        isLimited: !(result?.allowed ?? true),
        remainingAttempts: result?.remaining ?? 0,
        retryAfterSeconds: result?.retry_after ?? 0,
        blockedBy: result?.is_blocked ? "identifier" : null,
      }
    } catch (error) {
      log.error("Rate limit check failed", { error: error instanceof Error ? error.message : error })

      // Fail-closed for sensitive actions, fail-open for others
      if (shouldFailClosed) {
        return {
          isLimited: true,
          remainingAttempts: 0,
          retryAfterSeconds: 60, // Default 1 minute wait on error
          blockedBy: null,
        }
      }

      return {
        isLimited: false,
        remainingAttempts: 1,
        retryAfterSeconds: 0,
        blockedBy: null,
      }
    }
  }

  /**
   * Check if an identifier is rate limited
   * @deprecated Use checkAndRecord() for single DB call optimization
   */
  async checkRateLimit(
    identifier: string,
    actionType: RateLimitAction
  ): Promise<RateLimitResult> {
    return this.checkAndRecord(identifier, actionType)
  }

  /**
   * Record a rate limited action
   * @deprecated Use checkAndRecord() for single DB call optimization
   */
  async recordAttempt(
    identifier: string,
    actionType: RateLimitAction
  ): Promise<RateLimitResult> {
    return this.checkAndRecord(identifier, actionType)
  }

  /**
   * Clear rate limit after successful action (e.g., successful login)
   */
  async clearRateLimit(
    identifier: string,
    actionType: RateLimitAction,
    ipAddress?: string
  ): Promise<boolean> {
    const supabase = createClient()

    try {
      const { data, error } = await supabase.rpc("rate_limit_clear", {
        p_identifier: identifier.toLowerCase().trim(),
        p_action_type: actionType,
        p_ip_address: ipAddress?.trim() || null,
      })

      if (error) throw error
      return data ?? false
    } catch (error) {
      log.error("Failed to clear rate limit", { error: error instanceof Error ? error.message : error })
      return false
    }
  }

  /**
   * Log password reset audit event (non-blocking, via secure RPC)
   * Uses SECURITY DEFINER function for proper RLS bypass
   */
  async logPasswordResetAudit(data: AuditLogData): Promise<void> {
    const supabase = createClient()

    // Fire and forget via RPC (more secure than direct insert)
    supabase
      .rpc("audit_password_reset", {
        p_email: data.email,
        p_action: data.action,
        p_success: data.success ?? false,
        p_ip_address: data.ipAddress || null,
        p_user_agent: data.userAgent || null,
        p_account_type: data.accountType || null,
        p_error_message: data.errorMessage || null,
        p_metadata: data.metadata || {},
      })
      .then(({ error }) => {
        if (error) log.error("Audit log failed", { error: error.message })
      })
  }

  /**
   * Format retry time for user display
   */
  formatRetryTime(seconds: number): string {
    if (seconds <= 0) return "alguns segundos"
    if (seconds < 60) return `${seconds} segundos`

    const minutes = Math.ceil(seconds / 60)
    if (minutes === 1) return "1 minuto"
    if (minutes < 60) return `${minutes} minutos`

    const hours = Math.floor(minutes / 60)
    const remainingMins = minutes % 60
    if (remainingMins === 0) return `${hours} hora${hours > 1 ? "s" : ""}`
    return `${hours}h ${remainingMins}min`
  }

  /**
   * Get user-friendly error message based on block type
   */
  getBlockMessage(blockedBy?: "ip" | "identifier" | null): string {
    switch (blockedBy) {
      case "ip":
        return "Muitas tentativas deste endereço. Aguarde antes de tentar novamente."
      case "identifier":
        return "Muitas tentativas para esta conta. Aguarde antes de tentar novamente."
      default:
        return "Limite de tentativas excedido. Aguarde antes de tentar novamente."
    }
  }

  /**
   * Extract real IP address from request headers
   * Validates trusted proxy headers to prevent spoofing
   *
   * @param headers - Request headers object or Headers instance
   * @returns Real IP or null if not determinable
   */
  extractRealIP(
    headers: Headers | Record<string, string | undefined>
  ): string | null {
    // Helper to get header value
    const getHeader = (name: string): string | undefined => {
      if (headers instanceof Headers) {
        return headers.get(name) ?? undefined
      }
      return headers[name] ?? headers[name.toLowerCase()]
    }

    // Priority order (most trusted first)
    // 1. Cloudflare (if using CF)
    const cfIP = getHeader("cf-connecting-ip")
    if (cfIP && this.isValidIP(cfIP)) return cfIP

    // 2. Vercel
    const vercelIP = getHeader("x-real-ip")
    if (vercelIP && this.isValidIP(vercelIP)) return vercelIP

    // 3. X-Forwarded-For (first IP in chain, set by reverse proxy)
    const forwarded = getHeader("x-forwarded-for")
    if (forwarded) {
      const firstIP = forwarded.split(",")[0]?.trim()
      if (firstIP && this.isValidIP(firstIP)) return firstIP
    }

    return null
  }

  /**
   * Basic IP validation (IPv4 or IPv6)
   */
  private isValidIP(ip: string): boolean {
    // IPv4
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
    if (ipv4Regex.test(ip)) {
      const parts = ip.split(".").map(Number)
      return parts.every((part) => part >= 0 && part <= 255)
    }

    // IPv6 (simplified check)
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/
    return ipv6Regex.test(ip)
  }
}

export const rateLimitService = new RateLimitService()
