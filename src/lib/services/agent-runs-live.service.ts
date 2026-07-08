/**
 * Live view de execuções de agentes — queries compartilhadas entre o
 * endpoint REST (`/api/admin/agents/runs`) e o SSE
 * (`/api/sse/admin/agents/runs`).
 *
 * Duas dimensões:
 *   1. Runs de agente (`email_generation_runs`) — cada chamada LLM, agora
 *      visível DESDE o início (status 'running' via startGenerationRun).
 *   2. Pipeline por loja — o flow automático como um todo: sinal de fila,
 *      dispatch job (Montador/Blueprint), emails por status não-terminal e
 *      agentes rodando agora.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  ACTIVE_EMAIL_STATUSES,
  type AgentRunsAggregate,
  type LiveAgentRun,
  type PipelineStoreOverview,
  type RunningAgentRun,
} from "@/types/agent-runs-live"

const log = logger.child("AgentRunsLive")

/** Colunas de metadata do run — sem rendered_prompt/raw_output (payload leve). */
const RUN_SELECT =
  "id, created_at, updated_at, batch_id, agent, model, status, tokens_input, tokens_output, cost_cents, duration_ms, retry_count, error_message, store_id, email_id, flow_id"

interface RunRow {
  id: string
  created_at: string
  updated_at: string
  batch_id: string | null
  agent: string
  model: string | null
  status: LiveAgentRun["status"]
  tokens_input: number | null
  tokens_output: number | null
  cost_cents: number | null
  duration_ms: number | null
  retry_count: number | null
  error_message: string | null
  store_id: string
  email_id: string | null
  flow_id: string | null
}

/**
 * Enriquece rows cruas com nomes de loja/email/flow em 3 lookups bulk
 * (a view v_email_generation_logs não expõe updated_at, então lemos a
 * tabela direto e fazemos os joins manualmente).
 */
export async function enrichRuns(rows: RunRow[]): Promise<LiveAgentRun[]> {
  if (rows.length === 0) return []
  const admin = createAdminClient()

  const storeIds = [...new Set(rows.map((r) => r.store_id).filter(Boolean))]
  const emailIds = [...new Set(rows.map((r) => r.email_id).filter(Boolean))] as string[]
  const flowIds = [...new Set(rows.map((r) => r.flow_id).filter(Boolean))] as string[]

  const [storesRes, emailsRes, flowsRes] = await Promise.all([
    storeIds.length
      ? admin.from("client_stores").select("id, store_name").in("id", storeIds)
      : Promise.resolve({ data: [] }),
    emailIds.length
      ? admin.from("email_flow_emails").select("id, name, number").in("id", emailIds)
      : Promise.resolve({ data: [] }),
    flowIds.length
      ? admin.from("email_flows").select("id, flow_type").in("id", flowIds)
      : Promise.resolve({ data: [] }),
  ])

  const storeName = new Map(
    ((storesRes.data ?? []) as Array<{ id: string; store_name: string | null }>).map(
      (s) => [s.id, s.store_name],
    ),
  )
  const emailInfo = new Map(
    (
      (emailsRes.data ?? []) as Array<{
        id: string
        name: string | null
        number: number | null
      }>
    ).map((e) => [e.id, e]),
  )
  const flowType = new Map(
    ((flowsRes.data ?? []) as Array<{ id: string; flow_type: string | null }>).map(
      (f) => [f.id, f.flow_type],
    ),
  )

  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    batch_id: r.batch_id,
    agent: r.agent,
    model: r.model,
    status: r.status,
    tokens_input: r.tokens_input ?? 0,
    tokens_output: r.tokens_output ?? 0,
    cost_cents: Number(r.cost_cents ?? 0),
    duration_ms: r.duration_ms ?? 0,
    retry_count: r.retry_count ?? 0,
    error_message: r.error_message,
    store_id: r.store_id,
    store_name: storeName.get(r.store_id) ?? null,
    email_id: r.email_id,
    email_name: r.email_id ? (emailInfo.get(r.email_id)?.name ?? null) : null,
    email_number: r.email_id ? (emailInfo.get(r.email_id)?.number ?? null) : null,
    flow_id: r.flow_id,
    flow_type: r.flow_id ? (flowType.get(r.flow_id) ?? null) : null,
  }))
}

