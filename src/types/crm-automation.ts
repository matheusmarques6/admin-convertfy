/**
 * Tipos do DAG de automacoes CRM (Fase 5).
 *
 * DAG = grafo direcionado com nodes e edges. Cada node tem um type
 * (trigger, condition, action, ai_action) e um config especifico.
 * Edges podem ter `condition` (boolean expression) pra branching.
 *
 * Este arquivo e o "contrato" entre o builder visual (ReactFlow), o
 * persister (JSON em automations.dag) e o executor server-side.
 */

export type AutomationScope = "sales" | "cs" | "internal" | "general"

export type CrmTriggerType =
  | "deal_stage_change"
  | "deal_created"
  | "lead_created"
  | "lead_qualified"
  | "thread_message_received"
  | "manual"
  | "schedule"

export type CrmNodeType =
  | "trigger"
  | "condition"
  | "wait"
  | "action_send_whatsapp"
  | "action_create_deal"
  | "action_update_deal"
  | "action_create_activity"
  | "action_assign_owner"
  | "action_move_stage"
  | "action_webhook"
  | "ai_action"

export interface CrmAutomationNode {
  id: string
  type: CrmNodeType
  position?: { x: number; y: number } // p/ ReactFlow
  config: Record<string, unknown>
}

export interface CrmAutomationEdge {
  id: string
  from: string
  to: string
  condition?: string // ex: "$.deal.value > 1000"
}

export interface CrmAutomationDAG {
  nodes: CrmAutomationNode[]
  edges: CrmAutomationEdge[]
}

export interface CrmAutomationContext {
  trigger_type: CrmTriggerType
  trigger_data: Record<string, unknown>
  deal?: Record<string, unknown> | null
  lead?: Record<string, unknown> | null
  thread?: Record<string, unknown> | null
  store?: Record<string, unknown> | null
  client?: Record<string, unknown> | null
  org_id: string
}

export interface CrmNodeRunResult {
  node_id: string
  node_type: CrmNodeType
  /** "waiting" = nó wait adiado — o run pausa e o cron de retomada continua. */
  status: "completed" | "failed" | "skipped" | "waiting"
  output?: unknown
  error?: string
  started_at: string
  completed_at: string
  duration_ms: number
}
