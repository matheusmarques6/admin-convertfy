/**
 * POST /api/admin/stores/[id]/generate-email
 *
 * Gera um email individual usando a pipeline de IA.
 * Body: { flowId, emailId, flowType, emailNumber }
 *
 * maxDuration: 300s (Vercel serverless limit)
 */

import { NextRequest, after } from "next/server"
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

    // Path with_copy: dispara phase2 em background. Usa o split novo
    // (run-phase2-image -> run-phase2-html-qa) pra cada etapa caber no
    // maxDuration=300s da Vercel — antes o monolito estourava ~355s
    // e o html+qa nunca rodava (Bug 2). Cliente faz polling em
    // /generation-status.
    if (result.triggerPhase2) {
      const secret = process.env.INTERNAL_SECRET
      const baseUrl = (
        process.env.NEXT_PUBLIC_APP_URL ??
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
        `https://${request.headers.get("host") ?? "localhost:3000"}`
      ).replace(/\/$/, "")

      after(async () => {
        if (!secret) {
          log.error("generate-email.phase2.no_internal_secret", {
            emailId: result.emailId,
          })
          return
        }
        try {
          await fetch(`${baseUrl}/api/internal/run-phase2-image/${result.emailId}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": secret,
            },
            body: JSON.stringify({
              storeId,
              triggeredBy: user.id,
              relaxedBrandCheck: result.relaxedBrand === true,
            }),
          })
        } catch (err) {
          log.error("generate-email.phase2.dispatch_error", err)
        }
      })
    }

    return successResponse(request, result)
  } catch (error) {
    log.error("generate-email.error", error)
    return errorResponse(request, error, "generate-email")
  }
}
