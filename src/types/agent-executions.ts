/**
 * Execuções do pipeline de geração, como a aba Execuções do Estúdio as vê.
 *
 * Tipo compartilhado entre servidor e cliente de propósito: a listagem REST
 * (`/api/admin/agents/executions`) e o SSE
 * (`/api/sse/admin/agents/executions`) precisam entregar o MESMO objeto,
 * senão a tela mostra uma coisa no primeiro carregamento e outra no
 * primeiro evento. Quem monta é `agent-executions.service.ts`, nas duas
 * entradas.
 */

import type { ExecutionAgentRun } from "@/lib/agents/studio-graph"

/**
 * Status de e-mail que significam "geração EM VOO".
 *
 * `generation_batch_id` só é gravado quando a copy volta do n8n, então
 * filtrar apenas por ele esconde a geração exatamente na janela em que ela
 * pode empacar (fase 1 → dispatch → aguardando callback). Esta lista é a
 * segunda porta de entrada da listagem.
 *
 * SYNC: a mesma lista é o predicado LITERAL do índice
 * `idx_efe_em_voo_updated` e da perna 2 de `agent_studio_executions_delta`
 * (migration 20261127). Mudar aqui sem mudar lá não quebra nada em
 * silêncio — o índice deixa de servir a query e o delta fica lento.
 *
 * Difere de `ACTIVE_EMAIL_STATUSES` (types/agent-runs-live) por incluir
 * `in_progress`, que é status LEGACY do epic Klaviyo mas ainda aparece em
 * e-mail antigo em voo.
 */
export const EM_VOO = [
  "pending",
  "in_progress",
  "copy_generating",
  "copy_generating_recovery",
  "copy_ready",
  "rendering",
  "image_done",
  "qa_running",
] as const

export type EmailEmVoo = (typeof EM_VOO)[number]

/** Bucket agregado da execução, derivado do status do e-mail. */
export type ExecutionBucket = "success" | "error" | "running"

/** Run de um agente dentro de uma execução (a mais recente por agente). */
export type AgentExecutionRun = ExecutionAgentRun & {
  model: string | null
  created_at: string
}

export interface AgentExecution {
  email_id: string
  email_name: string
  email_number: number
  email_status: string
  bucket: ExecutionBucket
  failure_reason: string | null
  updated_at: string
  ready_at: string | null
  failed_at: string | null
  store_id: string | null
  store_name: string
  flow_id: string | null
  flow_type: string | null
  flow_type_label: string
  cost_cents: number
  runs: AgentExecutionRun[]
}

export interface AgentExecutionsPayload {
  executions: AgentExecution[]
}
