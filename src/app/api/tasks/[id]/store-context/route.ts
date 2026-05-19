import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * GET /api/tasks/[id]/store-context
 *
 * Retorna contexto da loja pra renderizar blocos do drawer:
 *  - identity:       client_stores (fonte primária — sincronizada com aba Contexto)
 *  - brand_brain:    client_stores.{brand_*, icp_*, tone_*} com fallback pro onboardings.briefing
 *  - assets_visuais: client_stores.{cores, fontes} com fallback pro onboardings.visual_assets;
 *                    logos ficam em onboardings.visual_assets.logos (escopo separado)
 *  - top_products:   store_top_products (capturado pelo n8n, read-only)
 *
 * source do brand_brain indica a origem dos campos preenchidos:
 *   "curated" = todos vêm de client_stores (time já curou)
 *   "briefing" = todos vêm do briefing IA do form
 *   "mixed"   = combinação dos dois
 *   "empty"   = nenhum dos dois preenchido
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const admin = createAdminClient()
    const { data: task, error: taskErr } = await admin
      .from("tasks")
      .select("id, title, onboarding_id, source_type, metadata")
      .eq("id", id)
      .maybeSingle()

    if (taskErr || !task) throw new AppError("Task não encontrada", 404)

    if (!task.onboarding_id) {
      // Task sem onboarding — retorna identidade básica via metadata
      const meta = (task.metadata as Record<string, unknown>) ?? {}
      return successResponse(request, {
        identity: {
          store_name: meta.store_name ?? null,
          client_name: meta.client_name ?? null,
          platform: meta.platform ?? null,
          niche: meta.niche ?? null,
          country: meta.country ?? null,
          language: meta.language ?? null,
          mrr: meta.mrr ?? null,
          plan: meta.plan ?? null,
        },
        brand_brain: { source: "empty" },
        assets_visuais: { palette: [], font: null, logos: {} },
        top_products: [],
        onboarding_id: null,
        store_id: null,
      })
    }

    const { data: onbRaw, error: onbErr } = await admin
      .from("onboardings")
      .select(
        `id, briefing, briefing_status, visual_assets, language, store_id,
        client:clients!onboardings_client_id_fkey(
          id, name,
          owner:profiles!clients_owner_id_fkey(id, name, avatar_url)
        ),
        store:client_stores(
          id, store_name, store_url, platform, niche, country, language, plan, mrr_value,
          brand_thesis, brand_about, brand_pillars, brand_presence,
          store_story, store_milestones,
          icp_persona, icp_demographics, icp_day_in_life, icp_motivations, icp_frictions,
          tone_description, tone_do, tone_dont, tone_use_words, tone_avoid_words,
          cores, fontes
        ),
        deal:deals!onboardings_source_deal_id_fkey(id, value, plan_name)`,
      )
      .eq("id", task.onboarding_id)
      .maybeSingle()

    if (onbErr || !onbRaw) {
      return successResponse(request, {
        identity: null,
        brand_brain: { source: "empty" },
        assets_visuais: { palette: [], font: null, logos: {} },
        top_products: [],
        onboarding_id: task.onboarding_id,
        store_id: null,
      })
    }

    const onb = onbRaw as unknown as OnboardingRow
    const client = Array.isArray(onb.client) ? onb.client[0] : onb.client
    const store = Array.isArray(onb.store) ? onb.store[0] : onb.store
    const deal = Array.isArray(onb.deal) ? onb.deal[0] : onb.deal

    // Top products — tabela real (n8n popula)
    const topProductsRes = store?.id
      ? await admin
          .from("store_top_products")
          .select(
            "rank, title, price, currency, handle, image_url, external_id",
          )
          .eq("store_id", store.id)
          .order("rank", { ascending: true })
          .limit(5)
      : { data: [] as Array<Record<string, unknown>> }

    const briefing = (onb.briefing ?? {}) as BriefingShape
    const visualAssets = (onb.visual_assets ?? {}) as VisualAssetsShape

    return successResponse(request, {
      identity: {
        store_id: store?.id,
        store_name: store?.store_name ?? null,
        store_url: store?.store_url ?? null,
        client_id: client?.id,
        client_name: client?.name ?? null,
        client_owner: client?.owner ?? null,
        platform: store?.platform ?? null,
        niche: store?.niche ?? null,
        country: store?.country ?? null,
        language: onb.language ?? store?.language ?? "pt-BR",
        mrr: deal?.value ?? store?.mrr_value ?? null,
        plan: deal?.plan_name ?? store?.plan ?? null,
      },
      brand_brain: buildBrandBrain(store, briefing),
      briefing_status: onb.briefing_status,
      assets_visuais: buildAssetsVisuais(store, visualAssets),
      top_products: topProductsRes.data ?? [],
      onboarding_id: onb.id,
      store_id: store?.id ?? null,
    })
  } catch (error) {
    return errorResponse(request, error, "TasksStoreContext")
  }
}

// ─── Tipos internos ──────────────────────────────────────────────────────

interface BriefingShape {
  about_brand?: string
  audience?: string
  language_tone?: string
  offers_and_differentials?: string
  visual_identity?: Record<string, unknown>
  [key: string]: unknown
}

interface VisualAssetsShape {
  palette?: string[]
  logos?: Record<string, unknown>
  font?: { family?: string; fallback?: string }
  top_products?: Array<{ name: string; image_url?: string; url?: string }>
}

interface StoreRow {
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

interface OnboardingRow {
  id: string
  briefing: unknown
  briefing_status: string
  visual_assets: unknown
  language: string | null
  store_id: string | null
  client: { id: string; name: string; owner: { id: string; name: string; avatar_url: string | null } | null } | null
  store: StoreRow | null
  deal: { id: string; value: number | null; plan_name: string | null } | null
}

// ─── Builders ────────────────────────────────────────────────────────────

function buildBrandBrain(store: StoreRow | null, briefing: BriefingShape) {
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

function buildAssetsVisuais(store: StoreRow | null, va: VisualAssetsShape) {
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

// ─── Helpers ─────────────────────────────────────────────────────────────

function pickField(
  primary: string | null | undefined,
  fallback: string | undefined,
): string | null {
  if (typeof primary === "string" && primary.trim()) return primary.trim()
  if (typeof fallback === "string" && fallback.trim()) return fallback.trim()
  return null
}

function formatIcpAsAudience(
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
