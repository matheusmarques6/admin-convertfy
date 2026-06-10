/**
 * POST /api/admin/campaign-central/suggestions/[id]/generate-copy
 *
 * Body: { mode: 'test'|'production', store_ids: string[] }
 *
 * Gera copy POR LOJA (concorrência 3) e persiste em copy_results[mode].
 * "Refazer" de uma loja = chamar com store_ids=[uma]. Síncrono — o
 * painel espera a resposta com as copies.
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
import { generateCopySchema } from "@/lib/validations/campaign-central"
import { generateCampaignCopy } from "@/lib/services/campaign-central/campaign-copy.service"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "generate-copy")

    const body = await parseAndValidate(request, generateCopySchema)

    const result = await generateCampaignCopy({
      suggestionId: id,
      orgId: ctx.orgId,
      mode: body.mode,
      storeIds: body.store_ids,
    })

    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "generate-copy")
  }
}
