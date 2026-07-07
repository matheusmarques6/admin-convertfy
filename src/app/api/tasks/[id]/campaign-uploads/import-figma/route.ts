/**
 * POST /api/tasks/[id]/campaign-uploads/import-figma
 *
 * Modo automático da Tela 2: ENFILEIRA o import dos emails por loja a partir
 * do arquivo do Figma da campanha (frames top-level nomeados com o nome da
 * loja). O processamento acontece na fila `figma_import_jobs` (cron every
 * minute + kick imediato via after()) respeitando o orçamento de 8 exports
 * do Figma por minuto — ver figma-import-queue.service.ts.
 *
 * Resposta: { job_id, status, already_queued } — o modal faz polling em
 * GET /api/tasks/[id]/figma-import-jobs/[jobId] (progresso por loja ao vivo).
 *
 * Body: { store_ids?: string[] } — retry individual reenvia só as lojas que
 * falharam; durante job ativo, anexa ao job existente (already_queued).
 */

import { NextRequest } from "next/server"
import { after } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import {
  AppError,
  errorResponse,
  parseAndValidate,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { isFigmaConfigured } from "@/lib/integrations/figma/client"
import {
  enqueueFigmaImportJob,
  processFigmaImportJobs,
} from "@/lib/services/figma-import-queue.service"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignUploadsImportFigma")

export const dynamic = "force-dynamic"
// O kick fire-and-forget (after) pode processar o job inteiro nesta função.
export const maxDuration = 300

const bodySchema = z
  .object({
    store_ids: z.array(z.string().uuid()).min(1).max(200).optional(),
  })
  .strict()

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await requireTaskAccess(user.id, id, "work")

    const { source_type, source_id } = ctx.task
    if (source_type !== "campaign_suggestion" || !source_id) {
      throw new AppError("Task não é de campanha", 400)
    }

    if (!isFigmaConfigured()) {
      throw new AppError(
        "FIGMA_PERSONAL_TOKEN não configurado — use o upload manual",
        422,
      )
    }

    const body = await parseAndValidate(request, bodySchema)
    const enqueued = await enqueueFigmaImportJob({
      kind: "store_emails",
      suggestionId: source_id,
      orgId: ctx.member.orgId,
      userId: user.id,
      storeIds: body.store_ids,
    })
    if (!enqueued.ok) {
      throw new AppError(`Falha ao enfileirar o import (${enqueued.reason})`, 500)
    }

    // Kick imediato: caminho feliz resolve sem esperar o próximo tick do
    // cron. Claim CAS garante que kick + cron não processam o mesmo job 2x.
    after(
      processFigmaImportJobs().catch((err) =>
        log.error("kick.failed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      ),
    )

    return successResponse(request, {
      job_id: enqueued.jobId,
      status: "pending",
      already_queued: enqueued.alreadyQueued,
    })
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-uploads:import-figma")
  }
}
