/**
 * Tipos compartilhados do motor da ConvertIA (rota, loop, persistência,
 * job de continuação e UI leem daqui). Client-safe: só tipos.
 */

import type { ToolErrorCode } from "./tool-errors"
import type { TurnUsageSummary } from "./telemetry"

/** Uma consulta/execução feita no turno — vai para meta.sources. */
export interface TurnSource {
  connector: string
  connector_name: string
  tool: string
  label: string
  summary: string | null
  args_summary: string | null
  write: boolean
  /** Duração da execução (ms). */
  ms?: number
  /** Resumo (~300 chars) do resultado — memória de consulta. */
  digest?: string | null
  /** Código do erro estruturado quando a tool falhou. */
  error_code?: ToolErrorCode | null
  /** Quantas vezes foi repetida por erro transitório. */
  retries?: number
  /** Id da confirmação pendente que esta chamada gerou (gate da UI). */
  confirmation_id?: string | null
}

/** Ação destrutiva aguardando o "Confirmar" do usuário (meta.pending_confirmation). */
export interface PendingConfirmation {
  id: string
  connector: string
  connector_name: string
  tool: string
  label: string
  /** Descrição humana do que será executado ("Enviar a campanha X para 12.400 contatos"). */
  summary: string
  args: Record<string, unknown>
  created_at: string
  /** Preenchido quando o usuário confirmou/cancelou (uso único). */
  resolved_at?: string | null
  resolution?: "approved" | "rejected" | null
}

export type TurnStatus = "success" | "error" | "cancelled" | "budget"

/** Evento SSE emitido pelo loop (o cliente e o job consomem). */
export type TurnEvent =
  | { type: "delta"; text: string }
  | { type: "round_end"; kind: "progress" }
  | {
      type: "tool"
      id: string
      status: "start"
      connector: string
      connector_name: string
      name: string
      label: string
      write: boolean
      args_summary: string | null
    }
  | {
      type: "tool"
      id: string
      status: "done"
      summary: string | null
      ms: number
      error_code?: ToolErrorCode | null
      retries?: number
    }
  | { type: "confirm"; confirmation: PendingConfirmation }
  | { type: "notice"; text: string }

/** Metadados gravados em ai_chat_messages.meta da resposta. */
export interface AssistantMessageMeta {
  model: string
  streaming: boolean
  started_at?: string
  updated_at?: string
  sources: TurnSource[]
  progress: string[]
  deep?: boolean
  skills: string[]
  usage?: TurnUsageSummary
  error?: string
  status?: TurnStatus
  cancel_requested?: boolean
  pending_confirmation?: PendingConfirmation | null
  /** Continuação em job (item 12). */
  continuation?: { job_id: string; status: "queued" | "running" | "done" | "failed"; reason?: string } | null
  /** Fallback de modelo aplicado neste turno. */
  model_fallback?: { requested: string; used: string } | null
  feedback?: { rating?: string } | null
}
