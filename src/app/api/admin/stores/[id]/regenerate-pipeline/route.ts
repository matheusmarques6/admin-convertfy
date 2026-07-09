/**
 * POST /api/admin/stores/[id]/regenerate-pipeline
 *
 * Regeneração COMPLETA do pipeline de emails — replay do fluxo natural do
 * briefing (pesquisa-completa) para uma loja que JÁ gerou:
 *
 *   1. Reseta os emails-alvo para `draft` (limpa timestamps/erros — a copy
 *      atual nos blocos fica até o n8n sobrescrever no callback).
 *   2. Enfileira um job em `email_dispatch_jobs` com forceArchitect: o cron
 *      re-roda Montador + Blueprint de CADA email (mesmo com reference
 *      existente — o upsert sobrescreve) e, quando todos settled, dispara a
 *      copy pro n8n UMA vez. O callback da copy engata a fase 2 (imagem +
 *      HTML + QA) automaticamente.
 *
 * Diferença para os vizinhos:
 *   - generate-blueprints: só arquitetura (inline, sem copy nem render).
 *   - dispatch-email-copies: só copy (sem Architect).
 *   - rerender: só fase 2 (imagem+HTML+QA), preserva copy.
 *   - AQUI: tudo, na ordem do fluxo natural, via fila (sem timeout).
 *
 * Body: { flow_ids?: string[] } — restringe a flows; ausente = loja inteira.
 *
 * Guardas:
 *   - 409 se já existe job ativo (não paga Opus 2× nem cruza batches).
 *   - Status LEGACY (in_progress/approved/live — Epic 8/9 Klaviyo) NÃO são
 *     resetados: pertencem a outro pipeline.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
  NotFoundError,
} from "@/lib/api/errors"
import { enqueueDispatchJob } from "@/lib/services/email-dispatch-queue.service"
import { logger } from "@/lib/logger"

const log = logger.child("RegeneratePipeline")

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  flow_ids: z.array(z.string().uuid()).optional(),
})

// Statuses do pipeline AE que voltam para draft na regeneração. Espelha a
// status machine (CLAUDE.md) — NUNCA incluir os legacy Klaviyo.
const RESETABLE_STATUSES = [
  "pending",
  "copy_generating",
  "copy_generating_recovery",
  "copy_ready",
  "rendering",
  "image_done",
  "qa_running",
  "ready",
  "failed",
]

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    // Body opcional: sem JSON = loja inteira.
    const body = bodySchema.parse(await request.json().catch(() => ({})))
    const flowIds =
      body.flow_ids && body.flow_ids.length > 0 ? body.flow_ids : null

    const { data: store } = await admin
      .from("client_stores")
      .select("id, store_name")
      .eq("id", storeId)
      .maybeSingle<{ id: string; store_name: string }>()
    if (!store) throw new NotFoundError("Loja")

    // Job ativo → 409 ANTES de resetar qualquer coisa (senão os emails viram
    // draft e ficam órfãos até alguém enfileirar de novo).
    const { data: activeJobs } = await admin
      .from("email_dispatch_jobs")
      .select("id")
      .eq("store_id", storeId)
      .in("status", ["pending", "generating", "dispatching"])
      .limit(1)
    if (activeJobs && activeJobs.length > 0) {
      throw new AppError(
        "Já existe uma geração ativa para esta loja. Aguarde terminar antes de regenerar.",
        409,
        "job_active",
      )
    }

    // Flows alvo (valida que pertencem à loja quando flow_ids veio no body).
    let flowQuery = admin
      .from("email_flows")
      .select("id")
      .eq("store_id", storeId)
    if (flowIds) flowQuery = flowQuery.in("id", flowIds)
    const { data: flowRows, error: flowErr } = await flowQuery
    if (flowErr) throw flowErr
    const targetFlowIds = ((flowRows ?? []) as Array<{ id: string }>).map(
      (f) => f.id,
    )
    if (targetFlowIds.length === 0) {
      throw new NotFoundError("Flows da loja")
    }

    // 1) Reset para draft — o enqueue (onlyDrafts) vai pegá-los todos.
    const nowIso = new Date().toISOString()
    const { data: resetRows, error: resetErr } = await admin
      .from("email_flow_emails")
      .update({
        status: "draft",
        copy_ready_at: null,
        rendering_started_at: null,
        qa_started_at: null,
        failed_at: null,
        failure_reason: null,
        copy_ready_dispatch_attempts: 0,
        updated_at: nowIso,
      })
      .in("flow_id", targetFlowIds)
      .in("status", RESETABLE_STATUSES)
      .select("id")
    if (resetErr) throw resetErr
    const emailsReset = ((resetRows ?? []) as Array<{ id: string }>).length

    // 2) Enfileira com forceArchitect — o cron faz o resto (Montador +
    // Blueprint por email, depois dispatch de copy pro n8n uma vez).
    const enqueue = await enqueueDispatchJob(storeId, {
      onlyDrafts: true,
      forceArchitect: true,
      flowIds: flowIds ?? undefined,
      triggerSource: "full_regeneration",
      triggeredBy: user.id,
    })
    if (!enqueue.ok) {
      throw new AppError(
        `Falha ao enfileirar a regeneração: ${enqueue.reason ?? "desconhecida"}`,
        502,
        "enqueue_failed",
      )
    }

    log.info("regenerate_pipeline.enqueued", {
      storeId,
      flowIds,
      emailsReset,
      jobId: enqueue.job_id,
      triggeredBy: user.id,
    })

    return successResponse(request, {
      store_name: store.store_name,
      emails_reset: emailsReset,
      job_id: enqueue.job_id ?? null,
      email_count: enqueue.email_count ?? null,
      message:
        "Regeneração completa enfileirada: Montador + Blueprint por email, depois copy (n8n) e render. Acompanhe em /admin/agents/runs.",
    })
  } catch (error) {
    log.error("regenerate_pipeline.error", error)
    return errorResponse(request, error, "regenerate-pipeline")
  }
}
