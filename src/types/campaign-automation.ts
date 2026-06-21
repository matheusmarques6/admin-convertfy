/**
 * Tipos do registro interno de transições do board da Central de Campanhas.
 *
 * DECISÃO DE PRODUTO (Fase 4): a aba "Automações" NÃO integra vendors externos
 * (ClickUp/Slack/Omnisend/GA). O envio/agendamento é feito manualmente na
 * Omnisend; os dados já estão no banco. Aqui registramos apenas um LOG DE
 * AUDITORIA INTERNO das movimentações "para frente" do board — sem HTTP, sem
 * payload de vendor.
 *
 * Cada avanço de coluna de um card grava UMA linha em campaign_automation_runs
 * com integration='internal' e uma mensagem legível
 * (ex.: 'Campanha "X": Copy → Design').
 *
 * A tabela campaign_automation_runs é genérica e foi mantida da Fase 3; as
 * colunas de vendor (request_payload/response_status/response_body/external_ref)
 * ficam nullable e NÃO são mais populadas (ver migration
 * 20260621_campaign_automation_runs.sql). Não há migration nova.
 */

import type { BoardColumnKey } from "@/lib/services/campaign-central/board-mapping"

/**
 * Origem do registro. Hoje é sempre 'internal' (transição do board). O CHECK da
 * tabela ainda aceita os antigos rótulos de vendor por compatibilidade, mas o
 * código só grava 'internal'.
 */
export type AutomationIntegration = "internal"

/**
 * Status de uma run. Transições internas são sempre 'success' (a transição já
 * persistiu no board antes do registro). 'failed' fica reservado pra um registro
 * que não pôde ser gravado/processado — destacado na aba.
 */
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
  /** Mensagem legível da transição (ex.: 'Campanha "X": Copy → Design'). */
  error_message: string | null
  /** Quem moveu o card (profile id). Resolvido pra nome no endpoint. */
  triggered_by: string | null
  duration_ms: number | null
  created_at: string
  // Colunas de vendor da Fase 3 — mantidas nullable na tabela, NÃO populadas.
  // Omitidas do tipo de leitura porque a aba não as usa mais.
}

/**
 * Linha enriquecida com o nome de quem moveu (join best-effort com profiles no
 * endpoint). É o shape consumido pela aba de histórico.
 */
export interface CampaignAutomationRunView extends CampaignAutomationRun {
  /** Nome (ou email) de quem moveu o card; null se não resolvido. */
  moved_by_name: string | null
}

/**
 * Contexto de uma transição usado pra montar a mensagem legível do registro.
 * É o snapshot mínimo do card + transição.
 */
export interface AutomationContext {
  orgId: string
  userId: string
  fromColumn: BoardColumnKey
  toColumn: BoardColumnKey
  suggestionId: string | null
  pipelineItemId: string | null
  /** Título da campanha (pra mensagem do registro). */
  title: string
}
