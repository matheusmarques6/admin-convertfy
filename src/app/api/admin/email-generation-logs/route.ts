/**
 * GET /api/admin/email-generation-logs — telemetria operacional do
 * pipeline AE (Epic AE).
 *
 * Lê `v_email_generation_logs` (view criada na migration 20260726) com
 * filtros opcionais e devolve KPIs + by_agent + by_day + by_type +
 * by_status + recent rows.
 *
 * Query params:
 *   - days: janela em dias (default 14, max 365)
 *   - agent: 'copy'|'blueprint'|'assembler'|'assembler_chooser'|'image'|'html'|
 *     'qa'|'qavision'|'seed'|'copy_dispatch'|'campaign_image'
 *     ('qavision' filtra is_qa_vision=true; 'qa' filtra is_qa_vision=false)
 *   - status: 'success'|'error'|'running'
 *   - store_id: UUID
 *   - flow_type: slug
 *
 * Auth: canManagePrompts (admin/owner OU tag 'dev').
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
import { convertToBRL } from "@/lib/services/exchange-rate.service"
import {
  PIPELINE_AGENT_ORDER,
  flowTypeLabel,
  type PipelineAgentKey,
} from "@/lib/agents/agent-visual"
import { logger } from "@/lib/logger"

const log = logger.child("EmailGenerationLogsRoute")

export const dynamic = "force-dynamic"

interface LogRow {
  id: string
  created_at: string
  batch_id: string | null
  agent: string
  model: string | null
  status: string
  tokens_input: number | null
  tokens_output: number | null
  cost_cents: number | null
  duration_ms: number | null
  retry_count: number | null
  error_message: string | null
  store_id: string | null
  store_name: string | null
  email_id: string | null
  email_name: string | null
  email_position: number | null
  flow_id: string | null
  flow_type: string | null
  is_qa_vision: boolean | null
  // Sinais de curadoria (CM-7) — derivados na view, não é o parsed_output
  // inteiro: ele carrega snapshots de HTML e pesaria dezenas de KB por linha.
  curation_skipped_blocks: number | null
  curation_excluded_untagged: number | null
  curation_rank_deviations: number | null
  curation_rendered_stale: boolean | null
}

interface AgentAggregate {
  agent: PipelineAgentKey
  runs: number
  errors: number
  retries: number
  cost_cents: number
  duration_ms_total: number
  duration_ms_count: number
  tokens_in_total: number
  tokens_in_count: number
  tokens_out_total: number
  tokens_out_count: number
  /** Modelo mais frequente (mostrado no resumo). */
  model_counts: Map<string, number>
}

function emptyAgentAgg(agent: PipelineAgentKey): AgentAggregate {
  return {
    agent,
    runs: 0,
    errors: 0,
    retries: 0,
    cost_cents: 0,
    duration_ms_total: 0,
    duration_ms_count: 0,
    tokens_in_total: 0,
    tokens_in_count: 0,
    tokens_out_total: 0,
    tokens_out_count: 0,
    model_counts: new Map(),
  }
}

/**
 * Mapeia row.agent + is_qa_vision → bucket key da maquete. QA com
 * vision_ran=true vira "qavision" no agregado.
 */
