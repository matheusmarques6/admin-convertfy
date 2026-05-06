/**
 * GET /api/crm/reports/timeseries
 *
 * Le snapshots da org pra montar timeseries. Sem agregacao em runtime.
 *
 * Query params:
 *   - days: 7|30|90|180|365 (default 30)
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmReports")

export const dynamic = "force-dynamic"

async function resolveOrgId(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string> {
  const { data } = await admin
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single()
  if (!data?.org_id) throw new AppError("Acesso negado: usuario sem organizacao", 403)
  return data.org_id
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(admin, user.id)

    const sp = request.nextUrl.searchParams
    const days = Math.min(parseInt(sp.get("days") || "30", 10), 365)

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    // Org timeseries
    const { data: orgSnaps } = await admin
      .from("crm_org_snapshots")
      .select(`
        day, sales_pipeline_value, sales_open_count,
        sales_won_value_30d, sales_won_count_30d, sales_win_rate_30d,
        sales_avg_cycle_days_30d,
        active_stores_count, total_mrr_cents, avg_health_score,
        critical_health_count, warning_health_count, healthy_count,
        nps_score, nps_responses_30d,
        inbox_open_threads, inbox_pending_threads
      `)
      .eq("org_id", orgId)
      .gte("day", since)
      .order("day", { ascending: true })

    // Funnel timeseries
    const { data: funnelSnaps } = await admin
      .from("crm_lead_funnel_snapshots")
      .select(`day, new_count, qualified_count, unqualified_count, converted_count, lost_count, created_today, by_source`)
      .eq("org_id", orgId)
      .gte("day", since)
      .order("day", { ascending: true })

    // Pipeline breakdown (latest snapshot por pipeline)
    const { data: pipelineSnaps } = await admin
      .from("crm_pipeline_snapshots")
      .select(`
        day, pipeline_id, open_count, open_value,
        won_count_30d, won_value_30d, lost_count_30d,
        win_rate_30d, avg_cycle_days_30d
      `)
      .eq("org_id", orgId)
      .gte("day", since)
      .order("day", { ascending: true })

    return successResponse(request, {
      window_days: days,
      org_snapshots: orgSnaps || [],
      funnel_snapshots: funnelSnaps || [],
      pipeline_snapshots: pipelineSnaps || [],
    })
  } catch (error) {
    log.error("Reports timeseries error:", error)
    return errorResponse(request, error, "crm-reports-timeseries")
  }
}
