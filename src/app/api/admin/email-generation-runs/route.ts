import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailGenerationRuns")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const params = request.nextUrl.searchParams
    const storeId = params.get("store_id")
    const status = params.get("status")
    const agent = params.get("agent")
    const limit = Math.min(parseInt(params.get("limit") ?? "50"), 200)
    const offset = parseInt(params.get("offset") ?? "0")

    let query = admin
      .from("email_generation_runs")
      .select(
        "*, client_stores(store_name), email_flows(flow_type), email_flow_emails(name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (storeId) {
      query = query.eq("store_id", storeId)
    }
    if (status) {
      query = query.eq("status", status)
    }
    if (agent) {
      query = query.eq("agent", agent)
    }

    const { data, error, count } = await query

    if (error) throw error

    const runs = (data ?? []).map((row: Record<string, unknown>) => {
      const stores = row.client_stores as Record<string, unknown> | null
      const flow = row.email_flows as Record<string, unknown> | null
      const email = row.email_flow_emails as Record<string, unknown> | null
      return {
        ...row,
        store_name: stores?.store_name ?? null,
        flow_type: flow?.flow_type ?? null,
        email_name: email?.name ?? null,
        client_stores: undefined,
        email_flows: undefined,
        email_flow_emails: undefined,
      }
    })

    return successResponse(request, { runs, total: count ?? 0 })
  } catch (error) {
    log.error("GenerationRuns GET error:", error)
    return errorResponse(request, error, "gen-runs-get")
  }
}