export interface FetchLiveRunsOptions {
  sinceIso: string
  storeId?: string | null
  agent?: string | null
  status?: string | null
  limit?: number
}

/** Runs na janela, mais recentes primeiro, com nomes resolvidos. */
export async function fetchLiveRuns(
  opts: FetchLiveRunsOptions,
): Promise<LiveAgentRun[]> {
  const admin = createAdminClient()
  let query = admin
    .from("email_generation_runs")
    .select(RUN_SELECT)
    .gte("created_at", opts.sinceIso)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 100, 1), 200))

  if (opts.storeId) query = query.eq("store_id", opts.storeId)
  if (opts.agent) query = query.eq("agent", opts.agent)
  if (opts.status) query = query.eq("status", opts.status)

  const { data, error } = await query
  if (error) throw error
  return enrichRuns((data ?? []) as RunRow[])
}

/** Runs criados/atualizados após `afterIso` (usado pelo polling do SSE). */
export async function fetchRunsUpdatedAfter(
  afterIso: string,
  storeId?: string | null,
): Promise<LiveAgentRun[]> {
  const admin = createAdminClient()
  let query = admin
    .from("email_generation_runs")
    .select(RUN_SELECT)
    .gt("updated_at", afterIso)
    .order("updated_at", { ascending: true })
    .limit(200)
  if (storeId) query = query.eq("store_id", storeId)

  const { data, error } = await query
  if (error) throw error
  return enrichRuns((data ?? []) as RunRow[])
}

export function computeAggregate(runs: LiveAgentRun[]): AgentRunsAggregate {
  let running = 0
  let errors = 0
  let cost = 0
  let durTotal = 0
  let durCount = 0
  for (const r of runs) {
    if (r.status === "running") running += 1
    if (r.status === "error") errors += 1
    cost += r.cost_cents
    if (r.status !== "running" && r.duration_ms > 0) {
      durTotal += r.duration_ms
      durCount += 1
    }
  }
  return {
    count: runs.length,
    running,
    errors,
    cost_cents: cost,
    avg_duration_ms: durCount > 0 ? durTotal / durCount : null,
  }
}

/**
 * Visão do pipeline por loja — tudo que está EM ANDAMENTO agora:
 * sinais de fila pendentes/processando, dispatch jobs ativos, emails em
 * status não-terminal e runs 'running'. Loja sem nenhuma atividade não
 * aparece (lista vazia = "nada foi acionado").
 */
