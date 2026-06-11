/**
 * PATCH /api/admin/campaign-central/suggestions/[id]/mark-quality
 *
 * Body: { store_id: UUID, mode: 'test'|'production', quality: 'good'|null }
 *
 * Marca/desmarca uma copy específica como aprovada. Persiste em
 * copy_results[mode][store_id].quality.
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
import { markQualitySchema } from "@/lib/validations/campaign-central"
import { markCopyQuality } from "@/lib/services/campaign-central/campaign-copy.service"

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
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "mark-quality")

    const body = await parseAndValidate(request, markQualitySchema)

    await markCopyQuality({
      suggestionId: id,
      orgId: ctx.orgId,
      storeId: body.store_id,
      mode: body.mode,
      quality: body.quality,
    })

    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "mark-quality")
  }
}
