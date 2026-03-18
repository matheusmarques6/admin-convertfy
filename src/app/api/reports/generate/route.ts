import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth } from "@/lib/api/errors"
import { GenerateReportSchema } from "@/lib/validations/report"
import { logger } from "@/lib/logger"
import type { ReportJob } from "@/types/report"

const log = logger.child("ReportsGenerate")

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Get org_id from org_members
    const { data: orgMember } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .single()

    if (!orgMember?.org_id) {
      return NextResponse.json(
        { error: "User is not a member of any organization" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validated = GenerateReportSchema.parse(body)

    const orgId = orgMember.org_id as string
    const startDate = validated.start_date ?? null
    const endDate = validated.end_date ?? null

    // P0: Validate all store_ids belong to this org (IDOR prevention)
    // Uses RLS-scoped client — only returns stores the user can access
    const { data: validStores, error: storeError } = await supabase
      .from("client_stores")
      .select("id")
      .in("id", validated.store_ids)
      .eq("org_id", orgId)

    if (storeError) {
      return errorResponse(request, storeError, "ReportsGenerate")
    }

    const validStoreIds = new Set(validStores?.map(s => s.id) ?? [])
    const invalidStoreIds = validated.store_ids.filter(id => !validStoreIds.has(id))

    if (invalidStoreIds.length > 0) {
      log.warn(`IDOR attempt: user ${user.id} tried to access stores outside org ${orgId}: ${invalidStoreIds.join(", ")}`)
      return NextResponse.json(
        { error: "One or more store_ids do not belong to your organization" },
        { status: 403 }
      )
    }

    // Initialize progress with all stores as pending
    const progress: Record<string, { status: string }> = {}
    for (const storeId of validated.store_ids) {
      progress[storeId] = { status: "pending" }
    }

    // Atomic dedup via partial UNIQUE index (uq_report_jobs_active_range)
    // INSERT ... ON CONFLICT DO NOTHING — if 0 rows, an active job already exists
    const { data: inserted, error: insertError } = await supabase
      .from("report_jobs")
      .insert({
        org_id: orgId,
        user_id: user.id,
        store_ids: validated.store_ids,
        period: validated.period,
        start_date: startDate,
        end_date: endDate,
        status: "queued",
        progress,
      })
      .select()
      .single()

    // Check if insert failed due to unique constraint (dedup)
    if (insertError) {
      // Postgres unique_violation code = 23505
      if (insertError.code === "23505") {
        // Fetch the existing active job
        let existingQuery = supabase
          .from("report_jobs")
          .select("*")
          .eq("org_id", orgId)
          .eq("period", validated.period)
          .in("status", ["queued", "processing", "paused"])

        // NULL != NULL in Postgres — use .is() for null values
        existingQuery = startDate
          ? existingQuery.eq("start_date", startDate)
          : existingQuery.is("start_date", null)
        existingQuery = endDate
          ? existingQuery.eq("end_date", endDate)
          : existingQuery.is("end_date", null)

        const { data: existing } = await existingQuery
          .order("created_at", { ascending: false })
          .limit(1)
          .single()

        if (existing) {
          // If the existing job is paused, re-trigger processing
          if (existing.status === "paused") {
            triggerProcessor(existing.id)
          }

          return NextResponse.json(
            { ...existing, deduplicated: true } as ReportJob & { deduplicated: boolean },
            { status: 200 }
          )
        }

        // Should not happen — unique constraint fired but no active job found
        log.warn("Dedup conflict but no active job found, retrying insert")
      }

      return errorResponse(request, insertError, "ReportsGenerate")
    }

    // Fire-and-forget: trigger the processor
    if (inserted) {
      triggerProcessor(inserted.id)
    }

    log.info(`Job created: ${inserted?.id} for org ${orgId} with ${validated.store_ids.length} stores`)

    return NextResponse.json(inserted as ReportJob, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "ReportsGenerate")
  }
}

/**
 * Fire-and-forget call to the process endpoint.
 * Uses CRON_SECRET for authentication (same as cron endpoints).
 * Does NOT await the response — the processor runs in the background.
 */
function triggerProcessor(jobId: string): void {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    log.error("Cannot trigger processor: CRON_SECRET not configured")
    return
  }

  const url = `${appUrl}/api/reports/process?job_id=${jobId}`

  // Fire-and-forget — intentionally not awaiting
  fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
    },
  }).catch((err) => {
    log.error(`Failed to trigger processor for job ${jobId}:`, err)
  })
}
