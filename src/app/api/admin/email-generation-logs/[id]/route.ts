/**
 * GET /api/admin/email-generation-logs/[id] — detalhe completo de uma
 * execução. Inclui input_vars + raw_output (pode ter 20k+ chars) +
 * parsed_output + error_stack. Lê direto de email_generation_runs (não
 * da view) porque a view filtra raw_output.
 *
 * Auth: canManagePrompts.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  ForbiddenError,
  NotFoundError,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import { flowTypeLabel } from "@/lib/agents/agent-visual"
import { logger } from "@/lib/logger"

const log = logger.child("EmailGenerationLogDetailRoute")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, tags")
      .eq("id", user.id)
      .maybeSingle()
    const actor = {
      id: user.id,
      role: (profile as { role?: string | null } | null)?.role ?? null,
      tags: ((profile as { tags?: string[] } | null)?.tags ?? []) as string[],
    }
    if (!canManagePrompts(actor)) throw new ForbiddenError()

    const { id } = await ctx.params

    const { data: row, error } = await admin
      .from("email_generation_runs")
      .select(
        "id, created_at, batch_id, agent, model, status, tokens_input, tokens_output, cost_cents, duration_ms, retry_count, error_message, error_stack, input_vars, raw_output, parsed_output, store_id, email_id, flow_id, triggered_by",
      )
      .eq("id", id)
      .maybeSingle()

    if (error) throw error
    if (!row) throw new NotFoundError("Execução")

    type Row = typeof row & {
      store_id: string | null
      email_id: string | null
      flow_id: string | null
      triggered_by: string | null
    }
    const r = row as Row

    // JOINs manuais (Supabase JS não pula null FKs limpo na select com '!'-suffix)
    const [storeRes, emailRes, flowRes, triggeredByRes] = await Promise.all([
      r.store_id
        ? admin
            .from("client_stores")
            .select("store_name")
            .eq("id", r.store_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      r.email_id
        ? admin
            .from("email_flow_emails")
            .select("name, number")
            .eq("id", r.email_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      r.flow_id
        ? admin
            .from("email_flows")
            .select("flow_type")
            .eq("id", r.flow_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      r.triggered_by
        ? admin
            .from("profiles")
            .select("name, email")
            .eq("id", r.triggered_by)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const store = storeRes.data as { store_name?: string } | null
    const email = emailRes.data as { name?: string; number?: number } | null
    const flow = flowRes.data as { flow_type?: string } | null
    const triggeredBy = triggeredByRes.data as
      | { name?: string; email?: string }
      | null

    // QA Vision derivado: mesma regra da view.
    const parsed = r.parsed_output as Record<string, unknown> | null
    const isQaVision =
      r.agent === "qa" &&
      typeof parsed?.vision_ran === "boolean" &&
      parsed.vision_ran === true

    return successResponse(request, {
      id: r.id,
      created_at: r.created_at,
      batch_id: r.batch_id,
      agent: isQaVision ? "qavision" : r.agent,
      raw_agent: r.agent,
      is_qa_vision: isQaVision,
      model: r.model,
      status: r.status,
      tokens_input: r.tokens_input,
      tokens_output: r.tokens_output,
      cost_cents: r.cost_cents,
      duration_ms: r.duration_ms,
      retry_count: r.retry_count,
      error_message: r.error_message,
      error_stack: r.error_stack,
      input_vars: r.input_vars,
      raw_output: r.raw_output,
      parsed_output: r.parsed_output,
      store_id: r.store_id,
      store_name: store?.store_name ?? null,
      email_id: r.email_id,
      email_name: email?.name ?? null,
      email_position: email?.number ?? null,
      flow_id: r.flow_id,
      flow_type: flow?.flow_type ?? null,
      flow_type_label: flowTypeLabel(flow?.flow_type),
      triggered_by_name: triggeredBy?.name ?? triggeredBy?.email ?? null,
    })
  } catch (error) {
    log.error("GET email-generation-logs/[id] error", error)
    return errorResponse(request, error, "email-generation-logs-detail-get")
  }
}
