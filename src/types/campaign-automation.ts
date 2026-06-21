/**
 * Tipos do motor de automações por transição de coluna do board (Fase 3).
 *
 * Cada movimento "para frente" de um card dispara os handlers do REGISTRY
 * cujo `matches(toColumn)` é true. Cada handler grava UMA linha em
 * campaign_automation_runs e dispara o efeito. Na Fase 3 todos os handlers
 * são STUB (status='stub', sem HTTP); na Fase 4 o corpo vira HTTP real sem
 * mudar este contrato nem a tabela.
 */

import type { BoardColumnKey } from "@/lib/services/campaign-central/board-mapping"

/** Integrações suportadas (espelha o CHECK de campaign_automation_runs). */
export type AutomationIntegration =
  | "clickup"
  | "slack"
  | "omnisend"
  | "ga"
  | "internal"

/** Status de uma run (espelha o CHECK de campaign_automation_runs). */
export type AutomationRunStatus =
  | "pending"
  | "success"
  | "failed"
  | "skipped"
  | "stub"

/** Linha de campaign_automation_runs (output do GET /automations). */
export interface CampaignAutomationRun {
  id: string
  org_id: string
  suggestion_id: string | null
  pipeline_item_id: string | null
  from_column: string | null
  to_column: string
  integration: AutomationIntegration
  status: AutomationRunStatus
  request_payload: Record<string, unknown> | null
  response_status: number | null
  response_body: string | null
  external_ref: string | null
  error_message: string | null
  triggered_by: string | null
  duration_ms: number | null
  created_at: string
}

/**
 * Contexto passado a cada handler. É o snapshot mínimo do card + transição
 * necessário pra montar um request_payload realista. Estável entre Fase 3
 * (stub) e Fase 4 (HTTP real).
 */
export interface AutomationContext {
  orgId: string
  userId: string
  fromColumn: BoardColumnKey
  toColumn: BoardColumnKey
  suggestionId: string | null
  pipelineItemId: string | null
  /** Título/assunto da campanha (pra mensagem do ClickUp/Slack etc.). */
  title: string
  subject: string | null
  sendDate: string | null
  /** Lojas-alvo (id + nome) — usadas no payload de Omnisend/ClickUp. */
  stores: Array<{ store_id: string; store_name: string }>
}

/** Resultado de um handler.run() — gravado direto na linha da run. */
export interface AutomationRunResult {
  status: AutomationRunStatus
  /** Corpo da requisição que SERIA enviada (Fase 3 grava; Fase 4 envia). */
  requestPayload: Record<string, unknown>
  responseStatus?: number | null
  responseBody?: string | null
  /** Referência externa (ex.: id da task ClickUp, campaign_id Omnisend). */
  externalRef?: string | null
  errorMessage?: string | null
}

/**
 * Interface comum de um handler de automação. O REGISTRY guarda uma lista
 * destes; o service consulta `matches(toColumn)` e chama `run(ctx)`.
 *
 * A assinatura é ESTÁVEL: na Fase 4 só o corpo de `run` muda (de montar
 * payload → fazer HTTP real). Nem a tabela nem este contrato mudam.
 */
export interface AutomationHandler {
  integration: AutomationIntegration
  /** Casa com a coluna de destino da transição? */
  matches(toColumn: BoardColumnKey): boolean
  /** Executa o efeito (Fase 3: stub). */
  run(ctx: AutomationContext): Promise<AutomationRunResult>
}
