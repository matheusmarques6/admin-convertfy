import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailGenerationRun")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("email_generation_runs")
      .select(
        "*, client_stores(store_name), email_flows(flow_type), email_flow_emails(name)",
      )
      .eq("id", id)
      .single()

    if (error) throw error

    const stores = data.client_stores as Record<string, unknown> | null
    const flow = data.email_flows as Record<string, unknown> | null
    const email = data.email_flow_emails as Record<string, unknown> | null

    const run = {
      ...data,
      store_name: stores?.store_name ?? null,
      flow_type: flow?.flow_type ?? null,
      email_name: email?.name ?? null,
      client_stores: undefined,
      email_flows: undefined,
      email_flow_emails: undefined,
    }

    return successResponse(request, { run })
  } catch (error) {
    log.error("GenerationRun GET error:", error)
    return errorResponse(request, error, "gen-run-get")
  }
}
