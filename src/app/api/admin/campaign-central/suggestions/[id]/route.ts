/**
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
        if (Object.keys(patch).length === 0) {
          return successResponse(request, { status: "no_changes" })
        }
        const admin = createAdminClient()
        const { data, error } = await admin
          .from("campaign_suggestions")
          .update(patch)
          .eq("id", id)
          .eq("org_id", ctx.orgId)
          .select("id")
          .maybeSingle()
        if (error) throw error
        if (!data) throw new NotFoundError("Sugestão")
        return successResponse(request, { status: "saved" })
      }
    }
  } catch (error) {
    return errorResponse(request, error, "suggestions:patch")
  }
}
