/**
 * POST /api/admin/campaign-central/suggestions/[id]/generate-master
 *
 * Body: { audience_label?: string }
 *
 * Gera a copy MASTER da campanha (subject + preheader + strategy + blocks
 * completos) usando IA com base no ângulo/trigger/audience. Persiste em
 * campaign_suggestions.email_draft.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  parseAndValidate,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { generateMasterSchema } from "@/lib/validations/campaign-central"
import { generateMasterFromAngle } from "@/lib/services/campaign-central/copy-master.service"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "generate-master")

    const body = await parseAndValidate(request, generateMasterSchema)

    const result = await generateMasterFromAngle({
      suggestionId: id,
      orgId: ctx.orgId,
      audienceLabel: body.audience_label,
    })

    if (!result.ok) {
      return errorResponse(
        request,
        new Error(result.error ?? "Falha ao gerar master"),
        "generate-master",
      )
    }

    return successResponse(request, { draft: result.draft })
  } catch (error) {
    return errorResponse(request, error, "generate-master")
  }
}
