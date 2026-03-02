import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { generateBriefing } from "@/lib/services/briefing.service"

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

    const { data: briefing, error } = await adminClient
      .from("store_briefings")
      .select("*")
      .eq("store_id", storeId)
      .eq("status", "current")
      .order("version", { ascending: false })
      .limit(1)
      .single()

    if (error) {
      // No briefing found is fine
      return successResponse(request, { briefing: null })
    }

    return successResponse(request, { briefing })
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
 * Generate or regenerate briefing
 * Body: { store_id, mode: 'auto' | 'regenerate' }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()

    if (!body.store_id) {
      throw new AppError("store_id é obrigatório", 400)
    }

    const mode = body.mode || "auto"
    if (!["auto", "regenerate"].includes(mode)) {
      throw new AppError("mode deve ser 'auto' ou 'regenerate'", 400)
    }

    const result = await generateBriefing(body.store_id)

    log.info(`Briefing ${mode === "regenerate" ? "regenerated" : "generated"} for store ${body.store_id}, version ${result.version}`)

    return successResponse(request, {
      ...result,
      message: mode === "regenerate" ? "Briefing regenerado com sucesso" : "Briefing gerado com sucesso",
    })
  } catch (error) {
    return errorResponse(request, error, "OnboardingStoreBriefing")
  }
}
