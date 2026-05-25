export interface BlueprintBlock {
  type: string
  label: string
  hint?: string
}

export interface EmailBlueprint {
  id: string
  flow_type: string
  email_number: number
  objective: string
  messaging: string
  subject_hint: string | null
  blocks: BlueprintBlock[]
  tone_override: string | null
  updated_at: string
  updated_by: string | null
}

export type AgentType = "copy" | "image" | "html"

export interface EmailAgentConfig {
  id: string
  agent_type: AgentType
  model: string
  system_prompt: string
  user_template: string
  temperature: number
  max_tokens: number
  output_schema: Record<string, unknown> | null
  version: number
  is_active: boolean
  created_at: string
  created_by: string | null
}

export interface EmailGenerationSettings {
  id: string
  org_id: string
  auto_trigger: boolean
  max_parallel: number
  generate_images: boolean
  notify_on_error: boolean
  notify_on_success: boolean
  notify_emails: string[]
  updated_at: string
  updated_by: string | null
}

export type GenerationRunStatus = "running" | "success" | "error" | "skipped"
export type GenerationRunAgent = "seed" | "copy" | "image" | "html"

export interface EmailGenerationRun {
  id: string
  store_id: string
  flow_id: string | null
  email_id: string | null
  triggered_by: string | null
  batch_id: string | null
  agent: GenerationRunAgent
  agent_config_id: string | null
  status: GenerationRunStatus
  input_vars: Record<string, unknown> | null
  rendered_prompt: string | null
  raw_output: string | null
  parsed_output: Record<string, unknown> | null
  model: string | null
  tokens_input: number
  tokens_output: number
  cost_cents: number
  duration_ms: number
  error_message: string | null
  error_stack: string | null
  retry_count: number
  created_at: string
  // Joined fields
  store_name?: string
  flow_type?: string
  email_name?: string
}

export interface EmailReferenceTemplate {
  id: string
  flow_type: string | null
  name: string
  html: string | null
  copy: string | null
  thumbnail: string | null
  tags: string[]
  is_active: boolean
  created_at: string
  created_by: string | null
}
