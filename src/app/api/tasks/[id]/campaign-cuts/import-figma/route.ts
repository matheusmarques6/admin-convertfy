/**
 * POST /api/tasks/[id]/campaign-cuts/import-figma
 *
 * Importa a IMAGEM DE REFERÊNCIA do corte modelo direto do Figma (link do
 * frame do email modelo, com node-id). Exporta em PNG 2x — mesmo scale do
 * import por loja da Tela 2, garantindo referência proporcional.
 *
 * O upload é "burro" como o /upload: devolve url/path/dimensões e o
 * client segue com o PUT do rascunho (autosave).
 */

import { NextRequest } from "next/server"
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
import { importCutModelImageFromFigma } from "@/lib/services/campaign-central/campaign-cut-model-import.service"

export const dynamic = "force-dynamic"
export const maxDuration = 120

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

    const body = await parseAndValidate(request, bodySchema)
    const result = await importCutModelImageFromFigma(source_id, body.figma_url)
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-cuts:import-figma")
  }
}
