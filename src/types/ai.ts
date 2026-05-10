/**
 * AI Chat & Templates — types compartilhados pelo chat com Claude
 * (assistente IA da Convertfy) e pelos templates de prompt.
 */

export interface AiChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
}

export interface AiChatContext {
  store_id?: string | null
  client_id?: string | null
}

export type AiTemplateCategory =
  | "campaign"
  | "report"
  | "copy"
  | "automation"
  | "analysis"

export interface AiPromptTemplate {
  id: string
  org_id: string
  name: string
  category: AiTemplateCategory
  template: string
  variables: string[]
  is_default: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export const TEMPLATE_CATEGORY_LABELS: Record<AiTemplateCategory, string> = {
  campaign: "Campanha",
  report: "Relatório",
  copy: "Copy",
  automation: "Automação",
  analysis: "Análise",
}

export const TEMPLATE_CATEGORY_COLORS: Record<AiTemplateCategory, string> = {
  campaign: "#7C3AED",
  report: "#0EA5E9",
  copy: "#F97316",
  automation: "#10B981",
  analysis: "#F59E0B",
}
