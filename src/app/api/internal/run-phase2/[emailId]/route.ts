/**
 * POST /api/internal/run-phase2/[emailId]
 *
 * Endpoint INTERNO chamado pelo watchdog (story AE-4) quando detecta um
 * email travado em `copy_ready` sem fase 2 iniciada.
 *
 * Auth: HMAC `INTERNAL_SECRET` via header `x-internal-secret`.
 *
 * Comportamento:
 *  - Carrega email para obter store_id
 *  - Dispatcha `runPhase2InBackground` via `waitUntil`
 *  - Retorna 200 imediatamente (`{ accepted: true, emailId }`)
 */

import { NextRequest } from "next/server"
import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { errorResponse, successResponse, NotFoundError } from "@/lib/api/errors"
import { runPhase2InBackground } from "@/lib/agents/phase2-runner.service"
import { logger } from "@/lib/logger"

const log = logger.child("InternalRunPhase2")

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> },
) {
  try {
    requireWebhookSecret(request, "INTERNAL_SECRET", "x-internal-secret")
    const { emailId } = await params

    const admin = createAdminClient()
    const { data: email } = await admin
      .from("email_flow_emails")
      .select("id, flow:email_flows(store_id)")
      .eq("id", emailId)
      .maybeSingle()

    if (!email) throw new NotFoundError("Email")

    const flow = Array.isArray(email.flow) ? email.flow[0] : email.flow
    const storeId = (flow as { store_id?: string } | null)?.store_id
    if (!storeId) throw new NotFoundError("Store da email")

    log.info("internal.run_phase2.dispatched", { emailId, storeId })

    try {
      after(runPhase2InBackground({ storeId, emailId, triggeredBy: "watchdog" }))
    } catch (err) {
      // Runtime sem suporte a `after` — fallback sincrono em background
      log.warn("internal.after_unavailable", {
        error: err instanceof Error ? err.message : String(err),
      })
      void runPhase2InBackground({ storeId, emailId, triggeredBy: "watchdog" }).catch(
        (e: unknown) => log.error("phase2.bg.error", { error: e instanceof Error ? e.message : String(e) }),
      )
    }

    return successResponse(request, { accepted: true, emailId })
  } catch (e) {
    return errorResponse(request, e, "internal:run-phase2")
  }
}
