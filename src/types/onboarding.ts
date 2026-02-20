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

// ===== Store Onboarding Data =====

export interface StoreOnboardingData {
  id: string
  store_id: string
  client_id: string
  org_id: string
  price_sensitivity: "price" | "quality" | "balanced" | null
  additional_notes: string | null
  logo_url: string | null
  design_direction_text: string | null
  design_direction_file_url: string | null
  brand_manual_url: string | null
  filled_by: string | null
  filled_at: string | null
  is_complete: boolean
  created_at: string
  updated_at: string
}

// Dados combinados do formulario (client_stores + store_onboarding_data)
export interface StoreOnboardingFormData {
  // De client_stores
  store_name: string
  store_url: string
  platform: string
  niche: string | null
  country: string | null
  language: string | null
  target_audience: string | null
  free_shipping_type: string | null
  shopify_collaborator_code: string | null
  // De store_onboarding_data
  price_sensitivity: "price" | "quality" | "balanced" | null
  additional_notes: string | null
  logo_url: string | null
  design_direction_text: string | null
  design_direction_file_url: string | null
  brand_manual_url: string | null
}

// ===== Store Briefing =====

export interface StoreBriefing {
  id: string
  store_id: string
  onboarding_data_id: string | null
  briefing_data: BriefingData
  version: number
  generated_at: string
  generated_by: string
  status: "current" | "archived"
  created_at: string
}

export interface BriefingData {
  dados_loja: {
    nome: string
    url: string
    plataforma: string
    nicho: string | null
    pais: string | null
    idioma: string | null
    frete_gratis: string | null
  }
  codigo_colaborador: {
    shopify_code: string | null
  }
  materiais_identidade: {
    logo_url: string | null
    design_direction: string | null
    design_file_url: string | null
    brand_manual_url: string | null
  }
  foco_campanhas: {
    abordagem: string
    descricao: string
  }
  publico: {
    target_audience: string | null
    price_sensitivity: string | null
    perfil: string
  }
  detalhes_adicionais: {
    notas: string | null
    conceito_frete: string | null
  }
  resumo_performance: Record<string, unknown>
  perfil_marca: {
    tipo: string
    descricao: string
  }
  analise_anuncios: Record<string, unknown>
}
