/**
 * Estúdio de Geração de Imagens (/admin/imagens) — tipos.
 *
 * Domínio PARALELO à geração de campanha (types/campaign-central):
 * estruturas espelhadas de propósito (mesmo frontend/motor), mas sem
 * import cruzado — os dois evoluem independentes e nada de dados se toca.
 */

export type ImageStudioFormat =
  | "hero"
  | "square"
  | "story"
  | "portrait"
  | "landscape"
  | "banner"
  | "vertical"

export type ImageStudioResultStatus =
  | "queued"
  | "generating"
  | "ready"
  | "adjustment"
  | "failed"

export interface ImageStudioAdaptFlags {
  idioma?: boolean
  cores?: boolean
  logo?: boolean
  catalogo?: boolean
}

export interface ImageStudioTextField {
  include: boolean
  value?: string
}

/** Contexto textual opt-in por lote (default {} = tudo desligado). */
export interface ImageStudioTextContext {
  nicho?: ImageStudioTextField
  publico?: ImageStudioTextField
  tom?: ImageStudioTextField
  moeda?: ImageStudioTextField
  headline?: ImageStudioTextField
}

/** Uma variação do lote. direction vazia = variação livre. */
export interface ImageStudioVariation {
  label?: string
  direction?: string
}

export interface ImageStudioBatch {
  id: string
  name: string
  format: ImageStudioFormat
  instruction: string
  reference_image_url: string | null
  adapt_flags: ImageStudioAdaptFlags
  text_context: ImageStudioTextContext
  store_ids: string[]
  variations: ImageStudioVariation[]
  created_at: string
  updated_at: string
}

export interface ImageStudioResult {
  id: string
  batch_id: string
  store_id: string
  store_name: string
  country: string
  language: string | null
  variation_index: number
  status: ImageStudioResultStatus
  image_url: string | null
  adjustment_notes: string | null
  error_message: string | null
  generated_at: string | null
  updated_at: string
}

export interface ImageStudioBatchWithResults extends ImageStudioBatch {
  results: ImageStudioResult[]
}

/** Loja elegível para seleção no estúdio. */
export interface ImageStudioStore {
  store_id: string
  store_name: string
  country: string
  language: string | null
  /** Nicho da loja — dimensão de seleção em massa no estúdio. */
  niche: string | null
  logo_url: string | null
  primary_color: string | null
}
