import { createClient } from "@/lib/supabase/client"

export type RateLimitAction = "password_reset" | "login_attempt" | "api_call"

export interface RateLimitResult {
  isLimited: boolean
  remainingAttempts: number
  retryAfterSeconds: number
  blockedBy?: "ip" | "identifier" | null
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

/**
 * Optimized Rate Limit Service v2
 *
 * Features:
 * - Single atomic DB call (check + record combined)
 * - Dual-key limiting (IP + identifier)
 * - Sliding window algorithm
 * - Fail-open for resilience
 * - Non-blocking audit logging
 */
class RateLimitService {
  /**
   * OPTIMIZED: Check and record rate limit in a single atomic operation
   * Reduces 2 DB calls to 1, with optional IP-based dual limiting
   */
  async checkAndRecord(
    identifier: string,
    actionType: RateLimitAction,
    ipAddress?: string
  ): Promise<RateLimitResult> {
    const supabase = createClient()
    const normalizedId = identifier.toLowerCase().trim()

    try {
      // Use dual-key check if IP is provided (blocks bots faster)
      if (ipAddress) {
        const { data, error } = await supabase.rpc("rate_limit_dual_check", {
          p_identifier: normalizedId,
          p_action_type: actionType,
          p_ip_address: ipAddress,
        })

        if (error) throw error

        const result = data?.[0]
        return {
          isLimited: !(result?.allowed ?? true),
          remainingAttempts: result?.remaining ?? 1,
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
        remainingAttempts: result?.remaining ?? 1,
        retryAfterSeconds: result?.retry_after ?? 0,
        blockedBy: result?.is_blocked ? "identifier" : null,
      }
    } catch (error) {
      console.error("Rate limit check failed:", error)
      // Fail-open: allow action on error to prevent DoS
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
    // Fallback to old function if v2 not yet deployed
    const supabase = createClient()

    try {
      // Try new function first
      const result = await this.checkAndRecord(identifier, actionType)
      return result
    } catch {
      // Fallback to old function
      const { data, error } = await supabase.rpc("check_rate_limit", {
        p_identifier: identifier.toLowerCase().trim(),
        p_action_type: actionType,
      })

      if (error) {
        console.error("Error checking rate limit:", error)
        return { isLimited: false, remainingAttempts: 1, retryAfterSeconds: 0 }
      }

      const result = data?.[0] || {}
      return {
        isLimited: result.is_limited ?? false,
        remainingAttempts: result.remaining_attempts ?? 1,
        retryAfterSeconds: result.retry_after_seconds ?? 0,
      }
    }
  }

  /**
   * Record a rate limited action
   * @deprecated Use checkAndRecord() for single DB call optimization
   */
  async recordAttempt(
    identifier: string,
    actionType: RateLimitAction,
    metadata?: Record<string, unknown>
  ): Promise<RateLimitResult> {
    const supabase = createClient()

    try {
      // Try new function first (it already records)
      return await this.checkAndRecord(identifier, actionType)
    } catch {
      // Fallback to old function
      const { data, error } = await supabase.rpc("record_rate_limit", {
        p_identifier: identifier.toLowerCase().trim(),
        p_action_type: actionType,
        p_metadata: metadata || {},
      })

      if (error) {
        console.error("Error recording rate limit:", error)
        return { isLimited: false, remainingAttempts: 1, retryAfterSeconds: 0 }
      }

      const result = data?.[0] || {}
      return {
        isLimited: result.is_limited ?? false,
        remainingAttempts: result.remaining_attempts ?? 1,
        retryAfterSeconds: result.retry_after_seconds ?? 0,
      }
    }
  }

  /**
   * Clear rate limit after successful action (e.g., successful login)
   */
  async clearRateLimit(
    identifier: string,
    actionType: RateLimitAction,
    ipAddress?: string
  ): Promise<void> {
    const supabase = createClient()

    try {
      // Try new function first
      await supabase.rpc("rate_limit_clear", {
        p_identifier: identifier.toLowerCase().trim(),
        p_action_type: actionType,
        p_ip_address: ipAddress || null,
      })
    } catch {
      // Fallback to old function
      await supabase.rpc("clear_rate_limit", {
        p_identifier: identifier.toLowerCase().trim(),
        p_action_type: actionType,
      })
    }
  }

  /**
   * Log password reset audit event (non-blocking)
   */
  async logPasswordResetAudit(data: AuditLogData): Promise<void> {
    const supabase = createClient()

    // Fire and forget - don't block on audit logging
    supabase
      .from("password_reset_audit")
      .insert({
        email: data.email.toLowerCase().trim(),
        ip_address: data.ipAddress,
        user_agent: data.userAgent,
        account_type: data.accountType,
        action: data.action,
        success: data.success ?? false,
        error_message: data.errorMessage,
        metadata: data.metadata || {},
      })
      .then(({ error }) => {
        if (error) console.error("Audit log failed:", error)
      })
  }

  /**
   * Format retry time for user display
   */
  formatRetryTime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds} segundos`
    }
    const minutes = Math.ceil(seconds / 60)
    return `${minutes} minuto${minutes > 1 ? "s" : ""}`
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
}

export const rateLimitService = new RateLimitService()
