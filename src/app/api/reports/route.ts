import { withTiming } from "@/lib/api/with-timing"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth } from "@/lib/api/errors"
import type { ReportJob } from "@/types/report"

/**
 * GET /api/reports — List report jobs for the current user's org.
 *
 * Query params:
 *   ?status=active        — only queued + processing (default)
 *   ?status=notifications — active + recently completed/failed/partial (for bell)
 *   ?status=all           — all statuses
 *   ?status=completed     — specific status filter
 *   ?limit=10             — max results (default 20, max 100)
 *   ?cursor=<id>          — cursor-based pagination (job id)
 */
async function handleGet(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get("status") || "active"
    const limitParam = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 100)
    const cursor = searchParams.get("cursor")

    let query = supabase
      .from("report_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limitParam + 1) // fetch one extra to detect "has more"

    // Status filter
    if (statusFilter === "active") {
      query = query.in("status", ["queued", "processing", "paused"])
    } else if (statusFilter === "notifications") {
      // For the notification bell: active jobs + recent terminal jobs (last 24h)
      query = query.or(
        "status.in.(queued,processing,paused),and(status.in.(completed,partial,failed),created_at.gte." +
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() +
          ")"
      )
    } else if (statusFilter !== "all") {
      query = query.eq("status", statusFilter)
    }

    // Cursor-based pagination: fetch jobs created before the cursor job
    if (cursor) {
      // Fetch cursor job's created_at for comparison
      const { data: cursorJob } = await supabase
        .from("report_jobs")
        .select("created_at")
        .eq("id", cursor)
        .single()

      if (cursorJob) {
        query = query.lt("created_at", cursorJob.created_at)
      }
    }

    const { data: jobs, error } = await query

    if (error) {
      return errorResponse(request, error, "ReportsList")
    }

    const allJobs = (jobs || []) as ReportJob[]
    const hasMore = allJobs.length > limitParam
    const resultJobs = hasMore ? allJobs.slice(0, limitParam) : allJobs
    const nextCursor = hasMore ? resultJobs[resultJobs.length - 1]?.id : null

    return NextResponse.json({
      jobs: resultJobs,
      pagination: {
        has_more: hasMore,
        next_cursor: nextCursor,
        count: resultJobs.length,
      },
    })
  } catch (error) {
    return errorResponse(request, error, "ReportsList")
  }
}

export const GET = withTiming("reports", handleGet)
