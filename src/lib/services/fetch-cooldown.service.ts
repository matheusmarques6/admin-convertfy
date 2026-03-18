/**
 * Fetch Cooldown Service
 *
 * Coordinates live fetches between multiple serverless functions
 * using database-level atomicity (PostgreSQL INSERT ON CONFLICT).
 *
 * Epic 10 - Story 10.4
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { createHash } from "crypto"
import { LIVE_FETCH_COOLDOWN_MS, CUSTOM_RANGE_COOLDOWN_MS, isCustomPeriod } from "@/lib/shared/data-status"
import { logger } from "@/lib/logger"

const log = logger.child("FetchCooldown")

/**
 * Generate fetch key for a period or custom date range.
 * - Cached periods: returns the period string directly (e.g., "30d")
 * - Custom ranges: returns "custom_" + md5 hash of date range (e.g., "custom_a1b2c3d4")
 */
export function getFetchKey(period: string, startDate?: string, endDate?: string): string {
  if (isCustomPeriod(period) && startDate && endDate) {
    const hash = createHash("md5").update(`${startDate}_${endDate}`).digest("hex").slice(0, 8)
    return `custom_${hash}`
  }
  return period
}

/**
 * Try to acquire a live fetch lock.
 * Returns true if acquired (proceed with fetch), false if cooldown active (skip).
 *
 * Fail-open: if RPC fails, returns true (better to have a duplicate fetch than zero data).
 */
export async function tryAcquireLiveFetch(
  supabase: SupabaseClient,
  storeId: string,
  fetchKey: string,
  createdBy: string = "unknown",
  cooldownMs?: number,
): Promise<boolean> {
  const cooldown = cooldownMs ?? (fetchKey.startsWith("custom_")
    ? CUSTOM_RANGE_COOLDOWN_MS
    : LIVE_FETCH_COOLDOWN_MS)

  const { data, error } = await supabase.rpc("try_acquire_live_fetch", {
    p_store_id: storeId,
    p_fetch_key: fetchKey,
    p_cooldown_ms: cooldown,
    p_created_by: createdBy,
  })

  if (error) {
    // Fail-open: allow the fetch if RPC fails
    log.warn("[Cooldown]", { action: "rpc-error", storeId, fetchKey, createdBy })
    return true
  }

  const acquired = data === true
  log.info("[Cooldown]", {
    action: acquired ? "acquired" : "blocked",
    storeId,
    fetchKey,
    createdBy,
  })

  return acquired
}

/**
 * Release a live fetch lock after completion or failure.
 * Updates status and completed_at timestamp.
 */
export async function releaseLiveFetch(
  supabase: SupabaseClient,
  storeId: string,
  fetchKey: string,
  status: "completed" | "failed" = "completed",
  resultSummary?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc("release_live_fetch", {
    p_store_id: storeId,
    p_fetch_key: fetchKey,
    p_status: status,
    p_result_summary: resultSummary ?? null,
  })

  if (error) {
    log.warn("[Cooldown] Failed to release lock", { storeId, fetchKey, status, error: error.message })
  }
}
