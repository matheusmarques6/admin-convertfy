/**
 * agent-executions — as execuções do pipeline como a aba Execuções do
 * Estúdio de Agentes as vê, e o DELTA que faz a aba ser tempo real.
 *
 * Extraído da rota `/api/admin/agents/executions` (set/2026) porque agora
 * existem DUAS entradas para o mesmo dado: a listagem REST (primeiro
 * carregamento e fallback) e o SSE (`/api/sse/admin/agents/executions`).
 * Se cada uma montasse o objeto por conta, a tela mostraria uma coisa no
 * carregamento e outra no primeiro evento — e a divergência apareceria
 * como "o nó mudou de status sozinho".
 *
 * ── Por que o tempo real é feito em DUAS perguntas ────────────────────
 *
 * `fetchChangedExecutionIds` pergunta "mexeu algo desde X?" e devolve só
 * ids; `fetchAgentExecutions` monta o payload. O SSE só faz a segunda
 * pergunta quando a primeira devolve algo, então uma conexão ociosa custa
 * duas varreduras de índice a cada 2s e ZERO byte no cliente.
 *
 * Repetir a listagem a cada 2s seria o caminho óbvio e o errado: o filtro
 * é um OR (`generation_batch_id.not.is.null` OU status em voo) e o índice
 * de `updated_at` é parcial em `generation_batch_id IS NOT NULL`, então o
 * OR não é servido por ele. É o padrão que custou 372 min de CPU no
 * incidente do inbox (CLAUDE.md, "Inbox — recuperação de custo no banco").
 */

import { createAdminClient } from "@/lib/supabase/server"
import { flowTypeLabel, type PipelineAgentKey } from "@/lib/agents/agent-visual"
import { logger } from "@/lib/logger"
import {
  EM_VOO,
  type AgentExecution,
  type ExecucaoManualResumo,
  type ExecutionBucket,
} from "@/types/agent-executions"

/** Status terminais de sucesso — `approved`/`live` são do epic Klaviyo. */
const log = logger.child("AgentExecucoes")

const SUCCESS_STATUSES = ["ready", "approved", "live"] as const
const ERROR_STATUSES = ["failed"] as const

