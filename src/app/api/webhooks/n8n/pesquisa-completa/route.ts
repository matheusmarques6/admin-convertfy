/**
 * POST /api/webhooks/n8n/pesquisa-completa
 *
 * Sinal explícito do n8n de que a Pesquisa & Diagnóstico (5 pilares —
 * marca/loja/ICP/tom/ads em client_stores) terminou de ser gerada. É o
 * GATILHO da geração de email: ENFILEIRA um job em `email_dispatch_jobs`
 * (com seed idempotente dos emails default); o cron
 * `/api/cron/email-dispatch-queue` roda o Architect (Montador + Blueprint,
 * usando a Pesquisa) de cada email em lotes e, quando TODOS estão settled
 * (reference gerada OU fallback global), dispara a copy pro n8n UMA vez via
 * dispatchEmailCopyWebhook — o payload sai com a Pesquisa E a estrutura sob
 * medida de cada email.
 *
 * O n8n deve chamar este endpoint como ÚLTIMO passo do workflow de pesquisa,
 * depois dos callbacks brand/store-story/icp/tone/ads-analyzer. A idempotência
 * vive no enqueue: job ativo → already_queued (dedup app-level + índice único
 * parcial); pós-dispatch, emails fora de draft → no_draft_emails sem criar job.
 *
 * REGERAÇÃO: o briefing webhook (dispatchBriefingWebhook) envia um campo
 * `regeneration` no payload de saída. Quando o briefing é REGERADO, o n8n
 * deve ECOAR `regeneration: true` neste callback. Nesse caso, a geração de
 * copy NÃO é re-disparada (apenas a Pesquisa é atualizada). Quando ausente
 * ou false, o comportamento é o normal: enfileira Architect + seed + copy.
 */

import { NextRequest, after } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { enqueueDispatchJob } from "@/lib/services/email-dispatch-queue.service"
import {
  errorResponse,
  successResponse,
  parseAndValidate,
  NotFoundError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const schema = z.object({
  store_id: z.string().uuid(),
  regeneration: z.boolean().optional().default(false),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const body = await parseAndValidate(request, schema)
    const admin = createAdminClient()

    const { data: store, error: storeErr } = await admin
      .from("client_stores")
      .select("id")
      .eq("id", body.store_id)
      .single()
    if (storeErr || !store) throw new NotFoundError("Loja")

    logger.info("[n8n:pesquisa-completa] received", {
      store_id: body.store_id,
      regeneration: body.regeneration,
    })

    // Gatilho em background — falha não derruba o 200 (o n8n não deve re-tentar
    // por erro nosso). A idempotência vive no enqueue (dedup de job ativo).
    after(async () => {
      // Regeração de briefing apenas atualiza a Pesquisa — não re-dispara copy.
      if (body.regeneration === true) {
        logger.info("[n8n:pesquisa-completa] skipped_due_to_regeneration", {
          store_id: body.store_id,
        })
        return
      }
      try {
        const res = await enqueueDispatchJob(body.store_id, {
          triggerSource: "pesquisa_completa",
          onlyDrafts: true,
        })
        logger.info("[n8n:pesquisa-completa] enqueued", {
          store_id: body.store_id,
          ok: res.ok,
          job_id: res.job_id,
          email_count: res.email_count,
          reason: res.reason,
        })
      } catch (err) {
        logger.error("[n8n:pesquisa-completa] enqueue_failed", {
          store_id: body.store_id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })

    return successResponse(request, {
      data: { store_id: body.store_id, triggered: true },
    })
  } catch (e) {
    return errorResponse(request, e, "n8n:pesquisa-completa")
  }
}
