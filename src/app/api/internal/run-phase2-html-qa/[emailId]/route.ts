/**
 * POST /api/internal/run-phase2-html-qa/[emailId]
 *
 * Endpoint INTERNO que roda APENAS HTML + QA do phase2 (Bug 2 split).
 *
 * Chamado por:
 *   - /api/internal/run-phase2-image/[emailId] apos image_done
 *   - watchdog (front extra) ao detectar emails travados em image_done > 5min
 *
 * Auth: HMAC `INTERNAL_SECRET` via header `x-internal-secret`.
 *
 * Body opcional:
 *   { storeId?, triggeredBy?, relaxedBrandCheck? }
 *
 * Comportamento:
 *  - Resolve storeId pelo email (se nao vier no body)
 *  - Dispatcha `runPhase2HtmlQa` via `after()`
 *  - Retorna 200 imediato (`{ accepted: true, emailId }`)
 *  - Idempotente: runPhase2HtmlQa so faz claim se status in (image_done, rendering)
 */

import { NextRequest } from "next/server"
import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { errorResponse, successResponse, NotFoundError } from "@/lib/api/errors"
import { runPhase2HtmlQa } from "@/lib/agents/phase2-runner.service"
import { logger } from "@/lib/logger"

const log = logger.child("InternalRunPhase2HtmlQa")

export const dynamic = "force-dynamic"
export const maxDuration = 800

interface DispatchBody {
  storeId?: string
  triggeredBy?: string
  relaxedBrandCheck?: boolean
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> },
) {
  try {
    requireWebhookSecret(request, "INTERNAL_SECRET", "x-internal-secret")
    const { emailId } = await params

    let body: DispatchBody = {}
    try {
      body = (await request.json()) as DispatchBody
    } catch {
      // Body opcional
    }

    let storeId = body.storeId
    if (!storeId) {
      const admin = createAdminClient()
      const { data: email } = await admin
        .from("email_flow_emails")
        .select("id, flow:email_flows(store_id)")
        .eq("id", emailId)
        .maybeSingle()
      if (!email) throw new NotFoundError("Email")
      const flow = Array.isArray(email.flow) ? email.flow[0] : email.flow
      storeId = (flow as { store_id?: string } | null)?.store_id
      if (!storeId) throw new NotFoundError("Store da email")
    }

    const triggeredBy = body.triggeredBy ?? "internal:run-phase2-html-qa"
    const relaxedBrandCheck = body.relaxedBrandCheck === true

    log.info("internal.run_phase2_html_qa.dispatched", { emailId, storeId })

    const work = runPhase2HtmlQa({
      storeId: storeId!,
      emailId,
      triggeredBy,
      relaxedBrandCheck,
    }).then(
      () => undefined,
      (err: unknown) =>
        log.error("internal.run_phase2_html_qa.bg_error", {
          emailId,
          error: err instanceof Error ? err.message : String(err),
        }),
    )

    try {
      after(work)
    } catch (err) {
      log.warn("internal.after_unavailable", {
        error: err instanceof Error ? err.message : String(err),
      })
      void work
    }

    return successResponse(request, { accepted: true, emailId })
  } catch (e) {
    return errorResponse(request, e, "internal:run-phase2-html-qa")
  }
}
