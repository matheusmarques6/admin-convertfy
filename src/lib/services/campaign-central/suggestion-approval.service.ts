/**
 * Aprovação de sugestão → item no Kanban (campaign_pipeline_items).
 *
 * Cria um item em stage 'copy_creation' com copy_data herdando o rascunho
 * (subject, blocks) + suggestion_id pra rastreabilidade. Grava o
 * pipeline_item_id na sugestão (necessário pro undo).
 *
 * Undo permitido SÓ enquanto stage='copy_creation' — senão, a equipe já
 * mexeu no item e seria destrutivo voltar atrás.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { CampaignSuggestion } from "@/types/campaign-central"
import { ConflictError, NotFoundError } from "@/lib/api/errors"

const log = logger.child("CampaignSuggestionApproval")

const TYPE_TO_CAMPAIGN_TYPE: Record<string, string> = {
  data: "seasonal",
  tema: "trend",
  email: "benchmark",
  performance: "performance",
  avulsa: "adhoc",
}

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

  const draft = s.email_draft
  const triggerLabel = `${s.trigger?.label ?? ""} — ${s.trigger?.detail ?? ""}`.trim()
  const description = (draft?.strategy && draft.strategy.trim()) || s.angle || triggerLabel
  const targetStores = s.targets.map((t) => ({
    store_id: t.store_id,
    store_name: t.store_name,
    status: "pending" as const,
  }))

  const { data: item, error: insertErr } = await admin
    .from("campaign_pipeline_items")
    .insert({
      org_id: orgId,
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
    .update({
      status: "approved",
      pipeline_item_id: pipelineId,
      decided_by: userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", suggestionId)

  if (updateErr) {
    // Best effort: tenta deletar o item órfão pra não duplicar na próxima aprovação
    await admin.from("campaign_pipeline_items").delete().eq("id", pipelineId)
    throw updateErr
  }

  log.info("approve.done", { suggestionId, pipelineId })
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
