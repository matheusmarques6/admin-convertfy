import { NextRequest } from "next/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const access = await requireTaskAccess(user.id, id, "read")
    const admin = createAdminClient()

    let storeId = (access.task.store_id as string | null) ?? null
    let clientId = (access.task.client_id as string | null) ?? null
    let onboarding: Record<string, unknown> | null = null
    if (access.task.onboarding_id) {
      const { data } = await admin
        .from("onboardings")
        .select(
          "id, store_id, client_id, briefing, briefing_status, visual_assets, language, plan, mrr_value",
        )
        .eq("id", access.task.onboarding_id)
        .eq("org_id", access.member.orgId)
        .maybeSingle()
      onboarding = data
      storeId = storeId ?? ((data?.store_id as string | null) ?? null)
      clientId = clientId ?? ((data?.client_id as string | null) ?? null)
    }

    if (!storeId) {
      throw new AppError("Task sem loja vinculada", 404)
    }
    const [storeResult, clientResult, productsResult] = await Promise.all([
      admin
        .from("client_stores")
        .select(
          `id, store_name, store_url, platform, niche, country, language, plan, mrr_value,
           brand_thesis, brand_about, brand_pillars, brand_presence,
           icp_persona, icp_demographics, icp_day_in_life, icp_motivations, icp_frictions,
           tone_description, tone_do, tone_dont, tone_use_words, tone_avoid_words,
           cores, fontes`,
        )
        .eq("id", storeId)
        .eq("org_id", access.member.orgId)
        .maybeSingle(),
      clientId
        ? admin
            .from("clients")
            .select("id, name")
            .eq("id", clientId)
            .eq("org_id", access.member.orgId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from("store_top_products")
        .select("rank, title, price, currency, handle, image_url, external_id")
        .eq("store_id", storeId)
        .order("rank", { ascending: true })
        .limit(5),
    ])
    const store = storeResult.data
    if (!store) throw new AppError("Loja nao encontrada", 404)
    const briefing = (onboarding?.briefing ?? {}) as Record<string, unknown>
    const visualAssets = (onboarding?.visual_assets ?? {}) as Record<
      string,
      unknown
    >

    return successResponse(request, {
      identity: {
        store_id: store.id,
        store_name: store.store_name,
        store_url: store.store_url,
        client_id: clientResult.data?.id ?? clientId,
        client_name: clientResult.data?.name ?? null,
        platform: store.platform,
        niche: store.niche,
        country: store.country,
        language: onboarding?.language ?? store.language,
        plan: onboarding?.plan ?? store.plan,
        mrr: onboarding?.mrr_value ?? store.mrr_value,
      },
      brand_brain: {
        source: store.brand_about ? "curated" : "briefing",
        about_brand: store.brand_about ?? briefing.about_brand ?? null,
        audience: briefing.audience ?? null,
        language_tone:
          store.tone_description ?? briefing.language_tone ?? null,
        offers_and_differentials:
          briefing.offers_and_differentials ?? null,
        brand_thesis: store.brand_thesis,
        brand_pillars: store.brand_pillars,
        brand_presence: store.brand_presence,
        icp_persona: store.icp_persona,
        icp_motivations: store.icp_motivations,
        icp_frictions: store.icp_frictions,
        tone_do: store.tone_do,
        tone_dont: store.tone_dont,
      },
      assets_visuais: {
        palette: Array.isArray(store.cores)
          ? store.cores
              .map((color: { hex?: string }) => color.hex)
              .filter(Boolean)
          : [],
        font: store.fontes ?? null,
        logos: visualAssets.logos ?? {},
      },
      top_products: productsResult.data ?? [],
      onboarding_id: access.task.onboarding_id,
      store_id: storeId,
      can_work: access.canWork,
    })
  } catch (error) {
    return errorResponse(request, error, "task-store-context")
  }
}
