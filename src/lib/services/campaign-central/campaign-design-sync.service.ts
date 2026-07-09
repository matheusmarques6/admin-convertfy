/**
 * Fase 6 do pipeline de DESIGN de campanha — sync do sub-estagio de design
 * para o Kanban do Campaign Central (`campaign_pipeline_items`).
 *
 * Quando a campanha avanca pelas etapas do pipeline `campaign_design`
 * (estrutura -> aprovacao -> producao -> finalizacao), espelhamos o estado no
 * card do Campaign Central pra campanha aparecer "nos dois" lugares com o
 * estado certo:
 *   - `stage` do Kanban segue um mapeamento do sub-estagio (ver SLUG_TO_STAGE);
 *   - `design_data` guarda o detalhe (`design_stage` + `design_version`) pro
 *     Campaign Central exibir o sub-estagio fino.
 *
 * No-op (retorna null) quando a campanha nao tem `design_column_id` (sem design
 * ativo) ou nao tem `pipeline_item_id` (sem card no Campaign Central). E
 * chamada de forma non-blocking pelo handoff (ver `campaign-design-handoff`).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignDesignSync")

/** Mapeamento sub-etapa (slug) -> stage do Kanban do Campaign Central. */
const SLUG_TO_STAGE: Record<string, string> = {
  estrutura: "design",
  producao: "design",
  aprovacao: "review",
  finalizacao: "ready_to_deploy",
  implementacao: "deploying",
}

export async function syncCampaignDesignToPipelineItem(params: {
  suggestionId: string
  orgId: string
}): Promise<{ stage: string } | null> {
  const admin = createAdminClient()

  const { data: campaign } = await admin
    .from("campaign_suggestions")
    .select("id, org_id, design_column_id, design_version, pipeline_item_id")
    .eq("id", params.suggestionId)
    .eq("org_id", params.orgId)
    .maybeSingle()

  if (!campaign) return null

  const designColumnId = (campaign.design_column_id as string | null) ?? null
  const pipelineItemId = (campaign.pipeline_item_id as string | null) ?? null

  // Sem design ativo ou sem card no Campaign Central -> no-op.
  if (!designColumnId || !pipelineItemId) return null

  const designVersion = (campaign.design_version as number | null) ?? 1

  // Resolve o slug da sub-etapa via coluna do pipeline de design.
  const { data: column } = await admin
    .from("operational_pipeline_columns")
    .select("id, slug")
    .eq("id", designColumnId)
    .maybeSingle()

  const slug = (column?.slug as string | null) ?? null
  if (!slug) return null

  const stage = SLUG_TO_STAGE[slug]
  if (!stage) return null

  // Merge nao-destrutivo do design_data existente do card.
  const { data: existingItem } = await admin
    .from("campaign_pipeline_items")
    .select("id, design_data")
    .eq("id", pipelineItemId)
    .maybeSingle()

  const existingDesignData =
    (existingItem?.design_data as Record<string, unknown> | null) ?? {}

  const nextDesignData = {
    ...existingDesignData,
    design_stage: slug,
    design_version: designVersion,
  }

  await admin
    .from("campaign_pipeline_items")
    .update({ stage, design_data: nextDesignData })
    .eq("id", pipelineItemId)

  log.info("Synced design stage to Campaign Central pipeline item", {
    suggestionId: params.suggestionId,
    pipelineItemId,
    slug,
    stage,
  })

  return { stage }
}
