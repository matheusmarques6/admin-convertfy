/**
 * Aprovação de sugestão → item no Kanban (campaign_pipeline_items).
 *
 * Dois caminhos:
 *
 *   saveAsDraft()  — cria pipeline_item sem design task; sugestão fica em
 *                    status='suggested'. Usado pela criação manual (Nova
 *                    campanha) e por qualquer fluxo que precise "rascunho".
 *
 *   approveSuggestion() — gate: exige pelo menos 1 entry em
 *                    copy_results.test com quality='good'. Quando passa,
 *                    cria/garante pipeline_item, cria design_task e move
 *                    status pra 'approved'. SÓ AQUI o designer entra no
 *                    fluxo.
 *
 * Undo permitido SÓ enquanto stage='copy_creation'.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { CampaignSuggestion } from "@/types/campaign-central"
import { ConflictError, NotFoundError } from "@/lib/api/errors"
import { instantiateCampaignStage } from "./campaign-design-instantiate.service"
import { dispatchCampaignCopyToN8n } from "./campaign-copy-dispatch.service"

const log = logger.child("CampaignSuggestionApproval")

const TYPE_TO_CAMPAIGN_TYPE: Record<string, string> = {
  data: "seasonal",
  tema: "trend",
  email: "benchmark",
  performance: "performance",
  avulsa: "adhoc",
}

/** Faz o INSERT em campaign_pipeline_items + grava pipeline_item_id na sugestão.
 *  Não cria design task, não muda status da sugestão. Idempotente:
 *  se já existe pipeline_item_id, retorna o existente. */
async function ensurePipelineItem(s: CampaignSuggestion, userId: string): Promise<string> {
  const admin = createAdminClient()
  if (s.pipeline_item_id) return s.pipeline_item_id

  const draft = s.email_draft
  const triggerLabel = `${s.trigger?.label ?? ""} — ${s.trigger?.detail ?? ""}`.trim()
  const description = (draft?.strategy && draft.strategy.trim()) || s.angle || triggerLabel
  const targetStores = s.targets.map((t) => ({
    store_id: t.store_id,
    store_name: t.store_name,
    status: "pending" as const,
    prod_stage: 0,
    designer_id: null as string | null,
  }))

  const { data: item, error: insertErr } = await admin
    .from("campaign_pipeline_items")
    .insert({
      org_id: s.org_id,
      title: s.title,
      description,
      stage: "copy_creation",
      campaign_type: TYPE_TO_CAMPAIGN_TYPE[s.type] ?? "adhoc",
      subject_line: draft?.subject ?? s.subject ?? null,
      preview_text: draft?.preheader ?? null,
      copy_data: {
        suggestion_id: s.id,
        confidence: s.confidence,
        trigger: s.trigger,
        angle: s.angle,
        channel: s.channel,
        blocks: draft?.blocks ?? [],
        copy_results: s.copy_results ?? {},
        est_revenue: s.est_revenue,
      },
      target_stores: targetStores,
      deploy_config: s.send_date ? { send_date: s.send_date } : {},
      tags: ["central", s.type],
      created_by: userId,
    })
    .select("id")
    .single()

  if (insertErr) throw insertErr
  const pipelineId = item.id as string

  const { error: updateErr } = await admin
    .from("campaign_suggestions")
    .update({ pipeline_item_id: pipelineId })
    .eq("id", s.id)

  if (updateErr) {
    await admin.from("campaign_pipeline_items").delete().eq("id", pipelineId)
    throw updateErr
  }
  return pipelineId
}

/** Cria pipeline_item sem design task. Sugestão fica em 'suggested'.
 *  Usado pela criação manual e por qualquer ponto que precise "rascunho". */
export async function saveAsDraft(params: {
  suggestionId: string
  orgId: string
  userId: string
}): Promise<{ pipeline_item_id: string }> {
  const admin = createAdminClient()
  const { suggestionId, orgId, userId } = params

  const { data: suggestion } = await admin
    .from("campaign_suggestions")
    .select("*")
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (!suggestion) throw new NotFoundError("Sugestão")
  const s = suggestion as CampaignSuggestion

  if (s.pipeline_item_id) {
    log.info("draft.already_exists", { suggestionId, pipelineId: s.pipeline_item_id })
    return { pipeline_item_id: s.pipeline_item_id }
  }

  const pipelineId = await ensurePipelineItem(s, userId)
  log.info("draft.created", { suggestionId, pipelineId })
  return { pipeline_item_id: pipelineId }
}

/** Aprova a campanha em definitivo: gate de pelo menos 1 piloto 'good',
 *  garante pipeline_item, cria design task, move status pra 'approved'. */
