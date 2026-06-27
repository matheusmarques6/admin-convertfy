/**
 * POST /api/admin/campaign-central/suggestions/[id]/design-decision
 *
 * Fase 8 — rota de decisao do COO na etapa de aprovacao do pipeline de design.
 *
 * Body: { decision: 'approve' | 'request_changes' }
 *   - approve         -> aprovacao -> producao
 *   - request_changes -> version++, volta pra estrutura
 *
 * Autorizacao (so quem acessa a etapa `aprovacao`: coo/admin/dev) e a transicao
 * vivem em `decideCampaignDesign`; 403/erros viram resposta via `errorResponse`.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  parseAndValidate,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { decideCampaignDesign } from "@/lib/services/campaign-central/campaign-design-decision.service"

export const dynamic = "force-dynamic"

const designDecisionSchema = z.object({
  decision: z.enum(["approve", "request_changes"]),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) {
      return errorResponse(
        request,
        new Error("Sem org membership"),
        "suggestions:design-decision",
      )
    }

    const body = await parseAndValidate(request, designDecisionSchema)

    const status = await decideCampaignDesign({
      suggestionId: id,
      orgId: ctx.orgId,
      userId: user.id,
      decision: body.decision,
    })

    return successResponse(request, { status })
  } catch (error) {
    return errorResponse(request, error, "suggestions:design-decision")
  }
}
