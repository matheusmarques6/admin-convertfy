import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { cleanExpiredCache } from "@/lib/cache"
import { logger } from "@/lib/logger"

// Concentra TODA a limpeza periodica do banco. Subiu de 60s porque agora
// tambem roda as 3 RPCs de expiracao que viviam no sync-reports.
export const maxDuration = 300

const log = logger.child("ReportsCleanup")

/**
 * GET|POST /api/reports/cleanup
 *
 * Faxina diaria do banco (cron 03:10 UTC): report jobs expirados, cache de
 * range custom antigo, dashboard_cache expirado e as expiracoes de revenue
 * summaries / cooldowns / metricas.
 *
 * O Vercel Cron invoca por GET — esta rota so exportava POST, entao vinha
 * respondendo 405 e a limpeza nunca acontecia. POST fica para disparo
 * manual. Autenticado via CRON_SECRET, como os demais crons.
 */
export async function GET(request: NextRequest) {
  return runCleanup(request)
}

export async function POST(request: NextRequest) {
  return runCleanup(request)
}

async function runCleanup(request: NextRequest) {
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

    // --- 3. Expiracoes que rodavam no sync-reports (a cada 30min) ---
    // Movidas para ca: sao DELETEs sem LIMIT que competiam por lock com os
    // UPSERTs do proprio ciclo de sync. Aqui rodam 1x/dia, fora de pico.
    // Cada uma e independente — uma falha nao aborta as demais.
    const expiredCache = await cleanExpiredCache(supabase)

    const { data: revClean, error: revErr } = await supabase.rpc("clean_expired_revenue_summaries")
    if (revErr) log.error("clean_expired_revenue_summaries failed:", revErr)

    const { data: cooldownClean, error: cdErr } = await supabase.rpc("clean_expired_cooldowns")
    if (cdErr) log.error("clean_expired_cooldowns failed:", cdErr)

    const { data: metricsClean, error: mtErr } = await supabase.rpc("clean_expired_metrics")
    if (mtErr) log.error("clean_expired_metrics failed:", mtErr)

    log.info(
      `Cleanup complete: ${totalJobsDeleted} expired jobs, ${totalCacheDeleted} stale cache rows, ` +
        `${expiredCache} dashboard_cache, ${revClean ?? 0} revenue summaries, ` +
        `${cooldownClean ?? 0} cooldowns, ${metricsClean ?? 0} metric rows deleted`
    )

    return NextResponse.json({
      deleted_jobs: totalJobsDeleted,
      deleted_cache_rows: totalCacheDeleted,
      deleted_dashboard_cache: expiredCache,
      deleted_revenue_summaries: revClean ?? 0,
      deleted_cooldowns: cooldownClean ?? 0,
      deleted_metric_rows: metricsClean ?? 0,
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