export async function approveSuggestion(params: {
  suggestionId: string
  orgId: string
  userId: string
}): Promise<{ pipeline_item_id: string }> {
  const admin = createAdminClient()
  const { suggestionId, orgId, userId } = params

  const { data: suggestion } = await admin
    .from("campaign_suggestions")
    .select("*")
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (!suggestion) throw new NotFoundError("Sugestão")
  const s = suggestion as CampaignSuggestion

  if (s.status === "approved" && s.pipeline_item_id) {
    log.info("approve.already_approved", { suggestionId, pipelineId: s.pipeline_item_id })
    return { pipeline_item_id: s.pipeline_item_id }
  }

  // GATE: aprovação requer pelo menos 1 piloto marcado como 'good'.
  // Sem isso, a campanha vai pros designers sem teste validado pelo COO.
  const pilot = (s.copy_results?.test ?? {}) as Record<string, { quality?: "good" | null }>
  const goodEntries = Object.entries(pilot).filter(([, e]) => e.quality === "good")
  if (goodEntries.length === 0) {
    throw new ConflictError(
      "Gere a copy de teste e marque pelo menos 1 loja como 'Boa' antes de aprovar.",
    )
  }
  // Loja piloto = a PRIMEIRA marcada 'good' (vai pro Figma da etapa estrutura).
  const pilotStoreId = goodEntries[0][0]

  const pipelineId = await ensurePipelineItem(s, userId)

  // Inicia o pipeline de DESIGN: instancia a etapa `estrutura` pra loja piloto.
  // instantiateCampaignStage e idempotente e ja seta design_pipeline_id/
  // design_column_id/design_pilot_store_id na campanha.
  // Inicia o design como side-effect NAO-BLOQUEANTE: a aprovacao nao deve
  // falhar (nem deixar pipeline_item orfao sem status) se o pipeline de design
  // nao conseguir iniciar. Em producao o bootstrap e idempotente e cria o
  // board, entao isso quase nunca falha; quando falhar, fica logado e o design
  // pode ser re-disparado pelo proximo gatilho.
  let designTaskId: string | null = s.design_task_id ?? null
  if (!designTaskId) {
    try {
      const { taskIds } = await instantiateCampaignStage({
        suggestionId,
        orgId,
        stageSlug: "estrutura",
        pilotStoreId,
        createdBy: userId,
      })
      designTaskId = taskIds[0] ?? null
    } catch (err) {
      log.error("approve.design_start_failed", {
        suggestionId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const { error: updateErr } = await admin
    .from("campaign_suggestions")
    .update({
      status: "approved",
      pipeline_item_id: pipelineId,
      design_task_id: designTaskId,
      decided_by: userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", suggestionId)

  if (updateErr) {
    if (designTaskId && designTaskId !== s.design_task_id) {
      await admin.from("tasks").delete().eq("id", designTaskId)
    }
    throw updateErr
  }

  // Aprovada de verdade: dispara a geração de copy de PRODUÇÃO para TODAS as
  // lojas-alvo (não só a piloto). NON-BLOCKING: uma falha do dispatch (ex.: n8n
  // fora) não pode abortar a aprovação nem reverter o status já gravado.
  try {
    await dispatchCampaignCopyToN8n({
      suggestionId,
      orgId,
      mode: "production",
      storeIds: s.targets.map((t) => t.store_id),
      triggeredBy: userId ?? "approval",
    })
  } catch (err) {
    log.error("approve.copy_dispatch_failed", {
      suggestionId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  log.info("approve.done", { suggestionId, pipelineId, designTaskId })
  return { pipeline_item_id: pipelineId }
}

export async function dismissSuggestion(params: {
  suggestionId: string
  orgId: string
  userId: string
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("campaign_suggestions")
    .update({
      status: "dismissed",
      decided_by: params.userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", params.suggestionId)
    .eq("org_id", params.orgId)
  if (error) throw error
}

export async function undoSuggestionDecision(params: {
  suggestionId: string
  orgId: string
}): Promise<void> {
  const admin = createAdminClient()
  const { suggestionId, orgId } = params

  const { data: suggestion } = await admin
    .from("campaign_suggestions")
    .select("id, status, pipeline_item_id")
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (!suggestion) throw new NotFoundError("Sugestão")

  if (suggestion.pipeline_item_id) {
    const { data: item } = await admin
      .from("campaign_pipeline_items")
      .select("id, stage")
      .eq("id", suggestion.pipeline_item_id)
      .maybeSingle()

    if (item && item.stage !== "copy_creation") {
      throw new ConflictError(
        `Item já avançou no pipeline (stage: ${item.stage}). Não dá pra desfazer.`,
      )
    }

    if (item) {
      await admin.from("campaign_pipeline_items").delete().eq("id", item.id)
    }
  }

  const { error } = await admin
    .from("campaign_suggestions")
    .update({
      status: "suggested",
      pipeline_item_id: null,
      decided_by: null,
      decided_at: null,
    })
    .eq("id", suggestionId)
  if (error) throw error
}
