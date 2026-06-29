/**
 * POST /api/webhooks/n8n/campaign-copy-complete
 *
 * Sinal de CONCLUSÃO da geração de copy de PRODUÇÃO (todas as lojas de uma
 * campanha). O n8n chama UMA vez ao terminar o lote. Efeito:
 *   1. Garante as tasks da etapa de design "estrutura" (idempotente — rede de
 *      segurança; em geral já foram criadas na aprovação).
 *   2. Avança o card do board Copy → Design (prod_stage=1 em todas as lojas).
 *
 * Auth: header x-webhook-secret (igual aos demais webhooks n8n).
 * Idempotente: re-chamar não duplica tasks nem regride o board. Só age em
 * mode="production" (teste não move o design).
 */
import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { campaignCopyCompleteSchema } from "@/lib/validations/campaign-central"
import { instantiateCampaignStage } from "@/lib/services/campaign-central/campaign-design-instantiate.service"
import { updateProductionStore } from "@/lib/services/campaign-central/production.service"

const log = logger.child("N8nCampaignCopyComplete")

export const dynamic = "force-dynamic"

interface SugRow {
  id: string
  org_id: string
  status: string
  pipeline_item_id: string | null
  design_pilot_store_id: string | null
  targets: Array<{ store_id: string }> | null
}

interface TargetStoreRow {
  store_id: string
  prod_stage?: number
}

export async function POST(request: NextRequest) {
  // Body bruto antes de validar — deixa rastro do que o n8n mandou.
  const rawText = await request.text().catch(() => "")
  let rawJson: Record<string, unknown> = {}
  try {
    rawJson = JSON.parse(rawText) as Record<string, unknown>
  } catch {
    /* corpo não-JSON: a validação abaixo devolve 400 */
  }
  log.info("campaign_copy_complete.received", {
    has_secret_header: !!request.headers.get("x-webhook-secret"),
    job_id: rawJson.job_id ?? null,
    suggestion_id: rawJson.suggestion_id ?? null,
    mode: rawJson.mode ?? null,
  })

  try {
    requireWebhookSecret(request)

    const parsed = campaignCopyCompleteSchema.safeParse(rawJson)
    if (!parsed.success) {
      log.warn("campaign_copy_complete.validation_failed", {
        issues: parsed.error.issues.slice(0, 5),
      })
      throw new AppError("Payload inválido (campaign-copy-complete)", 400)
    }
    const body = parsed.data

    // Só a produção avança o board pro design. Teste é no-op.
    if (body.mode !== "production") {
      return successResponse(request, { ignored: true, reason: "mode_not_production" })
    }

    const admin = createAdminClient()

    const { data: sug } = await admin
      .from("campaign_suggestions")
      .select("id, org_id, status, pipeline_item_id, design_pilot_store_id, targets")
      .eq("id", body.suggestion_id)
      .eq("org_id", body.org_id)
      .maybeSingle<SugRow>()

    if (!sug) {
      log.warn("campaign_copy_complete.suggestion_not_found", {
        suggestion_id: body.suggestion_id,
      })
      return successResponse(request, { ignored: true, reason: "suggestion_not_found" })
    }
    if (sug.status !== "approved" || !sug.pipeline_item_id) {
      log.info("campaign_copy_complete.not_ready", {
        suggestion_id: body.suggestion_id,
        status: sug.status,
        has_pipeline_item: !!sug.pipeline_item_id,
      })
      return successResponse(request, { ignored: true, reason: "not_approved_or_no_pipeline" })
    }
    const pipelineItemId = sug.pipeline_item_id

    // 1) Garante as tasks de design ("estrutura") — idempotente. Não bloqueia o
    //    avanço do board se falhar (loga e segue).
    const pilotStoreId = sug.design_pilot_store_id ?? sug.targets?.[0]?.store_id ?? null
    try {
      await instantiateCampaignStage({
        suggestionId: sug.id,
        orgId: sug.org_id,
        stageSlug: "estrutura",
        pilotStoreId,
        createdBy: null,
      })
    } catch (err) {
      log.error("campaign_copy_complete.instantiate_failed", {
        suggestion_id: body.suggestion_id,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // 2) Avança Copy → Design: prod_stage=1 em todas as lojas do pipeline_item.
    //    Sequencial: updateProductionStore faz read-modify-write no JSONB.
    const { data: item } = await admin
      .from("campaign_pipeline_items")
      .select("target_stores")
      .eq("id", pipelineItemId)
      .eq("org_id", sug.org_id)
      .maybeSingle()

    const targets = (item?.target_stores as TargetStoreRow[] | null) ?? []
    let moved = 0
    for (const t of targets) {
      if (!t?.store_id) continue
      if ((t.prod_stage ?? 0) >= 1) continue // idempotência: nunca regride
      await updateProductionStore({
        orgId: sug.org_id,
        itemId: pipelineItemId,
        storeId: t.store_id,
        prodStage: 1,
      })
      moved++
    }

    log.info("campaign_copy_complete.advanced", {
      suggestion_id: body.suggestion_id,
      stores_moved: moved,
      stores_total: targets.length,
    })

    return successResponse(request, {
      ok: true,
      suggestion_id: body.suggestion_id,
      stores_moved: moved,
    })
  } catch (e) {
    return errorResponse(request, e, "n8n:campaign-copy-complete")
  }
}
