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
 *   - { action: 'update_draft', email_draft?, angle? } — salva rascunho/edits
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
        const patch: Record<string, unknown> = {}
        if (body.email_draft) patch.email_draft = body.email_draft
        if (body.angle != null) patch.angle = body.angle
        if (body.send_date !== undefined) patch.send_date = body.send_date
        if (Object.keys(patch).length === 0) {
          return successResponse(request, { status: "no_changes" })
        }
        const admin = createAdminClient()
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
        return successResponse(request, { status: "saved" })
      }
    }
  } catch (error) {
    return errorResponse(request, error, "suggestions:patch")
  }
}
