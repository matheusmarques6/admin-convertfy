import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { dispatchBriefingWebhook } from "@/lib/services/briefing-webhook.service"
import { pesquisaToFullText } from "@/lib/briefing/briefing-text"
import type { StoreBriefing, BriefingData } from "@/types/onboarding"

const log = logger.child("OnboardingStoreBriefing")

/**
 * GET /api/onboarding/store-briefing?store_id=X
 * Returns the current briefing for a store
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const storeId = request.nextUrl.searchParams.get("store_id")
    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    const { data: briefing } = await adminClient
      .from("store_briefings")
      .select("*")
      .eq("store_id", storeId)
      .eq("status", "current")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (briefing) {
      return successResponse(request, { briefing })
    }

    // Fallback: a loja pode não ter linha em store_briefings mas ter o
    // documento "Pesquisa & Diagnóstico" preenchido nas colunas de
    // client_stores (brand_*, store_story, icp_*, tone_*, ads_*) — mesma fonte
    // que a aba Content/Pesquisa renderiza. Sintetiza um StoreBriefing raw_text
    // com as 5 seções para a página de Configurações ficar consistente.
    const { data: store } = await adminClient
      .from("client_stores")
      .select("*")
      .eq("id", storeId)
      .maybeSingle()

    const text = store ? pesquisaToFullText(store).trim() : ""

    if (text) {
      const nowIso = new Date().toISOString()
      const generatedAt =
        (store?.ads_reviewed_at as string | null) ??
        (store?.updated_at as string | null) ??
        nowIso
      const fallback: StoreBriefing = {
        id: `pesquisa:${storeId}`,
        store_id: storeId,
        onboarding_data_id: null,
        // raw_text briefing — mesma forma que o modo manual grava em
        // store_briefings; o tipo BriefingData é estruturado, então cast.
        briefing_data: { raw_text: text } as unknown as BriefingData,
        version: 0,
        status: "current",
        generated_at: generatedAt,
        generated_by: "pesquisa_diagnostico",
        created_at: generatedAt,
      }
      return successResponse(request, { briefing: fallback })
    }

    return successResponse(request, { briefing: null })
  } catch (error) {
    return errorResponse(request, error, "OnboardingStoreBriefing")
  }
}

/**
 * PATCH /api/onboarding/store-briefing
 * Update briefing_data (inline editing)
 * Body: { briefing_id, briefing_data }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()

    if (!body.briefing_id || !body.briefing_data) {
      throw new AppError("briefing_id e briefing_data são obrigatórios", 400)
    }

    const adminClient = createAdminClient()

    // Verify user belongs to an org
    const { data: orgMember } = await adminClient
      .from("org_members")
      .select("id, org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single()

    if (!orgMember) {
      throw new AppError("Não autorizado", 403)
    }

    // Verify briefing exists and belongs to user's org
    const { data: existing } = await adminClient
      .from("store_briefings")
      .select("id, store_id, version, store:client_stores!inner(org_id)")
      .eq("id", body.briefing_id)
      .eq("status", "current")
      .single()

    if (!existing) {
      throw new AppError("Briefing não encontrado", 404)
    }

    const storeOrg = (existing.store as unknown as { org_id: string })?.org_id
    if (storeOrg && storeOrg !== orgMember.org_id) {
      throw new AppError("Não autorizado para este briefing", 403)
    }

    // Update the briefing_data
    const { error } = await adminClient
      .from("store_briefings")
      .update({
        briefing_data: body.briefing_data,
        generated_by: `edited:${user.id}`,
      })
      .eq("id", body.briefing_id)

    if (error) {
      log.error("Failed to update briefing", error)
      throw new AppError("Erro ao atualizar briefing", 500)
    }

    log.info(`Briefing ${body.briefing_id} updated by ${user.id}`)

    return successResponse(request, {
      success: true,
      message: "Briefing atualizado com sucesso",
    })
  } catch (error) {
    return errorResponse(request, error, "OnboardingStoreBriefing")
  }
}

/**
 * POST /api/onboarding/store-briefing
 * Generate/regenerate briefing via N8N or create manual briefing
 * Body: { store_id, mode: 'regenerate' | 'manual', briefing_text?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()

    if (!body.store_id) {
      throw new AppError("store_id é obrigatório", 400)
    }

    const mode = body.mode || "regenerate"
    if (!["regenerate", "manual"].includes(mode)) {
      throw new AppError("mode deve ser 'regenerate' ou 'manual'", 400)
    }

    const adminClient = createAdminClient()

    if (mode === "manual") {
      if (!body.briefing_text || typeof body.briefing_text !== "string" || !body.briefing_text.trim()) {
        throw new AppError("briefing_text é obrigatório para modo manual", 400)
      }

      // Archive existing briefing if any
      await adminClient
        .from("store_briefings")
        .update({ status: "archived" })
        .eq("store_id", body.store_id)
        .eq("status", "current")

      // Get current max version
      const { data: latest } = await adminClient
        .from("store_briefings")
        .select("version")
        .eq("store_id", body.store_id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextVersion = (latest?.version || 0) + 1

      // Fetch store basic info for context
      const { data: store } = await adminClient
        .from("client_stores")
        .select("store_name, store_url")
        .eq("id", body.store_id)
        .single()

      const { data: newBriefing, error: insertError } = await adminClient
        .from("store_briefings")
        .insert({
          store_id: body.store_id,
          version: nextVersion,
          status: "current",
          briefing_data: {
            raw_text: body.briefing_text.trim(),
            dados_loja: {
              nome: store?.store_name || "",
              url: store?.store_url || "",
            },
          },
          generated_by: "manual",
          generated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (insertError) {
        log.error("Failed to insert manual briefing", insertError)
        throw new AppError("Erro ao salvar briefing manual", 500)
      }

      log.info(`Manual briefing created for store ${body.store_id}, version ${nextVersion}`)

      return successResponse(request, {
        briefing: newBriefing,
        version: nextVersion,
        message: "Briefing manual criado com sucesso",
      })
    }

    // mode === "regenerate": dispara o mesmo webhook de briefing (N8N_BRIEFING_WEBHOOK_URL)
    const { data: onboarding } = await adminClient
      .from("onboardings")
      .select("id")
      .eq("store_id", body.store_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!onboarding) {
      throw new AppError("Nenhum onboarding encontrado para esta loja", 404)
    }

    if (!process.env.N8N_BRIEFING_WEBHOOK_URL) {
      throw new AppError("N8N_BRIEFING_WEBHOOK_URL não configurada", 502)
    }

    await dispatchBriefingWebhook(onboarding.id)

    log.info(`Briefing webhook dispatched for store ${body.store_id}, onboarding ${onboarding.id}`)

    return successResponse(request, {
      triggered: true,
      message: "Webhook do briefing disparado com sucesso.",
    })
  } catch (error) {
    return errorResponse(request, error, "OnboardingStoreBriefing")
  }
}
