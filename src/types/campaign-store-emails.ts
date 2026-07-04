/**
 * Emails por loja da campanha (campaign_store_emails) — Tela 2 "Subir
 * Campanha por Loja".
 *
 * A linha é campanha×loja (UNIQUE suggestion_id+store_id): as 3 tasks
 * "Subir e-mails - <idioma>" compartilham o mesmo progresso. As fatias
 * usam as frações do mapa aprovado (campaign_cut_maps) aplicadas à altura
 * natural da imagem de CADA loja.
 */

import type { CampaignCutMap } from "@/types/campaign-cuts"
import type { CopyResultEntry } from "@/types/campaign-central"
import type { TaskLangGroup } from "@/lib/campaign-cuts/lang"

export interface CampaignStoreEmail {
  id: string
  suggestion_id: string
  store_id: string
  image_url: string | null
  image_path: string | null
  image_filename: string | null
  image_natural_w: number | null
  image_natural_h: number | null
  source: "figma" | "manual"
  figma_node_id: string | null
  status: "pendente" | "andamento" | "concluida"
  /** Ids de CutPort já baixados (órfãos pós-reaprovação são ignorados na UI). */
  downloaded_ports: string[]
  updated_at: string
}

/** Loja no payload do modal: alvo da campanha + copy + email (se houver). */
export interface CampaignUploadStore {
  store_id: string
  store_name: string
  country: string
  language: string | null
  lang_group: TaskLangGroup
  copy: CopyResultEntry | null
  email: CampaignStoreEmail | null
}

export type CutMapGateStatus = "missing" | "draft" | "approved"

export interface CampaignUploadPayload {
  suggestion_id: string
  campaign_title: string | null
  figma_link: string | null
  /** FIGMA_ACCESS_TOKEN configurado no servidor? (habilita o modo auto). */
  figma_available: boolean
  cut_map_status: CutMapGateStatus
  /** Só presente quando approved — a Tela 2 nunca consome mapa em edição. */
  cut_map: CampaignCutMap | null
  stores: CampaignUploadStore[]
}

/** Resumo pro badge "X/N lojas" do drawer (GET ?summary=1). */
export interface CampaignUploadSummary {
  total: number
  concluidas: number
  com_imagem: number
  cut_map_status: CutMapGateStatus
}

export type FigmaImportStoreStatus =
  | "imported"
  | "no_frame"
  | "ambiguous"
  | "failed"

export interface FigmaImportStoreResult {
  store_id: string
  store_name: string
  status: FigmaImportStoreStatus
  frame_name?: string
  error?: string
}

export interface FigmaImportResult {
  file_key: string
  frames_found: number
  /** Nomes dos frames top-level — diagnóstico quando uma loja fica no_frame. */
  frame_names: string[]
  results: FigmaImportStoreResult[]
}
