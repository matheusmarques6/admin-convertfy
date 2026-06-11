/**
 * PATCH /api/admin/campaign-central/suggestions/[id]/set-pilot
 *
 * Body: { store_ids: UUID[] }
 *
 * Define quais lojas serão piloto da campanha. Usado pelo COO no
 * CopyPanel etapa 1.
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
import { setPilotSchema } from "@/lib/validations/campaign-central"
import { setPilotStores } from "@/lib/services/campaign-central/campaign-copy.service"

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
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "set-pilot")

    const body = await parseAndValidate(request, setPilotSchema)

    await setPilotStores({
      suggestionId: id,
      orgId: ctx.orgId,
      storeIds: body.store_ids,
    })

    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "set-pilot")
  }
}
