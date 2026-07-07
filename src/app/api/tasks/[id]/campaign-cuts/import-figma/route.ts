/**
 * POST /api/tasks/[id]/campaign-cuts/import-figma
 *
 * ENFILEIRA o import da IMAGEM DE REFERÊNCIA do corte modelo direto do Figma
 * (link do frame do email modelo, com node-id). O export roda na fila
 * `figma_import_jobs` (cron + kick imediato via after()) respeitando o
 * orçamento de 8 exports do Figma por minuto.
 *
 * Resposta: { job_id, status, already_queued } — o modal faz polling em
 * GET /api/tasks/[id]/figma-import-jobs/[jobId]; quando done, o result tem
 * url/path/dimensões e o client segue com o PUT do rascunho (autosave).
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
import { isFigmaConfigured, parseFigmaUrl } from "@/lib/integrations/figma/client"
import {
  enqueueFigmaImportJob,
  processFigmaImportJobs,
} from "@/lib/services/figma-import-queue.service"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignCutsImportFigma")

export const dynamic = "force-dynamic"
// O kick fire-and-forget (after) pode processar o job inteiro nesta função.
export const maxDuration = 300

const bodySchema = z.object({ figma_url: z.string().url().max(1000) }).strict()

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
    // Validação barata aqui (sem I/O) — link inválido nem entra na fila.
    if (!parseFigmaUrl(body.figma_url)) {
      throw new AppError(
        "Link do Figma inválido — cole o link do frame do email modelo",
        422,
      )
    }

    const enqueued = await enqueueFigmaImportJob({
      kind: "cut_model",
      suggestionId: source_id,
      userId: user.id,
      figmaUrl: body.figma_url,
    })
    if (!enqueued.ok) {
      throw new AppError(`Falha ao enfileirar o import (${enqueued.reason})`, 500)
    }

    // Kick imediato: 1 export só — na maioria dos casos o job termina antes
    // do primeiro poll do modal, sem esperar o cron.
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
    return errorResponse(request, error, "tasks:campaign-cuts:import-figma")
  }
}
