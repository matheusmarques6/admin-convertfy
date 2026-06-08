/**
 * POST /api/admin/stores/[id]/generate-email
 *
 * Gera um email individual usando a pipeline de IA.
 * Body: { flowId, emailId, flowType, emailNumber }
 *
 * maxDuration: 300s (Vercel serverless limit)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { runTestGeneration } from "@/lib/agents/test-generation.service"

const log = logger.child("GenerateEmail")

export const dynamic = "force-dynamic"
export const maxDuration = 300

const bodySchema = z.object({
  flowId: z.string().uuid(),
  emailId: z.string().uuid(),
  flowType: z.string().min(1),
  emailNumber: z.number().int().min(1),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)

    const body = await request.json()
    const parsed = bodySchema.parse(body)

    const batchId = crypto.randomUUID()

    log.info("generate-email.start", {
      storeId,
      emailId: parsed.emailId,
      batchId,
      triggeredBy: user.id,
    })

    const result = await runTestGeneration({
      storeId,
      flowId: parsed.flowId,
      emailId: parsed.emailId,
      flowType: parsed.flowType,
      emailNumber: parsed.emailNumber,
      triggeredBy: user.id,
      batchId,
    })

    return successResponse(request, result)
  } catch (error) {
    log.error("generate-email.error", error)
    return errorResponse(request, error, "generate-email")
  }
}
