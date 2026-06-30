/**
 * POST /api/admin/campaign-central/suggestions/[id]/start-design
 *
 * Recuperação / rede de segurança: (re)instancia as tasks da etapa "estrutura"
 * do pipeline de design para uma campanha APROVADA. Idempotente
 * (`instantiateCampaignStage` deduplica por coluna+versão) — seguro re-chamar.
 *
 * Existe porque, com a coluna `tasks.operational_pipeline_id` removida no schema
 * v2, instâncias antigas do design falhavam em silêncio e a campanha ia pro
 * board de Design SEM nenhuma task. Use este endpoint pra DESTRAVAR uma campanha
 * nesse estado (cria a task de estrutura que faltou). Após o fix do instantiate,
 * novas campanhas não precisam disto.
 *
 * Autorização: bypass (admin/dev/coo).
 */
import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { isOnboardingBypass } from "@/lib/permissions/onboarding-stage-access"
import { instantiateCampaignStage } from "@/lib/services/campaign-central/campaign-design-instantiate.service"

export const dynamic = "force-dynamic"

interface SugRow {
  id: string
  org_id: string
  status: string
  design_pilot_store_id: string | null
  targets: Array<{ store_id: string }> | null
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) throw new AppError("Sem org membership", 403)
    if (!isOnboardingBypass(ctx.roles)) {
      throw new AppError("Sem permissão para iniciar o design desta campanha", 403)
    }

    const admin = createAdminClient()
    const { data: sug } = await admin
      .from("campaign_suggestions")
      .select("id, org_id, status, design_pilot_store_id, targets")
      .eq("id", id)
      .eq("org_id", ctx.orgId)
      .maybeSingle<SugRow>()

    if (!sug) throw new AppError("Campanha não encontrada", 404)
    if (sug.status !== "approved") {
      throw new AppError(
        "A campanha precisa estar aprovada para iniciar o design",
        409,
      )
    }

    const targets = sug.targets ?? []
    const pilotStoreId = sug.design_pilot_store_id ?? targets[0]?.store_id ?? null

    // Idempotente: se as tasks de estrutura já existem, devolve as mesmas.
    const { taskIds, columnId } = await instantiateCampaignStage({
      suggestionId: sug.id,
      orgId: sug.org_id,
      stageSlug: "estrutura",
      pilotStoreId,
      createdBy: user.id,
    })

    return successResponse(request, {
      ok: true,
      suggestion_id: sug.id,
      column_id: columnId,
      task_ids: taskIds,
      created: taskIds.length,
    })
  } catch (error) {
    return errorResponse(request, error, "suggestions:start-design")
  }
}
