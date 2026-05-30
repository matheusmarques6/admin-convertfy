/**
 * POST /api/admin/stores/[id]/start-onboarding
 *
 * Trigger híbrido (Epic AE - Story AE-2):
 * dispara o pipeline de geração de copies/HTML/QA para uma loja.
 * Usado tanto pelo botão "Iniciar Onboarding" na UI quanto pelo
 * watchdog/signal consumer (AE-4).
 *
 * Body:
 *   {
 *     mode: 'fresh' | 'resume' | 'redo',  // default 'fresh'
 *     flow_ids?: string[],
 *     triggered_by?: 'ui' | 'signal_consumer'  // default 'ui'
 *   }
 *
 * Status: 200 (ok), 401 (no auth), 409 (batch in progress, mode=fresh),
 *         422 (briefing not confirmed), 502 (n8n dispatch failed)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { startOnboarding } from "@/lib/services/email-generation-trigger.service"

const log = logger.child("StartOnboarding")

export const dynamic = "force-dynamic"
export const maxDuration = 60

const bodySchema = z.object({
  mode: z.enum(["fresh", "resume", "redo"]).default("fresh"),
  flow_ids: z.array(z.string().uuid()).optional(),
  triggered_by: z.enum(["ui", "signal_consumer"]).default("ui"),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)

    const raw = await request.json().catch(() => ({}))
    const parsed = bodySchema.parse(raw)

    log.info("request", {
      storeId,
      mode: parsed.mode,
      triggered_by: parsed.triggered_by,
      userId: user.id,
    })

    const result = await startOnboarding({
      storeId,
      mode: parsed.mode,
      flowIds: parsed.flow_ids,
      triggeredBy: parsed.triggered_by,
      triggeredByUserId: user.id,
    })

    return successResponse(request, result)
  } catch (error) {
    log.error("error", error)
    return errorResponse(request, error, "start-onboarding")
  }
}