function bucketOf(row: LogRow): PipelineAgentKey {
  if (row.agent === "qa" && row.is_qa_vision) return "qavision"
  if (
    row.agent === "copy" ||
    row.agent === "estruturador" ||
    row.agent === "blueprint" ||
    row.agent === "subject" ||
    row.agent === "assembler_chooser" ||
    row.agent === "assembler" ||
    row.agent === "image" ||
    row.agent === "hero_section" ||
    row.agent === "copy_merge" ||
    row.agent === "text_format" ||
    row.agent === "image_format" ||
    row.agent === "color_format" ||
    row.agent === "html" ||
    row.agent === "refiner" ||
    row.agent === "qa" ||
    row.agent === "seed" ||
    row.agent === "copy_dispatch" ||
    row.agent === "campaign_image"
  ) {
    return row.agent as PipelineAgentKey
  }
  // Fallback inesperado — agrupa como 'seed' pra não silenciar.
  return "seed"
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    // Auth: mesmo gate dos prompts e blueprints.
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
    const days = Math.min(
      Math.max(parseInt(sp.get("days") ?? "14", 10) || 14, 1),
      365,
    )
    const agentFilter = sp.get("agent")
    const statusFilter = sp.get("status")
    const storeIdFilter = sp.get("store_id")
    const flowTypeFilter = sp.get("flow_type")

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // Paginação interna pra agregações: até 10k rows. Acima disso, payload
    // marca truncated=true (mesma estratégia de /api/admin/ai-usage).
    const PAGE = 1000
    const MAX_ROWS = 10000
    const rows: LogRow[] = []
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
      // Select EXPLÍCITO — nunca "*": a view expõe input_vars/parsed_output
      // (JSONB gigantes; runs de html carregam o reference_html inteiro em
      // input_vars). Puxá-los força detoast de dezenas de KB POR LINHA ×
      // 1000/página → statement timeout 57014 (incidente 20/jul). A lista
      // só precisa dos metadados; o detalhe ([id]) lê a tabela direto.
      let query = admin
        .from("v_email_generation_logs")
        .select(
          "id, created_at, batch_id, agent, model, status, tokens_input, tokens_output, cost_cents, duration_ms, retry_count, error_message, store_id, store_name, email_id, email_name, email_position, flow_id, flow_type, is_qa_vision, curation_skipped_blocks, curation_excluded_untagged, curation_rank_deviations, curation_rendered_stale",
        )
        .gte("created_at", since)
        // component_test é teste ad-hoc da biblioteca (aba Componentes), não
        // faz parte de nenhuma geração real — fora dos KPIs do pipeline (senão
        // cairia no bucket 'seed' e inflaria custo/execuções).
        .neq("agent", "component_test")
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE - 1)

      // 'qavision' e 'qa' são derivados — filtra via is_qa_vision.
      if (agentFilter === "qavision") {
        query = query.eq("agent", "qa").eq("is_qa_vision", true)
      } else if (agentFilter === "qa") {
        query = query.eq("agent", "qa").eq("is_qa_vision", false)
      } else if (agentFilter) {
        query = query.eq("agent", agentFilter)
      }
      if (statusFilter) query = query.eq("status", statusFilter)
      if (storeIdFilter) query = query.eq("store_id", storeIdFilter)
      if (flowTypeFilter) query = query.eq("flow_type", flowTypeFilter)

      const { data, error } = await query
      if (error) throw error
      const batch = (data ?? []) as LogRow[]
      rows.push(...batch)
      if (batch.length < PAGE) break
    }
    const truncated = rows.length >= MAX_ROWS

    // ── Agregações ──────────────────────────────────────────
    const byAgent = new Map<PipelineAgentKey, AgentAggregate>()
    for (const k of PIPELINE_AGENT_ORDER) {
      byAgent.set(k, emptyAgentAgg(k))
    }
    let totalCostCents = 0
    let totalTokensIn = 0
    let totalTokensOut = 0
    let totalErrors = 0
    let totalRetries = 0
    let trackedDurationMs = 0
    let trackedDurationCount = 0
    const byStatus = { success: 0, error: 0, running: 0, skipped: 0 }
    const byDay = new Map<string, { runs: number; cost_cents: number }>()
    const byType = new Map<string, number>()

    for (const row of rows) {
      const key = bucketOf(row)
      const agg = byAgent.get(key) ?? emptyAgentAgg(key)
      byAgent.set(key, agg)

      agg.runs += 1
      const isError = row.status === "error"
      if (isError) {
        agg.errors += 1
        totalErrors += 1
      }
      const retries = row.retry_count ?? 0
      agg.retries += retries
      totalRetries += retries

      const cost = Number(row.cost_cents ?? 0)
      agg.cost_cents += cost
      totalCostCents += cost

      if (row.duration_ms != null) {
        agg.duration_ms_total += row.duration_ms
        agg.duration_ms_count += 1
        // "tempo médio · execuções rastreadas" da maquete exclui copy (externo)
        if (key !== "copy") {
          trackedDurationMs += row.duration_ms
          trackedDurationCount += 1
        }
      }
      if (row.tokens_input != null) {
        agg.tokens_in_total += row.tokens_input
        agg.tokens_in_count += 1
        totalTokensIn += row.tokens_input
      }
      if (row.tokens_output != null) {
        agg.tokens_out_total += row.tokens_output
        agg.tokens_out_count += 1
        totalTokensOut += row.tokens_output
      }
      if (row.model) {
        agg.model_counts.set(row.model, (agg.model_counts.get(row.model) ?? 0) + 1)
      }

      // by_status
      if (row.status === "success") byStatus.success += 1
      else if (row.status === "error") byStatus.error += 1
      else if (row.status === "running") byStatus.running += 1
      else if (row.status === "skipped") byStatus.skipped += 1

      // by_day
      const day = row.created_at.slice(0, 10)
      const dayAgg = byDay.get(day) ?? { runs: 0, cost_cents: 0 }
      dayAgg.runs += 1
      dayAgg.cost_cents += cost
      byDay.set(day, dayAgg)

      // by_type
      if (row.flow_type) {
        byType.set(row.flow_type, (byType.get(row.flow_type) ?? 0) + 1)
      }
    }

    const trackedRuns = Array.from(byAgent.entries())
      .filter(([k]) => k !== "copy")
      .reduce((s, [, a]) => s + a.runs, 0)
    const externalRuns = byAgent.get("copy")?.runs ?? 0
    const totalRuns = trackedRuns + externalRuns

    // Câmbio: override manual em email_generation_settings.usd_brl_rate
    // (aba Configurações) tem prioridade; sem override, cotação online
    // (cacheada 1h pelo exchange-rate.service).
    let fxBrlRate: number | null = null
    try {
      const { data: fxSettings } = await admin
        .from("email_generation_settings")
        .select("usd_brl_rate")
        .not("usd_brl_rate", "is", null)
        .limit(1)
        .maybeSingle()
      const manualRate = (fxSettings?.usd_brl_rate as number | null) ?? null
      fxBrlRate = manualRate ?? (await convertToBRL(1, "USD"))
    } catch (e) {
      log.warn("fx_brl_failed", { error: e instanceof Error ? e.message : String(e) })
    }

    // Top model por agente
    const topModel = (counts: Map<string, number>): string | null => {
      if (counts.size === 0) return null
      let best: string | null = null
      let bestCount = 0
      for (const [m, c] of counts) {
        if (c > bestCount) {
          best = m
          bestCount = c
        }
      }
      return best
    }

    // ── Payload ─────────────────────────────────────────────
    const by_agent = PIPELINE_AGENT_ORDER.map((k) => {
      const a = byAgent.get(k)!
      return {
        agent: a.agent,
        runs: a.runs,
        errors: a.errors,
        retries: a.retries,
        cost_cents: a.cost_cents,
        cost_usd: a.cost_cents / 100,
        avg_duration_ms:
          a.duration_ms_count > 0 ? a.duration_ms_total / a.duration_ms_count : null,
        avg_tokens_in:
          a.tokens_in_count > 0 ? Math.round(a.tokens_in_total / a.tokens_in_count) : null,
        avg_tokens_out:
          a.tokens_out_count > 0 ? Math.round(a.tokens_out_total / a.tokens_out_count) : null,
        model: topModel(a.model_counts),
      }
    })

    return successResponse(request, {
      window_days: days,
      truncated,
      fx_brl_rate: fxBrlRate,
      totals: {
        runs: totalRuns,
        tracked_runs: trackedRuns,
        external_runs: externalRuns,
        errors: totalErrors,
        retries: totalRetries,
        cost_cents: totalCostCents,
        cost_usd: totalCostCents / 100,
        tokens_input: totalTokensIn,
        tokens_output: totalTokensOut,
        avg_duration_ms:
          trackedDurationCount > 0 ? trackedDurationMs / trackedDurationCount : null,
      },
      by_agent,
      by_day: Array.from(byDay.entries())
        .map(([day, v]) => ({ day, runs: v.runs, cost_cents: v.cost_cents, cost_usd: v.cost_cents / 100 }))
        .sort((a, b) => a.day.localeCompare(b.day)),
      by_type: Array.from(byType.entries())
        .map(([flow_type, runs]) => ({
          flow_type,
          label: flowTypeLabel(flow_type),
          runs,
        }))
        .sort((a, b) => b.runs - a.runs),
      by_status: byStatus,
      recent: rows.slice(0, 50).map((r) => ({
        id: r.id,
        created_at: r.created_at,
        store_id: r.store_id,
        store_name: r.store_name,
        email_id: r.email_id,
        email_name: r.email_name,
        flow_type: r.flow_type,
        flow_type_label: flowTypeLabel(r.flow_type ?? undefined),
        agent: bucketOf(r),
        model: r.model,
        status: r.status,
        duration_ms: r.duration_ms,
        cost_cents: r.cost_cents,
        tokens_input: r.tokens_input,
        tokens_output: r.tokens_output,
        retry_count: r.retry_count,
        error_message: r.error_message,
        // Sinais de curadoria (CM-7): nenhum é erro — o email foi entregue.
        // Indicam biblioteca incompleta, exemplo velho ou ranking corrigido.
        curation: {
          skipped_blocks: r.curation_skipped_blocks ?? 0,
          excluded_untagged: r.curation_excluded_untagged ?? 0,
          rank_deviations: r.curation_rank_deviations ?? 0,
          rendered_stale: r.curation_rendered_stale === true,
        },
      })),
    })
  } catch (error) {
    log.error("GET email-generation-logs error", error)
    return errorResponse(request, error, "email-generation-logs-get")
  }
}
