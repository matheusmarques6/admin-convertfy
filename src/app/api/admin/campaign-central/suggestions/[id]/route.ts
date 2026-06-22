/**
 * GET /api/admin/campaign-central/suggestions/[id]
 *
 * Retorna a CampaignSuggestion completa (cross-ciclo). Usado pelo board pra
 * abrir CopyPanel/CampaignDetailModal a partir de um card sem depender do
 * endpoint de ciclo (que só traz sugestões do ciclo corrente).
 *
 * PATCH /api/admin/campaign-central/suggestions/[id]
 *
 * Body: discriminated union (validations/campaign-central.ts):
 *   - { action: 'approve', email_draft? } — cria pipeline item, status=approved
 *   - { action: 'dismiss' } — status=dismissed
 *   - { action: 'undo' } — volta pra suggested (deleta pipeline item se ainda em copy_creation)
 *   - { action: 'update_draft', email_draft?, angle?, send_date?, brief?, targets?, channel? } — salva rascunho/edits
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  parseAndValidate,
  requireAuth,
  successResponse,
  NotFoundError,
} from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { suggestionPatchSchema } from "@/lib/validations/campaign-central"
import {
  approveSuggestion,
  dismissSuggestion,
  undoSuggestionDecision,
} from "@/lib/services/campaign-central/suggestion-approval.service"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "suggestions:get")

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("campaign_suggestions")
      .select("*")
      .eq("id", id)
      .eq("org_id", ctx.orgId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new NotFoundError("Sugestão")

    return successResponse(request, { suggestion: data })
  } catch (error) {
    return errorResponse(request, error, "suggestions:get")
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "suggestions:patch")

    const body = await parseAndValidate(request, suggestionPatchSchema)

    switch (body.action) {
      case "approve": {
        if (body.email_draft) {
          const admin = createAdminClient()
          const { error } = await admin
            .from("campaign_suggestions")
            .update({ email_draft: body.email_draft })
            .eq("id", id)
            .eq("org_id", ctx.orgId)
          if (error) throw error
        }
        const result = await approveSuggestion({
          suggestionId: id,
          orgId: ctx.orgId,
          userId: user.id,
        })
        return successResponse(request, { status: "approved", ...result })
      }

      case "dismiss": {
        await dismissSuggestion({ suggestionId: id, orgId: ctx.orgId, userId: user.id })
        return successResponse(request, { status: "dismissed" })
      }

      case "undo": {
        await undoSuggestionDecision({ suggestionId: id, orgId: ctx.orgId })
        return successResponse(request, { status: "suggested" })
      }

      case "update_draft": {
        const admin = createAdminClient()
        const patch: Record<string, unknown> = {}
        if (body.email_draft) patch.email_draft = body.email_draft
        if (body.angle != null) patch.angle = body.angle
        if (body.send_date !== undefined) patch.send_date = body.send_date
        // Briefing de estrutura & tom (COO). Aceita objeto ou null (apagar).
        if (body.brief !== undefined) patch.brief = body.brief
        if (body.channel != null) patch.channel = body.channel

        // Lojas-alvo editáveis (aba Lojas). Revalida contra client_stores e
        // recomputa target_summary (mesma fórmula do fluxo manual). Só permitido
        // enquanto a campanha é rascunho (status='suggested'); depois de
        // aprovada/descartada as lojas ficam fixas (já estão no fluxo de
        // produção por loja).
        if (body.targets) {
          const { data: current } = await admin
            .from("campaign_suggestions")
            .select("status, pipeline_item_id")
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .maybeSingle()
          if (!current) throw new NotFoundError("Sugestão")
          if (current.status !== "suggested") {
            return errorResponse(
              request,
              new Error("As lojas-alvo só podem ser editadas enquanto a campanha é uma sugestão."),
              "suggestions:patch",
            )
          }
          const storeIds = body.targets.map((t) => t.store_id)
          const { data: stores, error: storesErr } = await admin
            .from("client_stores")
            .select("id, store_name, country")
            .eq("org_id", ctx.orgId)
            .in("id", storeIds)
          if (storesErr) throw storesErr
          const validById = new Map((stores ?? []).map((s) => [s.id as string, s]))
          const normalized = body.targets
            .filter((t) => validById.has(t.store_id))
            .map((t) => {
              const s = validById.get(t.store_id)!
              return {
                store_id: t.store_id,
                store_name: (s.store_name as string) ?? t.store_name,
                country: ((s.country as string) || t.country || "BR").toUpperCase().slice(0, 2),
              }
            })
          if (normalized.length === 0) {
            return errorResponse(
              request,
              new Error("Nenhuma loja-alvo válida"),
              "suggestions:patch",
            )
          }
          patch.targets = normalized
          patch.target_summary = `${normalized.length} loja${normalized.length > 1 ? "s" : ""}`

          // Campanha manual já nasce com pipeline_item (copy_creation): o card
          // do board deriva as lojas de target_stores, então sincroniza pra a
          // edição refletir. Preserva o estado por loja das que continuam;
          // novas entram como pending/stage 0 (mesma forma do saveAsDraft).
          if (current.pipeline_item_id) {
            const { data: item } = await admin
              .from("campaign_pipeline_items")
              .select("target_stores")
              .eq("id", current.pipeline_item_id)
              .maybeSingle()
            const existing = (item?.target_stores as Array<Record<string, unknown>> | null) ?? []
            const existingById = new Map(existing.map((t) => [t.store_id as string, t]))
            const nextStores = normalized.map(
              (t) =>
                existingById.get(t.store_id) ?? {
                  store_id: t.store_id,
                  store_name: t.store_name,
                  status: "pending",
                  prod_stage: 0,
                  designer_id: null,
                },
            )
            await admin
              .from("campaign_pipeline_items")
              .update({ target_stores: nextStores })
              .eq("id", current.pipeline_item_id)
          }
        }

        if (Object.keys(patch).length === 0) {
          return successResponse(request, { status: "no_changes" })
        }
        const { data, error } = await admin
          .from("campaign_suggestions")
          .update(patch)
          .eq("id", id)
          .eq("org_id", ctx.orgId)
          .select("id, pipeline_item_id")
          .maybeSingle()
        if (error) throw error
        if (!data) throw new NotFoundError("Sugestão")
        // Sync send_date no pipeline_item espelhado (se já existe).
        // Aba "Em produção" e calendário leem de fontes diferentes — manter
        // os dois em sincronia evita o card sumir do calendário quando o
        // COO troca a data.
        if (body.send_date !== undefined && data.pipeline_item_id) {
          const { data: item } = await admin
            .from("campaign_pipeline_items")
            .select("deploy_config")
            .eq("id", data.pipeline_item_id)
            .maybeSingle()
          const cfg = (item?.deploy_config ?? {}) as Record<string, unknown>
          await admin
            .from("campaign_pipeline_items")
            .update({ deploy_config: { ...cfg, send_date: body.send_date } })
            .eq("id", data.pipeline_item_id)
        }
        // Sync channel no copy_data do pipeline_item (o board lê o canal de
        // copy_data.channel). Mantém o card coerente com a edição na aba
        // Agendamento de campanhas manuais, que já têm pipeline_item.
        if (body.channel != null && data.pipeline_item_id) {
          const { data: item } = await admin
            .from("campaign_pipeline_items")
            .select("copy_data")
            .eq("id", data.pipeline_item_id)
            .maybeSingle()
          const cd = (item?.copy_data ?? {}) as Record<string, unknown>
          await admin
            .from("campaign_pipeline_items")
            .update({ copy_data: { ...cd, channel: body.channel } })
            .eq("id", data.pipeline_item_id)
        }
        return successResponse(request, { status: "saved" })
      }
    }
  } catch (error) {
    return errorResponse(request, error, "suggestions:patch")
  }
}
