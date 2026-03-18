import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { getKlaviyoRevenueForStore, type KlaviyoRevenueSummary } from "@/lib/integrations/klaviyo/report-summary"
import { KlaviyoRateLimitError } from "@/lib/integrations/klaviyo"
import { logger } from "@/lib/logger"
import type { ReportJobResult, ReportJobStoreProgress } from "@/types/report"

const log = logger.child("ReportsProcess")

export const maxDuration = 300
export const dynamic = "force-dynamic"

/** Safety margin: stop 40s before maxDuration to allow cleanup */
const SAFETY_MARGIN_MS = 260_000
/** Maximum invocations per job to prevent infinite loops */
const MAX_INVOCATIONS = 5
/** Jobs stuck in 'processing' for >5 min are considered failed */
const STUCK_TIMEOUT_MS = 5 * 60 * 1000
/** Jobs stuck in 'queued' for >10 min are considered failed (trigger never fired) */
const STUCK_QUEUED_TIMEOUT_MS = 10 * 60 * 1000

export async function POST(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  const supabase = createAdminClient()
  const startTime = Date.now()

  try {
    // Step 1: Clean up stuck jobs
    await cleanupStuckJobs(supabase)

    // Step 2: Get job_id from query params
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get("job_id")

    if (!jobId) {
      return NextResponse.json({ error: "job_id query parameter is required" }, { status: 400 })
    }

    // Step 3: Fetch the job
    const { data: job, error: jobError } = await supabase
      .from("report_jobs")
      .select("*")
      .eq("id", jobId)
      .single()

    if (jobError || !job) {
      log.warn(`Job ${jobId} not found`)
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Validate job is in a processable state
    const processableStatuses = ["queued", "processing", "paused"]
    if (!processableStatuses.includes(job.status)) {
      log.info(`Job ${jobId} has terminal status '${job.status}', skipping`)
      return NextResponse.json({ status: "skipped", reason: `Job status is '${job.status}'` })
    }

    // Step 4: Increment invocation count and check max retries
    const progress = (job.progress as Record<string, unknown>) || {}
    const invocationCount = ((progress.invocation_count as number) || 0) + 1

    if (invocationCount > MAX_INVOCATIONS) {
      log.error(`Job ${jobId} exceeded max invocations (${MAX_INVOCATIONS})`)
      await supabase
        .from("report_jobs")
        .update({
          status: "failed",
          progress: {
            ...progress,
            invocation_count: invocationCount,
            failure_reason: "max_retries_exceeded",
          },
        })
        .eq("id", jobId)

      return NextResponse.json({ status: "failed", reason: "max_retries_exceeded" })
    }

    // Update job status to processing and bump invocation count
    await supabase.rpc("update_job_progress", {
      p_job_id: jobId,
      p_progress: { invocation_count: invocationCount },
    })

    await supabase
      .from("report_jobs")
      .update({ status: "processing" })
      .eq("id", jobId)

    log.info(`Processing job ${jobId} (invocation #${invocationCount}, ${job.store_ids.length} stores)`)

    // Step 5: Determine which stores still need processing
    const storeIds: string[] = job.store_ids
    const pendingStores = storeIds.filter((storeId) => {
      const storeProgress = progress[storeId] as { status?: string } | undefined
      return !storeProgress || storeProgress.status !== "completed"
    })

    log.info(`Job ${jobId}: ${pendingStores.length} pending stores out of ${storeIds.length} total`)

    // Step 6: Process stores sequentially
    // CR3: Collect revenue data from return values instead of re-reading cache
    const revenueMap = new Map<string, KlaviyoRevenueSummary>()
    let pausedDueToRateLimit = false
    let pausedDueToTimeout = false

    for (const storeId of pendingStores) {
      // Check time budget
      if (Date.now() - startTime > SAFETY_MARGIN_MS) {
        log.warn(`Job ${jobId}: timeout approaching, pausing with ${pendingStores.length - pendingStores.indexOf(storeId)} stores remaining`)
        pausedDueToTimeout = true
        break
      }

      // Mark store as processing
      await supabase.rpc("update_job_progress", {
        p_job_id: jobId,
        p_progress: {
          [storeId]: { status: "processing" } satisfies ReportJobStoreProgress,
        },
      })

      try {
        const result = await getKlaviyoRevenueForStore(
          storeId,
          job.period,
          job.start_date,
          job.end_date
        )

        if (result.success && result.data) {
          // CR3: Capture revenue data from return value for snapshot building
          revenueMap.set(storeId, result.data)
          await supabase.rpc("update_job_progress", {
            p_job_id: jobId,
            p_progress: {
              [storeId]: {
                status: "completed",
                completed_at: new Date().toISOString(),
              } satisfies ReportJobStoreProgress,
            },
          })
          log.info(`Job ${jobId}: store ${storeId} completed (revenue=${result.data.totalRevenue})`)
        } else {
          await supabase.rpc("update_job_progress", {
            p_job_id: jobId,
            p_progress: {
              [storeId]: {
                status: "failed",
                error: result.error || "Unknown error",
              } satisfies ReportJobStoreProgress,
            },
          })
          log.warn(`Job ${jobId}: store ${storeId} failed: ${result.error}`)
        }
      } catch (err) {
        if (err instanceof KlaviyoRateLimitError) {
          log.warn(`Job ${jobId}: rate limited during store ${storeId}, pausing job`)
          await supabase.rpc("update_job_progress", {
            p_job_id: jobId,
            p_progress: {
              [storeId]: {
                status: "failed",
                error: "Rate limited (429)",
              } satisfies ReportJobStoreProgress,
              paused_reason: "rate_limit",
              paused_at: new Date().toISOString(),
            },
          })
          pausedDueToRateLimit = true
          break
        }

        // Other errors: mark store as failed and continue
        const errorMsg = err instanceof Error ? err.message : "Unknown error"
        await supabase.rpc("update_job_progress", {
          p_job_id: jobId,
          p_progress: {
            [storeId]: {
              status: "failed",
              error: errorMsg,
            } satisfies ReportJobStoreProgress,
          },
        })
        log.error(`Job ${jobId}: store ${storeId} threw:`, err)
      }
    }

    // Step 7: Determine final status and build result snapshot
    if (pausedDueToRateLimit || pausedDueToTimeout) {
      const reason = pausedDueToRateLimit ? "rate_limit" : "timeout"
      await supabase
        .from("report_jobs")
        .update({ status: "paused" })
        .eq("id", jobId)

      await supabase.rpc("update_job_progress", {
        p_job_id: jobId,
        p_progress: {
          paused_reason: reason,
          paused_at: new Date().toISOString(),
        },
      })

      log.info(`Job ${jobId}: paused due to ${reason}`)
      return NextResponse.json({ status: "paused", reason })
    }

    // All stores processed (or failed) — build result snapshot
    // CR3: Pass revenueMap so snapshot uses captured data, not cache re-reads
    const finalResult = await buildResultSnapshot(supabase, jobId, storeIds, revenueMap)

    // Determine final status
    let finalStatus: "completed" | "partial" | "failed"
    if (finalResult.stores_failed === 0) {
      finalStatus = "completed"
    } else if (finalResult.stores_processed > 0) {
      finalStatus = "partial"
    } else {
      finalStatus = "failed"
    }

    await supabase
      .from("report_jobs")
      .update({
        status: finalStatus,
        result: finalResult,
      })
      .eq("id", jobId)

    const elapsed = Date.now() - startTime
    log.info(`Job ${jobId}: ${finalStatus} in ${elapsed}ms (processed=${finalResult.stores_processed}, failed=${finalResult.stores_failed})`)

    return NextResponse.json({
      status: finalStatus,
      job_id: jobId,
      elapsed: `${elapsed}ms`,
      stores_processed: finalResult.stores_processed,
      stores_failed: finalResult.stores_failed,
    })
  } catch (error) {
    log.error("Fatal error in report processor:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    )
  }
}

/**
 * Detect and mark stuck jobs as failed.
 * Jobs in 'processing' state with updated_at older than STUCK_TIMEOUT_MS
 * are considered stuck (e.g., the processor crashed or timed out).
 */
async function cleanupStuckJobs(supabase: ReturnType<typeof createAdminClient>): Promise<void> {
  const stuckThreshold = new Date(Date.now() - STUCK_TIMEOUT_MS).toISOString()

  const { data: stuckJobs } = await supabase
    .from("report_jobs")
    .select("id")
    .eq("status", "processing")
    .lt("updated_at", stuckThreshold)

  if (stuckJobs && stuckJobs.length > 0) {
    for (const stuck of stuckJobs) {
      log.warn(`Marking stuck job ${stuck.id} as failed (processing for >5 min)`)
      await supabase
        .from("report_jobs")
        .update({ status: "failed" })
        .eq("id", stuck.id)

      await supabase.rpc("update_job_progress", {
        p_job_id: stuck.id,
        p_progress: { failure_reason: "stuck_timeout" },
      })
    }
  }

  // H3: Also cleanup queued jobs that were never picked up (trigger failed)
  const queuedThreshold = new Date(Date.now() - STUCK_QUEUED_TIMEOUT_MS).toISOString()

  const { data: stuckQueued } = await supabase
    .from("report_jobs")
    .select("id")
    .eq("status", "queued")
    .lt("updated_at", queuedThreshold)

  if (stuckQueued && stuckQueued.length > 0) {
    for (const stuck of stuckQueued) {
      log.warn(`Marking stuck queued job ${stuck.id} as failed (queued for >10 min)`)
      await supabase
        .from("report_jobs")
        .update({ status: "failed" })
        .eq("id", stuck.id)

      await supabase.rpc("update_job_progress", {
        p_job_id: stuck.id,
        p_progress: { failure_reason: "queued_timeout" },
      })
    }
  }
}

/**
 * Build result snapshot from collected revenue data (CR3).
 *
 * Instead of re-reading store_revenue_summary (which may be empty for custom
 * ranges or not yet committed), we use the revenue data captured directly from
 * getKlaviyoRevenueForStore() return values during processing.
 */
async function buildResultSnapshot(
  supabase: ReturnType<typeof createAdminClient>,
  jobId: string,
  storeIds: string[],
  revenueMap: Map<string, KlaviyoRevenueSummary>,
): Promise<ReportJobResult> {
  // Re-fetch latest progress to know each store's final status
  const { data: job } = await supabase
    .from("report_jobs")
    .select("progress")
    .eq("id", jobId)
    .single()

  const progress = (job?.progress as Record<string, unknown>) || {}

  // H4: Resolve store names for result snapshot
  const { data: storeRows } = await supabase
    .from("client_stores")
    .select("id, store_name")
    .in("id", storeIds)

  const storeNameMap = new Map<string, string>()
  if (storeRows) {
    for (const row of storeRows) {
      storeNameMap.set(row.id, row.store_name ?? "")
    }
  }

  // Note: klaviyo_attributed_revenue = campaign + flow revenue from Reporting API.
  // Total store revenue (from Metric Aggregates) is NOT fetched in this flow.
  // See docs/architecture/adr-klaviyo-revenue-source.md
  let totalRevenue = 0
  let klaviyoAttributedRevenue = 0
  let storesProcessed = 0
  let storesFailed = 0
  const perStore: ReportJobResult["per_store"] = {}

  for (const storeId of storeIds) {
    const storeProgress = progress[storeId] as { status?: string; error?: string } | undefined

    if (storeProgress?.status === "completed") {
      // CR3: Use captured revenue data from the Map — no DB re-read needed
      const data = revenueMap.get(storeId)
      storesProcessed++
      if (data) {
        totalRevenue += data.totalRevenue
        klaviyoAttributedRevenue += data.totalRevenue
        perStore[storeId] = {
          store_name: storeNameMap.get(storeId),
          revenue: data.totalRevenue,
          campaign_revenue: data.campaignRevenue,
          flow_revenue: data.flowRevenue,
          currency: data.currency,
        }
      } else {
        // Should not happen, but defensive fallback
        perStore[storeId] = {
          store_name: storeNameMap.get(storeId),
          revenue: 0,
          campaign_revenue: 0,
          flow_revenue: 0,
          currency: "BRL",
        }
      }
    } else if (storeProgress?.status === "failed") {
      storesFailed++
      perStore[storeId] = {
        store_name: storeNameMap.get(storeId),
        revenue: 0,
        campaign_revenue: 0,
        flow_revenue: 0,
        currency: "BRL",
        error: storeProgress.error || "Unknown error",
      }
    } else {
      // Still pending (paused before reaching this store)
      perStore[storeId] = {
        store_name: storeNameMap.get(storeId),
        revenue: 0,
        campaign_revenue: 0,
        flow_revenue: 0,
        currency: "BRL",
        error: "Not processed",
      }
    }
  }

  // Note: totals assume single-currency org. Multi-currency orgs will have
  // incorrect aggregated totals but correct per_store data.
  return {
    total_revenue: totalRevenue,
    klaviyo_attributed_revenue: klaviyoAttributedRevenue,
    stores_processed: storesProcessed,
    stores_failed: storesFailed,
    currencies: [...new Set(Object.values(perStore).map(s => s.currency).filter(Boolean))],
    per_store: perStore,
    generated_at: new Date().toISOString(),
  }
}
