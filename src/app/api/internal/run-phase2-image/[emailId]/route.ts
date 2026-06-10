/**
 * POST /api/internal/run-phase2-image/[emailId]
 *
 * Endpoint INTERNO que roda APENAS a fase de imagem do phase2 (Bug 2 split).
 *
 * Por que existe: a fase 2 monolitica (image + html + qa) excede o
 * maxDuration=300s da Vercel Pro porque image inclui geracao + sharp +
 * upload (~250s). Split em duas rotas HTTP coloca cada etapa em seu
 * proprio orcamento de tempo.
 *
 * Auth: HMAC `INTERNAL_SECRET` via header `x-internal-secret`.
 *
 * Body opcional:
 *   { storeId?, triggeredBy?, relaxedBrandCheck? }
 *
 * Comportamento:
 *  - Resolve storeId pelo email (se nao vier no body)
 *  - Dispatcha `runPhase2Image` via `after()`
 *  - Quando image_done: dispara fetch interna pra /api/internal/run-phase2-html-qa
 *    no MESMO after() pra encadear sem segurar resposta
 *  - Retorna 200 imediato (`{ accepted: true, emailId }`)
 */

import { NextRequest } from "next/server"
import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { errorResponse, successResponse, NotFoundError } from "@/lib/api/errors"
import { runPhase2Image } from "@/lib/agents/phase2-runner.service"
import { logger } from "@/lib/logger"

const log = logger.child("InternalRunPhase2Image")

export const dynamic = "force-dynamic"
export const maxDuration = 300

interface DispatchBody {
  storeId?: string
  triggeredBy?: string
  relaxedBrandCheck?: boolean
}

function getInternalBaseUrl(request: NextRequest): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    `https://${request.headers.get("host") ?? "localhost:3000"}`
  return base.replace(/\/$/, "")
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
      // Body opcional — watchdog pode chamar sem body
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

    const triggeredBy = body.triggeredBy ?? "internal:run-phase2-image"
    const relaxedBrandCheck = body.relaxedBrandCheck === true

    log.info("internal.run_phase2_image.dispatched", { emailId, storeId })

    const baseUrl = getInternalBaseUrl(request)
    const internalSecret = process.env.INTERNAL_SECRET ?? ""

    const work = async () => {
      try {
        const r = await runPhase2Image({
          storeId: storeId!,
          emailId,
          triggeredBy,
          relaxedBrandCheck,
        })

        // Encadeia fase HTML+QA via fetch interna se imagem completou.
        if (r.status === "image_done") {
          if (!internalSecret) {
            log.error("internal.run_phase2_image.no_secret_for_chain", { emailId })
            return
          }
          try {
            const resp = await fetch(
              `${baseUrl}/api/internal/run-phase2-html-qa/${emailId}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-internal-secret": internalSecret,
                },
                body: JSON.stringify({
                  storeId,
                  triggeredBy,
                  relaxedBrandCheck,
                }),
              },
            )
            if (!resp.ok) {
              log.warn("internal.run_phase2_image.chain_non_ok", {
                emailId,
                status: resp.status,
              })
            }
          } catch (err) {
            log.error("internal.run_phase2_image.chain_error", {
              emailId,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      } catch (err) {
        log.error("internal.run_phase2_image.bg_error", {
          emailId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    try {
      after(work())
    } catch (err) {
      log.warn("internal.after_unavailable", {
        error: err instanceof Error ? err.message : String(err),
      })
      void work()
    }

    return successResponse(request, { accepted: true, emailId })
  } catch (e) {
    return errorResponse(request, e, "internal:run-phase2-image")
  }
}
