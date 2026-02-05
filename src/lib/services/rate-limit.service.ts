import { createClient } from "@/lib/supabase/client"

export type RateLimitAction = "password_reset" | "login_attempt" | "api_call"

export interface RateLimitResult {
  isLimited: boolean
  remainingAttempts: number
  retryAfterSeconds: number
}

export interface AuditLogData {
  email: string
  accountType?: "admin" | "agent" | "client"
  action: "request" | "complete" | "expire" | "fail"
  ipAddress?: string
  userAgent?: string
  success?: boolean
  errorMessage?: string
  metadata?: Record<string, unknown>
}

class RateLimitService {
  /**
   * Check if an identifier is rate limited for a specific action
   */
  async checkRateLimit(
    identifier: string,
    actionType: RateLimitAction
  ): Promise<RateLimitResult> {
    const supabase = createClient()

    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_identifier: identifier,
      p_action_type: actionType,
    })

    if (error) {
      console.error("Error checking rate limit:", error)
      // On error, allow the action but log it
      return {
        isLimited: false,
        remainingAttempts: 1,
        retryAfterSeconds: 0,
      }
    }

    // The function returns an array with one row
    const result = data?.[0] || {
      is_limited: false,
      remaining_attempts: 1,
      retry_after_seconds: 0,
    }

    return {
      isLimited: result.is_limited,
      remainingAttempts: result.remaining_attempts,
      retryAfterSeconds: result.retry_after_seconds,
    }
  }

  /**
   * Record a rate limited action and return the updated status
   */
  async recordAttempt(
    identifier: string,
    actionType: RateLimitAction,
    metadata?: Record<string, unknown>
  ): Promise<RateLimitResult> {
    const supabase = createClient()

    const { data, error } = await supabase.rpc("record_rate_limit", {
      p_identifier: identifier,
      p_action_type: actionType,
      p_metadata: metadata || {},
    })

    if (error) {
      console.error("Error recording rate limit:", error)
      return {
        isLimited: false,
        remainingAttempts: 1,
        retryAfterSeconds: 0,
      }
    }

    const result = data?.[0] || {
      is_limited: false,
      remaining_attempts: 1,
      retry_after_seconds: 0,
    }

    return {
      isLimited: result.is_limited,
      remainingAttempts: result.remaining_attempts,
      retryAfterSeconds: result.retry_after_seconds,
    }
  }

  /**
   * Clear rate limit for an identifier (e.g., after successful login)
   */
  async clearRateLimit(
    identifier: string,
    actionType: RateLimitAction
  ): Promise<void> {
    const supabase = createClient()

    const { error } = await supabase.rpc("clear_rate_limit", {
      p_identifier: identifier,
      p_action_type: actionType,
    })

    if (error) {
      console.error("Error clearing rate limit:", error)
    }
  }

  /**
   * Log a password reset audit event
   */
  async logPasswordResetAudit(data: AuditLogData): Promise<void> {
    const supabase = createClient()

    const { error } = await supabase.from("password_reset_audit").insert({
      email: data.email,
      account_type: data.accountType,
      action: data.action,
      ip_address: data.ipAddress,
      user_agent: data.userAgent,
      success: data.success ?? false,
      error_message: data.errorMessage,
      metadata: data.metadata || {},
    })

    if (error) {
      console.error("Error logging password reset audit:", error)
    }
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
}

export const rateLimitService = new RateLimitService()