export async function buildPipelineOverview(
  storeIdFilter?: string | null,
): Promise<PipelineStoreOverview[]> {
  const admin = createAdminClient()
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const signalsQuery = admin
    .from("email_generation_queue_signals")
    .select("id, store_id, status, triggered_by, created_at")
    .in("status", ["pending", "processing"])
    .gte("created_at", dayAgo)
    .order("created_at", { ascending: false })
    .limit(100)

  const jobsQuery = admin
    .from("email_dispatch_jobs")
    .select(
      "id, store_id, status, architect_total, architect_done, error, created_at, updated_at",
    )
    .in("status", ["pending", "generating", "dispatching"])
    .order("created_at", { ascending: false })
    .limit(100)

  const emailsQuery = admin
    .from("email_flow_emails")
    .select("id, status, updated_at, flow:email_flows!inner(store_id)")
    .in("status", [...ACTIVE_EMAIL_STATUSES])
    .limit(2000)

  const runningQuery = admin
    .from("email_generation_runs")
    .select("id, agent, model, email_id, store_id, created_at")
    .eq("status", "running")
    .gte("created_at", dayAgo)
    .order("created_at", { ascending: false })
    .limit(100)

  const [signalsRes, jobsRes, emailsRes, runningRes] = await Promise.all([
    signalsQuery,
    jobsQuery,
    emailsQuery,
    runningQuery,
  ])

  for (const res of [signalsRes, jobsRes, emailsRes, runningRes]) {
    if (res.error) {
      log.warn("pipeline_overview.query_failed", { error: res.error.message })
    }
  }

  const byStore = new Map<string, PipelineStoreOverview>()
  const ensure = (storeId: string): PipelineStoreOverview => {
    let s = byStore.get(storeId)
    if (!s) {
      s = {
        store_id: storeId,
        store_name: null,
        queue_signal: null,
        dispatch_job: null,
        email_status_counts: {},
        emails_active: 0,
        running_runs: [],
        last_activity_at: null,
      }
      byStore.set(storeId, s)
    }
    return s
  }
  const touch = (s: PipelineStoreOverview, iso: string | null | undefined) => {
    if (!iso) return
    if (!s.last_activity_at || iso > s.last_activity_at) s.last_activity_at = iso
  }

  for (const raw of signalsRes.data ?? []) {
    const sig = raw as {
      id: string
      store_id: string
      status: string
      triggered_by: string
      created_at: string
    }
    const s = ensure(sig.store_id)
    // Mantém o sinal mais recente (query já vem desc).
    if (!s.queue_signal) {
      s.queue_signal = {
        id: sig.id,
        status: sig.status,
        triggered_by: sig.triggered_by,
        created_at: sig.created_at,
      }
    }
    touch(s, sig.created_at)
  }

  for (const raw of jobsRes.data ?? []) {
    const job = raw as {
      id: string
      store_id: string
      status: string
      architect_total: number
      architect_done: number
      error: string | null
      created_at: string
      updated_at: string
    }
    const s = ensure(job.store_id)
    if (!s.dispatch_job) {
      s.dispatch_job = {
        id: job.id,
        status: job.status,
        architect_total: job.architect_total,
        architect_done: job.architect_done,
        created_at: job.created_at,
        updated_at: job.updated_at,
        error: job.error,
      }
    }
    touch(s, job.updated_at)
  }

  for (const raw of emailsRes.data ?? []) {
    const em = raw as unknown as {
      id: string
      status: string
      updated_at: string | null
      flow: { store_id: string } | Array<{ store_id: string }>
    }
    const storeId = Array.isArray(em.flow) ? em.flow[0]?.store_id : em.flow?.store_id
    if (!storeId) continue
    const s = ensure(storeId)
    s.email_status_counts[em.status] = (s.email_status_counts[em.status] ?? 0) + 1
    s.emails_active += 1
    touch(s, em.updated_at)
  }

  for (const raw of runningRes.data ?? []) {
    const run = raw as {
      id: string
      agent: string
      model: string | null
      email_id: string | null
      store_id: string
      created_at: string
    }
    const s = ensure(run.store_id)
    s.running_runs.push({
      id: run.id,
      agent: run.agent,
      model: run.model,
      email_id: run.email_id,
      email_name: null,
      created_at: run.created_at,
    })
    touch(s, run.created_at)
  }

  let stores = [...byStore.values()]
  if (storeIdFilter) stores = stores.filter((s) => s.store_id === storeIdFilter)
  if (stores.length === 0) return []

  // Resolve nomes (lojas + emails dos runs em execução) em bulk.
  const storeIds = stores.map((s) => s.store_id)
  const runningEmailIds = [
    ...new Set(
      stores.flatMap((s) => s.running_runs.map((r) => r.email_id).filter(Boolean)),
    ),
  ] as string[]

  const [storesRes, runEmailsRes] = await Promise.all([
    admin.from("client_stores").select("id, store_name").in("id", storeIds),
    runningEmailIds.length
      ? admin.from("email_flow_emails").select("id, name").in("id", runningEmailIds)
      : Promise.resolve({ data: [] }),
  ])
  const storeName = new Map(
    ((storesRes.data ?? []) as Array<{ id: string; store_name: string | null }>).map(
      (s) => [s.id, s.store_name],
    ),
  )
  const emailName = new Map(
    ((runEmailsRes.data ?? []) as Array<{ id: string; name: string | null }>).map(
      (e) => [e.id, e.name],
    ),
  )
  for (const s of stores) {
    s.store_name = storeName.get(s.store_id) ?? null
    s.running_runs = s.running_runs.map(
      (r): RunningAgentRun => ({
        ...r,
        email_name: r.email_id ? (emailName.get(r.email_id) ?? null) : null,
      }),
    )
  }

  // Mais atividade recente primeiro.
  stores.sort((a, b) =>
    (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? ""),
  )
  return stores
}
