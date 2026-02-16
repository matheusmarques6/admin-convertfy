import type { Client, ClientStore } from "./client"
import type { OrgMember } from "./organization"

// Onboarding Types
export type OnboardingStatus = "not_started" | "in_progress" | "paused" | "completed" | "cancelled"
export type OnboardingStepStatus = "pending" | "in_progress" | "blocked" | "completed" | "skipped"

export interface OnboardingTemplate {
  id: string
  name: string
  description?: string
  plan_type?: string
  estimated_days: number
  is_active: boolean
  is_default: boolean
  created_at: string
  updated_at: string
  steps?: OnboardingTemplateStep[]
}

export interface OnboardingTemplateStep {
  id: string
  template_id: string
  name: string
  description?: string
  category: string
  position: number
  depends_on?: string
  default_assignee_role?: string
  estimated_hours: number
  webhook_on_complete?: string
  metadata: Record<string, unknown>
  is_required: boolean
  created_at: string
}

export interface ClientOnboarding {
  id: string
  client_id: string
  store_id?: string
  template_id?: string
  status: OnboardingStatus
  progress_percent: number
  assigned_to?: string
  started_at?: string
  target_completion_date?: string
  completed_at?: string
  notes?: string
  store_analysis?: Record<string, unknown>
  generated_copies?: Record<string, unknown>
  created_at: string
  updated_at: string
  // Joined data
  client?: Client
  store?: ClientStore
  assignee?: OrgMember
  steps?: ClientOnboardingStep[]
}

export interface ClientOnboardingStep {
  id: string
  onboarding_id: string
  template_step_id?: string
  name: string
  description?: string
  category: string
  position: number
  status: OnboardingStepStatus
  assigned_to?: string
  started_at?: string
  completed_at?: string
  due_date?: string
  completed_by?: string
  notes?: string
  blocked_reason?: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // Joined data
  assignee?: OrgMember
}
