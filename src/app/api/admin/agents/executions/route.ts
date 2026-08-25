/**
 * GET /api/admin/agents/executions — execuções do pipeline AE agrupadas
 * por EMAIL, para a aba Execuções do Estúdio de Agentes.
 *
 * Uma "execução" = o estado atual da última geração de um email que passou
 * pelo pipeline (generation_batch_id preenchido): status agregado + a run
 * MAIS RECENTE de cada agente. O drill-down por nó usa
 * `/api/admin/email-generation-logs/[id]` com o run_id devolvido aqui.
 *
 * Query params:
 *   - limit: máx. de execuções (default 25, max 100)
 *   - status: 'success' | 'error' | 'running' (bucket do email)
 *   - store_id: UUID
 *
 * Auth: canManagePrompts (admin/owner OU tag 'dev') — mesmo gate dos logs.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  ForbiddenError,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import { flowTypeLabel, type PipelineAgentKey } from "@/lib/agents/agent-visual"
import { logger } from "@/lib/logger"

const log = logger.child("AgentExecutionsRoute")

export const dynamic = "force-dynamic"

const SUCCESS_STATUSES = ["ready", "approved", "live"]
const ERROR_STATUSES = ["failed"]

type Bucket = "success" | "error" | "running"

function bucketOfEmail(status: string): Bucket {
  if (SUCCESS_STATUSES.includes(status)) return "success"
  if (ERROR_STATUSES.includes(status)) return "error"
  return "running"
}

interface EmailRow {
  id: string
  number: number
  name: string | null
  status: string
  generation_batch_id: string | null
  ready_at: string | null
  failed_at: string | null
  failure_reason: string | null
  updated_at: string
  flow: {
    id: string
    flow_type: string
    store_id: string
    store: { id: string; store_name: string } | null
  } | null
}

/**
 * Linha devolvida pela função agent_studio_latest_runs (migration
 * 20261073): já é a run MAIS RECENTE por (email, agente), com QA Vision
 * derivado no banco (bucket 'qavision') e component_test excluído.
 */
interface LatestRunRow {
  run_id: string
  email_id: string
  agent: string
  model: string | null
  status: string
  tokens_input: number | null
  tokens_output: number | null
  cost_cents: number | null
  duration_ms: number | null
  retry_count: number | null
  error_message: string | null
  created_at: string
}

export async function GET(request: NextRequest) {
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

    const sp = request.nextUrl.searchParams
    const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "25", 10) || 25, 1), 100)
    const statusFilter = sp.get("status") as Bucket | null
    const storeIdFilter = sp.get("store_id")

    let query = admin
      .from("email_flow_emails")
      .select(
        `id, number, name, status, generation_batch_id, ready_at, failed_at,
         failure_reason, updated_at,
         flow:email_flows!inner(id, flow_type, store_id,
           store:client_stores!inner(id, store_name))`,
      )
      // Email em geração aparece DESDE a fase 1: o generation_batch_id só é
      // gravado quando a copy volta do n8n, então filtrar apenas por ele
      // escondia o email exatamente na janela em que a geração pode empacar
      // (fase 1 → dispatch → aguardando callback). Status em voo entra
      // mesmo sem batch; as runs da fase 1 agora carregam email_id e a
      // agent_studio_latest_runs as encontra.
      .or(
        "generation_batch_id.not.is.null," +
          "status.in.(pending,in_progress,copy_generating,copy_generating_recovery,copy_ready,rendering,image_done,qa_running)",
      )
      .order("updated_at", { ascending: false })
      .limit(limit)

    if (storeIdFilter) query = query.eq("flow.store_id", storeIdFilter)
    if (statusFilter === "success") query = query.in("status", SUCCESS_STATUSES)
    else if (statusFilter === "error") query = query.in("status", ERROR_STATUSES)
    else if (statusFilter === "running")
      query = query.not("status", "in", `(${[...SUCCESS_STATUSES, ...ERROR_STATUSES].join(",")})`)

    const { data: emailData, error: emailErr } = await query
    if (emailErr) throw emailErr
    const emails = (emailData ?? []) as unknown as EmailRow[]

    // Última run por (email, agente) resolvida NO BANCO (DISTINCT ON via
    // agent_studio_latest_runs — migration 20261073). Antes o agrupamento
    // era em JS sobre um teto global de linhas, e um email regenerado
    // muitas vezes (caso real: 439 runs) podia perder a run mais antiga
    // de um agente pro corte, mostrando o nó como "pulado" à toa.
    const emailIds = emails.map((e) => e.id)
    const runsByEmail = new Map<string, LatestRunRow[]>()
    if (emailIds.length > 0) {
      const { data: runData, error: runErr } = await admin.rpc(
        "agent_studio_latest_runs",
        { p_email_ids: emailIds },
      )
      if (runErr) throw runErr
      for (const r of (runData ?? []) as LatestRunRow[]) {
        const list = runsByEmail.get(r.email_id) ?? []
        list.push(r)
        runsByEmail.set(r.email_id, list)
      }
    }

    const executions = emails.map((e) => {
      const runs = (runsByEmail.get(e.id) ?? []).map((r) => ({
        run_id: r.run_id,
        agent: r.agent as PipelineAgentKey,
        model: r.model,
        status: r.status,
        duration_ms: r.duration_ms,
        cost_cents: r.cost_cents != null ? Number(r.cost_cents) : null,
        tokens_input: r.tokens_input,
        tokens_output: r.tokens_output,
        retry_count: r.retry_count,
        error_message: r.error_message,
        created_at: r.created_at,
      }))
      const costCents = runs.reduce((s, r) => s + (r.cost_cents ?? 0), 0)

      return {
        email_id: e.id,
        email_name: e.name ?? `Email ${e.number}`,
        email_number: e.number,
        email_status: e.status,
        bucket: bucketOfEmail(e.status),
        failure_reason: e.failure_reason,
        updated_at: e.updated_at,
        ready_at: e.ready_at,
        failed_at: e.failed_at,
        store_id: e.flow?.store_id ?? null,
        store_name: e.flow?.store?.store_name ?? "—",
        flow_id: e.flow?.id ?? null,
        flow_type: e.flow?.flow_type ?? null,
        flow_type_label: flowTypeLabel(e.flow?.flow_type),
        cost_cents: costCents,
        runs,
      }
    })

    return successResponse(request, { executions })
  } catch (error) {
    log.error("GET agent executions error", error)
    return errorResponse(request, error, "agent-executions-get")
  }
}
