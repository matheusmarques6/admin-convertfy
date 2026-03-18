import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

export const maxDuration = 60

const log = logger.child("ReportsCleanup")

/**
 * POST /api/reports/cleanup
 *
 * Cron endpoint to clean up expired report jobs and stale custom-range cache.
 * Authenticated via CRON_SECRET (same as other cron endpoints).
 */
export async function POST(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const supabase = createAdminClient()
    let totalJobsDeleted = 0
    let totalCacheDeleted = 0

    // --- 1. Delete expired report_jobs in batches ---
    let deletedInBatch = 0
    do {
      const { count, error: deleteError } = await supabase
        .from("report_jobs")
        .delete({ count: "exact" })
        .lt("expires_at", new Date().toISOString())
        .not("status", "eq", "processing")
        .limit(100)

      if (deleteError) {
        log.error("Failed to delete expired jobs:", deleteError)
        break
      }

      deletedInBatch = count ?? 0
      totalJobsDeleted += deletedInBatch
    } while (deletedInBatch >= 100)

    // --- 2. Delete stale custom-range cache rows (older than 30 days) ---
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { count: cacheCount, error: cacheError } = await supabase
      .from("store_revenue_summary")
      .delete({ count: "exact" })
      .like("period_label", "custom:%")
      .lt("fetched_at", thirtyDaysAgo.toISOString())

    if (cacheError) {
      log.error("Failed to delete stale cache rows:", cacheError)
    } else {
      totalCacheDeleted = cacheCount ?? 0
    }

    log.info(
      `Cleanup complete: ${totalJobsDeleted} expired jobs, ${totalCacheDeleted} stale cache rows deleted`
    )

    return NextResponse.json({
      deleted_jobs: totalJobsDeleted,
      deleted_cache_rows: totalCacheDeleted,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    log.error("Cleanup failed:", error)
    return NextResponse.json(
      { error: "Cleanup failed", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    )
  }
}
