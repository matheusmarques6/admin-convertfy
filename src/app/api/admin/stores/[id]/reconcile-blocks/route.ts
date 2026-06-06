/**
 * POST /api/admin/stores/[id]/reconcile-blocks
 *
 * Re-sincroniza a ESTRUTURA dos emails da loja com a blueprint vigente, de
 * forma aditiva e SEM gerar copy (custo zero de token). Botão
 * "Re-sincronizar estrutura" no workspace de produção.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { reconcileStoreStructure } from "@/lib/services/reconcile-blocks.service"

const log = logger.child("ReconcileBlocksRoute")

export const dynamic = "force-dynamic"
export const maxDuration = 60

const bodySchema = z.object({
  flow_ids: z.array(z.string().uuid()).optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)

    const body = await request.json().catch(() => ({}))
    const parsed = bodySchema.parse(body)

    log.info("reconcile.start", {
      storeId,
      flow_ids: parsed.flow_ids,
      triggered_by: user.id,
    })

    const result = await reconcileStoreStructure(storeId, {
      flowIds: parsed.flow_ids,
    })

    return successResponse(request, { ok: true, ...result })
  } catch (error) {
    log.error("reconcile.error", error)
    return errorResponse(request, error, "reconcile-blocks")
  }
}
