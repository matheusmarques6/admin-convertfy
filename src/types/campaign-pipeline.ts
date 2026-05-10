/**
 * Campaign Pipeline (fabrica de campanhas)
 *
 * Pipeline Kanban pra acompanhar campanhas desde a ideia ate o deploy
 * em multiplas lojas via Omnisend.
 */

export type CampaignStage =
  | "idea"
  | "briefing"
  | "copy_creation"
  | "design"
  | "review"
  | "ready_to_deploy"
  | "deploying"
  | "deployed"

export type CampaignPipelineType =
  | "promotional"
  | "seasonal"
  | "automation"
  | "newsletter"
  | "recovery"

export type CampaignPriority = "low" | "medium" | "high" | "urgent"

export type CampaignStoreDeployStatus = "pending" | "deployed" | "failed"

export interface CampaignTargetStore {
  store_id: string
  store_name: string
  status: CampaignStoreDeployStatus
  error?: string | null
}

export interface CampaignCopyData {
  body_html?: string | null
  body_text?: string | null
  sections?: Array<{ type: string; content: string }>
}

export interface CampaignDesignData {
  figma_url?: string | null
  image_urls?: string[]
  template_id?: string | null
}

export interface CampaignDeployConfig {
  segment_id?: string | null
  segment_label?: string | null
  send_date?: string | null
  send_time?: string | null
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
}

export interface CampaignPipelineItem {
  id: string
  org_id: string
  title: string
  description: string | null
  stage: CampaignStage
  campaign_type: CampaignPipelineType | null
  subject_line: string | null
  preview_text: string | null
  copy_data: CampaignCopyData
  design_data: CampaignDesignData
  target_stores: CampaignTargetStore[]
  deploy_config: CampaignDeployConfig
  assigned_to: string | null
  priority: CampaignPriority
  due_date: string | null
  tags: string[]
  omnisend_campaign_ids: Record<string, string>
  generation_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const STAGE_CONFIG: Array<{
  key: CampaignStage
  label: string
  emoji: string
  color: string
}> = [
  { key: "idea", label: "Ideia", emoji: "💡", color: "#94A3B8" },
  { key: "briefing", label: "Briefing", emoji: "📋", color: "#0EA5E9" },
  { key: "copy_creation", label: "Copy", emoji: "✍️", color: "#6366F1" },
  { key: "design", label: "Design", emoji: "🎨", color: "#A855F7" },
  { key: "review", label: "Revisão", emoji: "👀", color: "#F59E0B" },
  { key: "ready_to_deploy", label: "Pronto p/ Deploy", emoji: "🚀", color: "#10B981" },
  { key: "deploying", label: "Deployando", emoji: "⚡", color: "#FBBF24" },
  { key: "deployed", label: "Deployed", emoji: "✅", color: "#22C55E" },
]

export const CAMPAIGN_TYPE_LABELS: Record<CampaignPipelineType, string> = {
  promotional: "Promocional",
  seasonal: "Sazonal",
  automation: "Automação",
  newsletter: "Newsletter",
  recovery: "Recuperação",
}
