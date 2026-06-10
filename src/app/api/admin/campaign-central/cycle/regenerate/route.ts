/**
 * POST /api/admin/campaign-central/cycle/regenerate
 *
 * Dispara runSuggestionCycle manualmente (botão "Re-gerar" na tela).
 * Mesmo lock do cron — se outro ciclo está rodando, retorna 409.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, ConflictError } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { runSuggestionCycle } from "@/lib/services/campaign-central/suggestion-engine.service"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignCentralRegenerate")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "campaign-central:regenerate")

    log.info("regenerate.start", { orgId: ctx.orgId, userId: user.id })
    const result = await runSuggestionCycle({ orgId: ctx.orgId, triggeredBy: "manual" })

    if (result.status === "skipped_locked") {
      throw new ConflictError("Já existe um ciclo em geração. Aguarde alguns minutos.")
    }
    if (result.status === "no_stores") {
      return successResponse(request, { ...result, message: "Nenhuma loja elegível (ativa + Omnisend)" })
    }
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "campaign-central:regenerate")
  }
}
