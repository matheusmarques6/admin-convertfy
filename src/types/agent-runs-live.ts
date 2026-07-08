/**
 * Tipos da live view de execuções de agentes (/admin/agents/runs).
 *
 * Compartilhados entre o service server-side
 * (`agent-runs-live.service.ts`), os endpoints REST/SSE e o hook client
 * (`use-agent-runs-live.ts`). Ficam aqui (e não no service) porque o
 * client component não pode importar módulos que puxam supabase/server.
 */

import type { GenerationRunStatus } from "./email-generation"

/** Row de `email_generation_runs` enriquecida com nomes (loja/email/flow). */
export interface LiveAgentRun {
  id: string
  created_at: string
  updated_at: string
  batch_id: string | null
  agent: string
  model: string | null
  status: GenerationRunStatus
  tokens_input: number
  tokens_output: number
  cost_cents: number
  duration_ms: number
  retry_count: number
  error_message: string | null
  store_id: string
  store_name: string | null
  email_id: string | null
  email_name: string | null
  email_number: number | null
  flow_id: string | null
  flow_type: string | null
}

/** Agente rodando AGORA (run com status='running'). */
export interface RunningAgentRun {
  id: string
  agent: string
  model: string | null
  email_id: string | null
  email_name: string | null
  created_at: string
}

/** Visão do pipeline de UMA loja com atividade em andamento. */
export interface PipelineStoreOverview {
  store_id: string
  store_name: string | null
  /** Sinal de fila (briefing confirmado → geração) pendente/processando. */
  queue_signal: {
    id: string
    status: string
    triggered_by: string
    created_at: string
  } | null
  /** Job Montador+Blueprint→n8n ativo (pending/generating/dispatching). */
  dispatch_job: {
    id: string
    status: string
    architect_total: number
    architect_done: number
    created_at: string
    updated_at: string
    error: string | null
  } | null
  /** Contagem de emails por status NÃO-terminal (pending, rendering, ...). */
  email_status_counts: Record<string, number>
  /** Total de emails ativos (soma de email_status_counts). */
  emails_active: number
  /** Runs de agente em execução nesta loja. */
  running_runs: RunningAgentRun[]
  /** Timestamp mais recente de atividade observada (job/sinal/run). */
  last_activity_at: string | null
}

export interface AgentRunsAggregate {
  count: number
  running: number
  errors: number
  cost_cents: number
  avg_duration_ms: number | null
}

/** Payload do GET /api/admin/agents/runs (e do fallback SWR). */
export interface AgentRunsPayload {
  window_min: number
  generated_at: string
  runs: LiveAgentRun[]
  aggregate: AgentRunsAggregate
  pipeline: PipelineStoreOverview[]
}

/**
 * Statuses de email considerados "ativos" (pipeline em andamento).
 * Espelha a máquina de estados canônica de `email_flow_emails.status`.
 */
export const ACTIVE_EMAIL_STATUSES = [
  "pending",
  "copy_generating",
  "copy_generating_recovery",
  "copy_ready",
  "rendering",
  "image_done",
  "qa_running",
] as const

/**
 * Run 'running' mais velho que isso é considerado obsoleto (processo
 * serverless provavelmente morreu antes do finish). A UI sinaliza.
 */
export const RUNNING_STALE_MS = 10 * 60 * 1000
