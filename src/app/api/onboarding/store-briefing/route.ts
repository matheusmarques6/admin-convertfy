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
