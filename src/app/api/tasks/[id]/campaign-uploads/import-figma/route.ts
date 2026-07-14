/**
 * POST /api/tasks/[id]/campaign-uploads/import-figma
 *
 * Modo automático da Tela 2: importa o email de cada loja a partir do
 * arquivo do Figma da campanha (frames top-level nomeados com o nome da
 * loja). Resposta ÚNICA com o resultado por loja
 * (imported/no_frame/ambiguous/failed) — falha parcial não vira 500.
 *
 * Body: { store_ids?: string[] } — retry individual reenvia só as lojas
 * que falharam.
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
import { importStoreEmailsFromFigma } from "@/lib/services/campaign-central/campaign-figma-import.service"

export const dynamic = "force-dynamic"
// 2 chamadas Figma + downloads com pool de 3 — campanhas grandes passam de 60s.
export const maxDuration = 300

const bodySchema = z
  .object({
    store_ids: z.array(z.string().uuid()).min(1).max(200).optional(),
    // Link do Figma colado no modal (override do deliverable da estrutura).
    figma_link: z.string().trim().url().max(500).optional(),
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

    const body = await parseAndValidate(request, bodySchema)
    const result = await importStoreEmailsFromFigma(
      source_id,
      ctx.member.orgId,
      user.id,
      { storeIds: body.store_ids, figmaLink: body.figma_link },
    )
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-uploads:import-figma")
  }
}
