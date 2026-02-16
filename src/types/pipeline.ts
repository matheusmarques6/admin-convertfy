import type { Client } from "./client"
import type { User } from "./user"

// Pipeline Types
export type PipelineMemberRole = "owner" | "editor" | "viewer"

export interface Pipeline {
  id: string
  name: string
  description?: string
  is_default: boolean
  created_by?: string
  members?: PipelineMember[]
  stages: PipelineStage[]
  created_at: string
  updated_at: string
}

export interface PipelineStage {
  id: string
  pipeline_id: string
  name: string
  color: string
  order: number
  created_at: string
}

export interface PipelineMember {
  id: string
  pipeline_id: string
  user_id: string
  role: PipelineMemberRole
  added_by?: string
  created_at: string
  user?: User
}

export interface Deal {
  id: string
  pipeline_id: string
  stage_id: string
  client_id?: string
  title: string
  value: number
  probability: number
  expected_close_date?: string
  owner_id: string
  custom_fields: Record<string, unknown>
  notes?: string
  created_at: string
  updated_at: string
}

export interface DealWithRelations extends Deal {
  client?: Pick<Client, "id" | "name" | "email" | "company">
  owner?: Pick<User, "id" | "name" | "avatar_url">
}

// Pipeline CRUD Types
export interface CreatePipelineInput {
  name: string
  description?: string
  is_default?: boolean
  stages: CreateStageInput[]
}

export interface CreateStageInput {
  name: string
  color: string
  order: number
}

// Pipeline Import Types
export type ImportConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty"
  | "greater_than"
  | "less_than"
  | "in"

export type ImportConditionField =
  | "status"
  | "tags"
  | "health_score"
  | "company"
  | "email"
  | "phone"
  | "website"
  | "name"
  | "owner_id"
  | `custom_fields.${string}`

export interface ImportCondition {
  field: ImportConditionField
  operator: ImportConditionOperator
  value: string | number | string[] | null
}

export interface DealDefaults {
  title_template?: string
  value?: number
  probability?: number
  owner_id?: string
  notes?: string
}

export interface PipelineImportRule {
  id: string
  pipeline_id: string
  target_stage_id: string
  name: string
  description?: string
  is_active: boolean
  priority: number
  conditions: ImportCondition[]
  deal_defaults: DealDefaults
  created_by?: string
  created_at: string
  updated_at: string
  target_stage?: PipelineStage
}

export type ImportLogStatus = "success" | "failed" | "skipped"

export interface PipelineImportLog {
  id: string
  rule_id?: string
  pipeline_id: string
  stage_id?: string
  client_id: string
  deal_id?: string
  status: ImportLogStatus
  error_message?: string
  metadata: Record<string, unknown>
  created_at: string
  client?: Client
  deal?: Deal
  rule?: PipelineImportRule
}
