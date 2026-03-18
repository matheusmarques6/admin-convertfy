import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, NotFoundError, ConflictError } from "@/lib/api/errors"
import { UUIDSchema, CancelJobSchema, MarkViewedSchema } from "@/lib/validations/report"
import type { ReportJob } from "@/types/report"

/**
 * GET /api/reports/[id] — Fetch a single report job by ID.
 * RLS ensures the user can only see jobs from their org.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const { id } = await params
    UUIDSchema.parse(id)

    const { data: job, error } = await supabase
      .from("report_jobs")
      .select("*")
      .eq("id", id)
      .single()

    if (error || !job) {
      throw new NotFoundError("Report job")
    }

    // Compute is_expired flag
    const isExpired = job.expires_at ? new Date(job.expires_at) < new Date() : false

    return NextResponse.json({
      ...(job as ReportJob),
      is_expired: isExpired,
    })
  } catch (error) {
    return errorResponse(request, error, "ReportsGetById")
  }
}

/**
 * PATCH /api/reports/[id] — Cancel a report job OR mark as viewed.
 *
 * Body variants:
 *   { status: "cancelled" }  — cancel (only from queued/paused)
 *   { viewed_at: "<ISO>" }   — mark as viewed
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const { id } = await params
    UUIDSchema.parse(id)

    const body = await request.json()

    // ── Mark as viewed ────────────────────────────────────────────────
    const viewedParse = MarkViewedSchema.safeParse(body)
    if (viewedParse.success) {
      const { data: updated, error: updateError } = await supabase
        .from("report_jobs")
        .update({ viewed_at: viewedParse.data.viewed_at })
        .eq("id", id)
        .select()
        .single()

      if (updateError) {
        return errorResponse(request, updateError, "ReportsMarkViewed")
      }
      if (!updated) {
        throw new NotFoundError("Report job")
      }

      return NextResponse.json(updated as ReportJob)
    }

    // ── Cancel job ────────────────────────────────────────────────────
    CancelJobSchema.parse(body)

    // Fetch current job status (RLS-filtered)
    const { data: job, error: fetchError } = await supabase
      .from("report_jobs")
      .select("id, status")
      .eq("id", id)
      .single()

    if (fetchError || !job) {
      throw new NotFoundError("Report job")
    }

    // Only allow cancellation from queued or paused
    const cancellableStatuses = ["queued", "paused"]
    if (!cancellableStatuses.includes(job.status)) {
      throw new ConflictError(
        `Cannot cancel job with status '${job.status}'. Only 'queued' or 'paused' jobs can be cancelled.`
      )
    }

    const { data: updated, error: updateError } = await supabase
      .from("report_jobs")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      return errorResponse(request, updateError, "ReportsCancelJob")
    }

    return NextResponse.json(updated as ReportJob)
  } catch (error) {
    return errorResponse(request, error, "ReportsPatch")
  }
}
