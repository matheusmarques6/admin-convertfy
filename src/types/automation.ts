// Automation Types
export type AutomationTriggerType =
  | "new_client"
  | "client_status_changed"
  | "payment_confirmed"
  | "payment_overdue"
  | "meeting_overdue"
  | "meeting_upcoming"
  | "report_overdue"
  | "contract_expiring"
  | "revenue_dropped"
  | "deal_moved"
  | "deal_created"
  | "deal_won"
  | "deal_lost"
  | "scheduled_date"

export type AutomationActionType =
  | "send_email"
  | "send_whatsapp"
  | "send_sms"
  | "create_task"
  | "send_notification"
  | "update_field"
  | "update_status"
  | "add_tag"
  | "remove_tag"
  | "create_invoice"
  | "schedule_meeting"
  | "webhook"

export interface Automation {
  id: string
  name: string
  description?: string
  is_active: boolean
  trigger: AutomationTrigger
  conditions: AutomationCondition[]
  actions: AutomationAction[]
  created_by: string
  created_at: string
  updated_at: string
}

export interface AutomationTrigger {
  type: AutomationTriggerType
  config: Record<string, unknown>
}

export interface AutomationCondition {
  field: string
  operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "is_set" | "is_not_set"
  value: unknown
  logic?: "and" | "or"
}

export interface AutomationAction {
  id: string
  type: AutomationActionType
  config: Record<string, unknown>
  delay_minutes?: number
  order: number
}

export interface AutomationLog {
  id: string
  automation_id: string
  trigger_data: Record<string, unknown>
  actions_executed: string[]
  status: "success" | "partial" | "failed"
  error_message?: string
  executed_at: string
}
