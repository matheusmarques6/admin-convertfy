/**
 * PATCH /api/admin/campaign-central/production/[id]
 *
 * Atualiza o estágio (0..4) e/ou o designer de UMA loja dentro da campanha
 * em produção (pipeline item [id]). Mutação cirúrgica no JSONB target_stores.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, parseAndValidate, requireAuth, successResponse } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { productionStorePatchSchema } from "@/lib/validations/campaign-central"
import { updateProductionStore } from "@/lib/services/campaign-central/production.service"

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
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "production:patch")

    const body = await parseAndValidate(request, productionStorePatchSchema)

    const store = await updateProductionStore({
      orgId: ctx.orgId,
      itemId: id,
      storeId: body.store_id,
      prodStage: body.prod_stage,
      designerId: body.designer_id,
    })

    return successResponse(request, { store })
  } catch (error) {
    return errorResponse(request, error, "production:patch")
  }
}
