/**
 * POST /api/admin/stores/[id]/dispatch-email-copies
 *
 * Trigger manual: dispara a geração de copy via n8n para todos (ou alguns)
 * flows da loja. Botão "Gerar copies (n8n)" no workspace de produção.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { enqueueDispatchJob } from "@/lib/services/email-dispatch-queue.service"

const log = logger.child("DispatchEmailCopies")

export const dynamic = "force-dynamic"
export const maxDuration = 60

const bodySchema = z.object({
  flow_ids: z.array(z.string().uuid()).optional(),
  only_drafts: z.boolean().optional(),
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

    log.info("enqueue.start", {
      storeId,
      flow_ids: parsed.flow_ids,
      only_drafts: parsed.only_drafts,
      triggered_by: user.id,
    })

    // Enfileira: o cron (email-dispatch-queue) roda o Montador+Blueprint de
    // cada email em lotes e dispara pro n8n quando todos estão prontos. Não
    // disparamos inline — Architect (Opus, 60-180s/email) estoura o request.
    const result = await enqueueDispatchJob(storeId, {
      triggerSource: "manual_store_button",
      flowIds: parsed.flow_ids,
      triggeredBy: user.id,
      onlyDrafts: parsed.only_drafts,
    })

    return successResponse(request, result)
  } catch (error) {
    log.error("dispatch.error", error)
    return errorResponse(request, error, "dispatch-email-copies")
  }
}
