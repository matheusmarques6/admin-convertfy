/**
 * Shape do retorno de GET /api/tasks/[id]/store-context.
 *
 * Consumido pelos blocos do drawer de task:
 *   - BlockIdentidadeLoja (identity)
 *   - BlockBrandBrain (brand_brain + briefing_status)
 *   - BlockAssetsVisuais (assets_visuais + top_products + onboarding_id pra logos)
 *
 * Fontes:
 *   - identity, assets_visuais, top_products: client_stores + store_top_products
 *   - brand_brain: client_stores.{brand_*,icp_*,tone_*} com fallback pro
 *     onboardings.briefing (campo `source` indica de onde veio)
 *   - assets_visuais.logos: onboardings.visual_assets.logos (escopo separado)
 */

export interface TaskStoreContextIdentity {
  store_id?: string
  store_name?: string | null
  store_url?: string | null
  client_id?: string
  client_name?: string | null
  client_owner?: { name: string; avatar_url?: string | null } | null
  platform?: string | null
  niche?: string | null
  country?: string | null
  language?: string | null
  mrr?: number | null
  plan?: string | null
}

export type BrandBrainSource = "curated" | "briefing" | "mixed" | "empty"

export interface TaskBrandBrain {
  source: BrandBrainSource
  about_brand?: string | null
  audience?: string | null
  language_tone?: string | null
  offers_and_differentials?: string | null
  brand_thesis?: string | null
  brand_pillars?: unknown
  brand_presence?: string | null
  icp_persona?: { name?: string; age?: string; city?: string } | null
  icp_motivations?: string[] | null
  icp_frictions?: string[] | null
  tone_do?: string[] | null
  tone_dont?: string[] | null
}

export interface TaskAssetsVisuais {
  palette: string[]
  font: { family: string; fallback?: string } | null
  logos: {
    main?: { url: string; filename: string; size: number; path?: string }
    mono?: { url: string; filename: string; size: number; path?: string }
  }
}

export interface TaskTopProduct {
  rank: number
  title: string
  price: number | null
  currency: string | null
  handle: string | null
  image_url: string | null
  external_id: string | null
}

export interface TaskStoreContext {
  identity: TaskStoreContextIdentity | null
  brand_brain: TaskBrandBrain
  briefing_status?: string
  assets_visuais: TaskAssetsVisuais
  top_products: TaskTopProduct[]
  onboarding_id: string | null
  store_id: string | null
}