/** Bucket da execução a partir do status do e-mail. Puro. */
export function bucketOfEmail(status: string): ExecutionBucket {
  if ((SUCCESS_STATUSES as readonly string[]).includes(status)) return "success"
  if ((ERROR_STATUSES as readonly string[]).includes(status)) return "error"
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
 * Linha de `agent_studio_latest_runs` (migration 20261073): já é a run
 * MAIS RECENTE por (e-mail, agente), com QA Vision derivado no banco
 * (bucket 'qavision') e `component_test` de fora.
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

const EMAIL_SELECT = `id, number, name, status, generation_batch_id, ready_at,
  failed_at, failure_reason, updated_at,
  flow:email_flows!inner(id, flow_type, store_id,
    store:client_stores!inner(id, store_name))`

export interface FetchExecutionsOptions {
  limit?: number
  /** Filtro de bucket (aplicado por status do e-mail). */
  status?: ExecutionBucket | null
  storeId?: string | null
  /**
   * Recorte por e-mail — o caminho do SSE. Com ids, `limit`/`status`/
   * `storeId` não se aplicam: o pedido é "monte exatamente estas".
   */
  emailIds?: string[]
}

/**
 * Monta as execuções. UM montador para REST e SSE.
 *
 * A run por agente vem resolvida NO BANCO (`DISTINCT ON` via
 * `agent_studio_latest_runs`): antes o agrupamento era em JS sobre um teto
 * global de linhas, e um e-mail regenerado muitas vezes (caso real: 439
 * runs) podia perder a run de um agente pro corte e mostrar o nó como
 * "pulado" à toa.
 */
export async function fetchAgentExecutions(
  opts: FetchExecutionsOptions = {},
): Promise<AgentExecution[]> {
  const admin = createAdminClient()
  const { emailIds, storeId, status } = opts
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100)

  let query = admin.from("email_flow_emails").select(EMAIL_SELECT)

  if (emailIds && emailIds.length > 0) {
    query = query.in("id", emailIds).limit(emailIds.length)
  } else if (emailIds) {
    // Lista vazia explícita: nada a montar (o `.in([])` do PostgREST é
    // válido, mas a ida ao banco é desnecessária).
    return []
  } else {
    query = query
      // Duas portas: peça que já gerou (tem batch) e peça EM VOO, que
      // ainda não tem batch — sem a segunda, a geração some da tela
      // justamente na janela em que pode empacar.
      .or(
        `generation_batch_id.not.is.null,status.in.(${EM_VOO.join(",")})`,
      )
      .order("updated_at", { ascending: false })
      .limit(limit)
    if (storeId) query = query.eq("flow.store_id", storeId)
    if (status === "success") {
      query = query.in("status", [...SUCCESS_STATUSES])
    } else if (status === "error") {
      query = query.in("status", [...ERROR_STATUSES])
    } else if (status === "running") {
      query = query.not(
        "status",
        "in",
        `(${[...SUCCESS_STATUSES, ...ERROR_STATUSES].join(",")})`,
      )
    }
  }

  const { data, error } = await query
  if (error) throw error
  const emails = (data ?? []) as unknown as EmailRow[]
  if (emails.length === 0) return []

  const emailIdsResolvidos = emails.map((e) => e.id)

  const runsByEmail = new Map<string, LatestRunRow[]>()
  const { data: runData, error: runErr } = await admin.rpc(
    "agent_studio_latest_runs",
    { p_email_ids: emailIdsResolvidos },
  )
  if (runErr) throw runErr

  // Execuções manuais vivas destes e-mails. Uma query para o lote (o
  // índice parcial `uniq_ege_manual_viva` garante no máximo uma por
  // e-mail), e fail-open: sem a migration 20261129 a coluna `manual` sai
  // null e a aba funciona como antes.
  const manualPorEmail = new Map<string, ExecucaoManualResumo>()
  try {
    const { data: manuais, error: manualErr } = await admin
      .from("email_generation_executions")
      .select("id, email_id, status, stopped_at_node, overrides, started_at")
      .eq("mode", "manual")
      .in("status", ["running", "paused"])
      .in("email_id", emailIdsResolvidos)
    if (manualErr) throw manualErr
    for (const m of (manuais ?? []) as Array<{
      id: string
      email_id: string
      status: string
      stopped_at_node: string | null
      overrides: Record<string, unknown> | null
      started_at: string
    }>) {
      manualPorEmail.set(m.email_id, {
        id: m.id,
        status: m.status === "paused" ? "paused" : "running",
        stopped_at_node: m.stopped_at_node,
        overrides: m.overrides ?? {},
        started_at: m.started_at,
      })
    }
  } catch (err) {
    log.warn("execucoes.manuais_indisponiveis", { err })
  }
  for (const r of (runData ?? []) as LatestRunRow[]) {
    const list = runsByEmail.get(r.email_id) ?? []
    list.push(r)
    runsByEmail.set(r.email_id, list)
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
      cost_cents: runs.reduce((s, r) => s + (r.cost_cents ?? 0), 0),
      runs,
      manual: manualPorEmail.get(e.id) ?? null,
    } satisfies AgentExecution
  })

  // Com recorte por ids o PostgREST não garante ordem — e a lista da tela
  // é cronológica.
  if (emailIds) {
    executions.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }
  return executions
}

export interface ChangedExecution {
  emailId: string
  changedAt: string
}

/**
 * Quais execuções mexeram desde `sinceIso` — status do e-mail ou run de
 * agente (o INSERT com 'running' do `startGenerationRun` entra aqui, e é
 * ele que acende o nó no canvas no instante em que o agente começa).
 *
 * Devolve só ids, de propósito: é a pergunta barata que o SSE faz de 2 em
 * 2 segundos. Ver `agent_studio_executions_delta` (migration 20261127)
 * para por que são três pernas UNION ALL e não um OR.
 */
export async function fetchChangedExecutionIds(
  sinceIso: string,
  limit = 60,
): Promise<ChangedExecution[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc("agent_studio_executions_delta", {
    p_since: sinceIso,
    p_limit: limit,
  })
  if (error) throw error
  return ((data ?? []) as Array<{ email_id: string; changed_at: string }>).map(
    (r) => ({ emailId: r.email_id, changedAt: r.changed_at }),
  )
}
