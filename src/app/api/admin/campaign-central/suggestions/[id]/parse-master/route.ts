/**
 * POST /api/admin/campaign-central/suggestions/[id]/parse-master
 *
 * Body: { raw_text: string }
 *
 * Converte texto bruto colado pelo COO em estrutura de blocks do builder.
 * Usa IA pra detectar seções, produtos, ofertas, CTAs. Persiste em
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
import { parseMasterSchema } from "@/lib/validations/campaign-central"
import { parseMasterFromText } from "@/lib/services/campaign-central/copy-master.service"

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
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "parse-master")

    const body = await parseAndValidate(request, parseMasterSchema)

    const result = await parseMasterFromText({
      suggestionId: id,
      orgId: ctx.orgId,
      rawText: body.raw_text,
    })

    if (!result.ok) {
      return errorResponse(
        request,
        new Error(result.error ?? "Falha ao parsear texto"),
        "parse-master",
      )
    }

    return successResponse(request, { draft: result.draft })
  } catch (error) {
    return errorResponse(request, error, "parse-master")
  }
}
