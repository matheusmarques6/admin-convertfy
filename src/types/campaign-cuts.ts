/**
 * Mapa de Cortes de Campanha (campaign_cut_maps).
 *
 * Na etapa de implementação, a task "Corte modelo" marca onde o email
 * finalizado da campanha deve ser fatiado ("portas"). O mapa é único por
 * campanha (suggestion_id) — todas as tasks "Subir e-mails - <idioma>" da
 * mesma campanha leem o mesmo mapa (somente status "approved").
 *
 * Coordenadas em FRAÇÕES 0..1 da dimensão natural da imagem. Para o
 * recorte real: cropY0px = round(y0 * image_natural_h) etc.
 */

export type CutPortType =
  | "header"
  | "hero"
  | "texto"
  | "produtos"
  | "cupom"
  | "cta"
  | "rodape"

/**
 * hasCopy NÃO é persistido por porta — deriva sempre desta const (a Tela 2
 * importa a mesma, evitando dessincronização).
 */
export const PORT_TYPES: Record<
  CutPortType,
  { label: string; color: string; hasCopy: boolean }
> = {
  header:   { label: "Cabeçalho", color: "#9CA3AF", hasCopy: false },
  hero:     { label: "Hero",      color: "#4E62D8", hasCopy: true },
  texto:    { label: "Texto",     color: "#6B7280", hasCopy: true },
  produtos: { label: "Produtos",  color: "#7C3AED", hasCopy: true },
  cupom:    { label: "Oferta",    color: "#D97706", hasCopy: true },
  cta:      { label: "CTA",       color: "#065F46", hasCopy: true },
  rodape:   { label: "Rodapé",    color: "#4B5563", hasCopy: false },
}

export const PORT_TYPE_LIST = Object.keys(PORT_TYPES) as CutPortType[]

export interface CutPort {
  id: string
  label: string
  type: CutPortType
  /** Fração 0..1 da altura natural; y0 < y1; portas contíguas cobrindo 0..1. */
  y0: number
  y1: number
}

export interface CutSpecialArea {
  id: string
  label: string
  /** Frações 0..1 (x/w da largura, y/h da altura naturais). */
  x: number
  y: number
  w: number
  h: number
}

export interface CampaignCutMap {
  id: string
  suggestion_id: string
  task_id: string | null
  image_url: string | null
  image_path: string | null
  image_filename: string | null
  image_natural_w: number | null
  image_natural_h: number | null
  portas: CutPort[]
  special_areas: CutSpecialArea[]
  status: "draft" | "approved"
  approved_at: string | null
  updated_at: string
}

/** Payload de save (draft/approve) — o client manda o estado completo. */
export interface CutMapSaveInput {
  image_url?: string | null
  image_path?: string | null
  image_filename?: string | null
  image_natural_w?: number | null
  image_natural_h?: number | null
  portas: CutPort[]
  special_areas: CutSpecialArea[]
}
