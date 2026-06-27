/**
 * Builders puros do contexto da loja para o drawer (aba "Contexto").
 * Extraidos de GET /api/tasks/[id]/store-context para serem testaveis — esta
 * logica (fonte {family,fallback}, audience derivada do ICP, fonte curated vs
 * briefing) ja foi acidentalmente perdida numa reescrita; os testes em
 * `store-context-builders.test.ts` agora protegem o contrato consumido por
 * `block-identidade-loja` / `block-brand-brain` / `block-assets-visuais`.
 */

export interface BriefingShape {
  about_brand?: string
  audience?: string
  language_tone?: string
  offers_and_differentials?: string
  visual_identity?: Record<string, unknown>
  [key: string]: unknown
}

export interface VisualAssetsShape {
  palette?: string[]
  logos?: Record<string, unknown>
  font?: { family?: string; fallback?: string }
  top_products?: Array<{ name: string; image_url?: string; url?: string }>
}

export interface StoreRow {
  id: string
  store_name: string | null
  store_url: string | null
  platform: string | null
  niche: string | null
  country: string | null
  language: string | null
  plan: string | null
  mrr_value: number | null
  brand_thesis: string | null
  brand_about: string | null
  brand_pillars: unknown
  brand_presence: string | null
  store_story: string | null
  store_milestones: unknown
  icp_persona: { name?: string; age?: string; city?: string; monogram?: string } | null
  icp_demographics: Record<string, unknown> | null
  icp_day_in_life: string | null
  icp_motivations: string[] | null
  icp_frictions: string[] | null
  tone_description: string | null
  tone_do: string[] | null
  tone_dont: string[] | null
  tone_use_words: string[] | null
  tone_avoid_words: string[] | null
  cores: Array<{ name: string; hex: string; use?: string }> | null
  fontes: { titulo?: string; corpo?: string } | null
}

export function buildBrandBrain(store: StoreRow | null, briefing: BriefingShape) {
  // Cada campo escolhe sua fonte: curated (client_stores) > briefing fallback
  const fields = {
    about_brand: pickField(store?.brand_about, briefing.about_brand),
    audience: pickField(
      formatIcpAsAudience(store?.icp_persona, store?.icp_demographics),
      briefing.audience,
    ),
    language_tone: pickField(store?.tone_description, briefing.language_tone),
    // offers_and_differentials só existe no briefing
    offers_and_differentials: pickField(null, briefing.offers_and_differentials),
  }

  // Determina source observando QUAIS campos vieram de onde
  const fromCurated = [
    store?.brand_about,
    formatIcpAsAudience(store?.icp_persona, store?.icp_demographics),
    store?.tone_description,
  ].filter((v) => v !== null && v !== undefined && String(v).trim() !== "").length
  const fromBriefing = [
    briefing.about_brand,
    briefing.audience,
    briefing.language_tone,
    briefing.offers_and_differentials,
  ].filter((v) => v !== undefined && String(v).trim() !== "").length

  let source: "curated" | "briefing" | "mixed" | "empty" = "empty"
  if (fromCurated > 0 && fromBriefing > 0) source = "mixed"
  else if (fromCurated > 0) source = "curated"
  else if (fromBriefing > 0) source = "briefing"

  return {
    source,
    ...fields,
    // Campos extras só do diagnóstico curado
    brand_thesis: store?.brand_thesis ?? null,
    brand_pillars: store?.brand_pillars ?? null,
    brand_presence: store?.brand_presence ?? null,
    icp_persona: store?.icp_persona ?? null,
    icp_motivations: store?.icp_motivations ?? null,
    icp_frictions: store?.icp_frictions ?? null,
    tone_do: store?.tone_do ?? null,
    tone_dont: store?.tone_dont ?? null,
  }
}

export function buildAssetsVisuais(store: StoreRow | null, va: VisualAssetsShape) {
  // Paleta: client_stores.cores (objetos) → string[] (só hex)
  // Fallback: visual_assets.palette (já string[])
  let palette: string[] = []
  if (Array.isArray(store?.cores) && store!.cores!.length > 0) {
    palette = store!.cores!.map((c) => c.hex).filter(Boolean)
  } else if (Array.isArray(va.palette)) {
    palette = va.palette
  }

  // Fontes: client_stores.fontes ({titulo, corpo}) → {family, fallback}
  // Fallback: visual_assets.font ({family, fallback})
  let font: { family: string; fallback?: string } | null = null
  if (store?.fontes && (store.fontes.titulo || store.fontes.corpo)) {
    font = {
      family: store.fontes.titulo ?? "",
      fallback: store.fontes.corpo,
    }
  } else if (va.font?.family) {
    font = { family: va.font.family, fallback: va.font.fallback }
  }

  return {
    palette,
    font,
    // Logos: só do visual_assets (escopo separado, não migra agora)
    logos: va.logos ?? {},
  }
}

export function pickField(
  primary: string | null | undefined,
  fallback: string | undefined,
): string | null {
  if (typeof primary === "string" && primary.trim()) return primary.trim()
  if (typeof fallback === "string" && fallback.trim()) return fallback.trim()
  return null
}

export function formatIcpAsAudience(
  persona: StoreRow["icp_persona"] | null | undefined,
  demographics: StoreRow["icp_demographics"] | null | undefined,
): string | null {
  const parts: string[] = []
  if (persona?.name) {
    let p = persona.name
    if (persona.age) p += `, ${persona.age}`
    if (persona.city) p += `, ${persona.city}`
    parts.push(p)
  }
  if (demographics && typeof demographics === "object") {
    const d = demographics as Record<string, unknown>
    const bits: string[] = []
    if (d.age_range) bits.push(`faixa ${d.age_range}`)
    if (d.income) bits.push(`renda ${d.income}`)
    if (d.occupation) bits.push(`ocupação ${d.occupation}`)
    if (bits.length > 0) parts.push(bits.join(" · "))
  }
  return parts.length > 0 ? parts.join(". ") : null
}
