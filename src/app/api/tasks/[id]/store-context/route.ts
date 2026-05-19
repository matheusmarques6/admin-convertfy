import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("TasksStoreContext")

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
 * Faz SELECTs separados em vez de joins aninhados pra evitar problemas
 * de inferência de FK do Supabase. Cadeia de resolução:
 *   1. task.onboarding_id → onboardings.store_id (tasks de onboarding)
 *   2. task.store_id direto (tasks criadas direto na página da loja)
 *   3. nenhum dos dois → metadata fallback
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
      .select(
        "id, title, onboarding_id, store_id, client_id, source_type, metadata",
      )
      .eq("id", id)
      .maybeSingle()

    if (taskErr || !task) throw new AppError("Task não encontrada", 404)

    // Resolve store_id + client_id + dados do onboarding (se houver)
    let storeId: string | null = task.store_id ?? null
    let clientId: string | null = task.client_id ?? null
    let onboarding: OnboardingRow | null = null

    if (task.onboarding_id) {
      const { data: onbRow } = await admin
        .from("onboardings")
        .select(
          "id, briefing, briefing_status, visual_assets, language, store_id, client_id, source_deal_id",
        )
        .eq("id", task.onboarding_id)
        .maybeSingle()
      if (onbRow) {
        onboarding = onbRow as OnboardingRow
        storeId = storeId ?? onbRow.store_id ?? null
        clientId = clientId ?? onbRow.client_id ?? null
      }
    }

    log.info("resolve", {
      task_id: id,
      task_onboarding_id: task.onboarding_id ?? null,
      task_store_id: task.store_id ?? null,
      task_client_id: task.client_id ?? null,
      resolved_store_id: storeId,
      resolved_client_id: clientId,
      has_onboarding: !!onboarding,
    })

    // Sem loja resolvida — retorna identidade básica via metadata
    if (!storeId) {
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
        onboarding_id: task.onboarding_id ?? null,
        store_id: null,
      })
    }

    // Busca dados da loja, cliente, deal e top products em paralelo
    const [storeRes, clientRes, dealRes, topProductsRes] = await Promise.all([
      admin
        .from("client_stores")
        .select(
          `id, store_name, store_url, platform, niche, country, language, plan, mrr_value,
          brand_thesis, brand_about, brand_pillars, brand_presence,
          store_story, store_milestones,
          icp_persona, icp_demographics, icp_day_in_life, icp_motivations, icp_frictions,
          tone_description, tone_do, tone_dont, tone_use_words, tone_avoid_words,
          cores, fontes`,
        )
        .eq("id", storeId)
        .maybeSingle(),
      clientId
        ? admin
            .from("clients")
            .select("id, name, owner_id")
            .eq("id", clientId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      onboarding?.source_deal_id
        ? admin
            .from("deals")
            .select("id, value, plan_name")
            .eq("id", onboarding.source_deal_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from("store_top_products")
        .select(
          "rank, title, price, currency, handle, image_url, external_id",
        )
        .eq("store_id", storeId)
        .order("rank", { ascending: true })
        .limit(5),
    ])

    const store = storeRes.data as StoreRow | null
    const clientRow = clientRes.data as
      | { id: string; name: string; owner_id: string | null }
      | null
    const deal = dealRes.data as
      | { id: string; value: number | null; plan_name: string | null }
      | null

    // Owner do cliente (CS responsável) — busca depois pra não atrelar ao client query
    let ownerInfo: { id: string; name: string; avatar_url: string | null } | null =
      null
    if (clientRow?.owner_id) {
      const { data: ownerRow } = await admin
        .from("profiles")
        .select("id, name, avatar_url")
        .eq("id", clientRow.owner_id)
        .maybeSingle()
      if (ownerRow) {
        ownerInfo = ownerRow as unknown as {
          id: string
          name: string
          avatar_url: string | null
        }
      }
    }

    if (!store) {
      log.warn("store.not_found", { task_id: id, store_id: storeId })
    }

    const briefing = (onboarding?.briefing ?? {}) as BriefingShape
    const visualAssets = (onboarding?.visual_assets ?? {}) as VisualAssetsShape

    return successResponse(request, {
      identity: {
        store_id: store?.id ?? storeId,
        store_name: store?.store_name ?? null,
        store_url: store?.store_url ?? null,
        client_id: clientRow?.id,
        client_name: clientRow?.name ?? null,
        client_owner: ownerInfo,
        platform: store?.platform ?? null,
        niche: store?.niche ?? null,
        country: store?.country ?? null,
        language:
          onboarding?.language ?? store?.language ?? "pt-BR",
        mrr: deal?.value ?? store?.mrr_value ?? null,
        plan: deal?.plan_name ?? store?.plan ?? null,
      },
      brand_brain: buildBrandBrain(store, briefing),
      briefing_status: onboarding?.briefing_status,
      assets_visuais: buildAssetsVisuais(store, visualAssets),
      top_products: topProductsRes.data ?? [],
      onboarding_id: onboarding?.id ?? task.onboarding_id ?? null,
      store_id: storeId,
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

interface OnboardingRow {
  id: string
  briefing: unknown
  briefing_status: string
  visual_assets: unknown
  language: string | null
  store_id: string | null
  client_id: string | null
  source_deal_id: string | null
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
