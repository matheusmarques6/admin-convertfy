/**
 * Tipos da aba "Em produção" da Central de Campanhas.
 *
 * Modela a EXECUÇÃO (por designer) das campanhas aprovadas. Cada campanha
 * aprovada vira um campaign_pipeline_items (stage global do Kanban); a
 * produção POR LOJA (estágio + designer de cada peça) vive no JSONB
 * target_stores de cada item — sem tabela nova.
 *
 * prod_stage por loja: 0=copy · 1=design · 2=revisão · 3=agendado · 4=enviado
 */
import type { CampaignSuggestionType } from "./campaign-central"
import type { CampaignStoreDeployStatus } from "./campaign-pipeline"

/** Passos do mini-pipeline de uma peça (o 5º estado, "enviado", é prod_stage >= 4). */
export const PRODUCTION_STEPS = [
  { key: "copy", label: "Copy", icon: "edit" },
  { key: "design", label: "Design", icon: "layers" },
  { key: "revisao", label: "Revisão", icon: "check" },
  { key: "agendado", label: "Agendado", icon: "calendar" },
] as const

export const PRODUCTION_STEP_COUNT = PRODUCTION_STEPS.length

/** Buckets agregados — escalam pra qualquer nº de lojas. */
export const PRODUCTION_BUCKETS = [
  { key: "design", label: "Design", color: "#4E62D8" },
  { key: "revisao", label: "Revisão", color: "#D97706" },
  { key: "agendado", label: "Agendado", color: "#7C3AED" },
  { key: "enviado", label: "Enviado", color: "#047857" },
] as const

export type ProductionBucketKey = (typeof PRODUCTION_BUCKETS)[number]["key"]

/** Rótulo legível de cada estágio por índice (0..4). */
export const PROD_STAGE_LABELS = ["Copy", "Design", "Revisão", "Agendado", "Enviado"] as const

/** Estado de produção de UMA loja dentro de uma campanha. */
export interface ProductionStore {
  store_id: string
  store_name: string
  country: string
  /** pt | en | es (derivado de client_stores.language). */
  lang: string
  region_label: string
  /** 0=copy · 1=design · 2=revisão · 3=agendado · 4=enviado */
  prod_stage: number
  designer_id: string | null
  deploy_status: CampaignStoreDeployStatus
}

export interface ProductionDesigner {
  id: string
  name: string
  avatar_url: string | null
}

/** Uma campanha aprovada em produção (1:1 com campaign_pipeline_items). */
export interface ProductionCampaign {
  /** pipeline_item_id */
  id: string
  suggestion_id: string | null
  type: CampaignSuggestionType
  title: string
  subject: string | null
  angle: string | null
  channel: string
  send_date: string | null
  /** Dias até o envio (negativo = atrasado, null = sem data). */
  send_in: number | null
  stores: ProductionStore[]
}

export interface ProductionResponse {
  productions: ProductionCampaign[]
  designers: ProductionDesigner[]
}
