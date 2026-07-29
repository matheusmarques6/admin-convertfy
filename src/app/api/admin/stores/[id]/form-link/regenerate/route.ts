/**
 * POST /api/admin/stores/[id]/form-link/regenerate
 *
 * Emite um token novo pra loja. O anterior para de resolver na hora —
 * todas as rotas publicas (`/api/forms/[token]/*`) filtram por
 * `form_token`. Use quando o link vazou ou venceu.
 *
 * 404 quando a loja nao tem onboarding (nesse caso o certo e o POST de
 * `/form-link`, que cria).
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { regenerateFormToken } from "@/lib/services/onboarding-form-link.service"

const log = logger.child("StoreFormLinkRegenerate")

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)

    const link = await regenerateFormToken(storeId, user.id)

    log.info("token regenerado", { store_id: storeId, actor_id: user.id })

    return successResponse(request, link)
  } catch (error) {
    log.error("error", error)
    return errorResponse(request, error, "store-form-link-regenerate")
  }
}
