/**
 * GET  /api/tasks/[id]/campaign-uploads            — payload completo do modal
 * GET  /api/tasks/[id]/campaign-uploads?summary=1  — resumo pro badge do drawer
 * PATCH /api/tasks/[id]/campaign-uploads           — status/downloaded_ports da loja
 *
 * Tela 2 "Subir Campanha por Loja" (tasks impl_subir_ptbr/en/outras). O
 * progresso é POR CAMPANHA×LOJA (campaign_store_emails) — as 3 tasks de
 * idioma compartilham. NÃO conclui a task: o client conclui via
 * PUT /api/tasks/[id] (único dono de status).
 *
 * downloaded_ports no PATCH faz UNIÃO server-side — o client manda só os
 * ids novos e dois downloads concorrentes não se clobberam.
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
import {
  getCampaignUploadPayload,
  getCampaignUploadSummary,
  patchStoreEmail,
} from "@/lib/services/campaign-central/campaign-store-email.service"

export const dynamic = "force-dynamic"

const overridePortSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(80),
    type: z.enum(["header", "hero", "texto", "produtos", "cupom", "cta", "rodape"]),
    y0: z.number().min(0).max(1),
    y1: z.number().min(0).max(1),
  })
  .strict()

const patchSchema = z
  .object({
    store_id: z.string().uuid(),
    status: z.enum(["pendente", "andamento", "concluida"]).optional(),
    add_downloaded_ports: z.array(z.string().min(1).max(64)).max(80).optional(),
    // Ajuste fino por loja (frações da imagem da loja); null restaura o
    // automático. Validação de contiguidade/ids no service.
    cut_ports_override: z.array(overridePortSchema).max(40).nullable().optional(),
  })
  .strict()

function requireCampaignTask(ctx: Awaited<ReturnType<typeof requireTaskAccess>>): {
  suggestionId: string
  orgId: string
} {
  const { source_type, source_id } = ctx.task
  if (source_type !== "campaign_suggestion" || !source_id) {
    throw new AppError("Task não é de campanha", 400)
  }
  return { suggestionId: source_id, orgId: ctx.member.orgId }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await requireTaskAccess(user.id, id, "read")
    const { suggestionId, orgId } = requireCampaignTask(ctx)

    if (request.nextUrl.searchParams.get("summary") === "1") {
      const summary = await getCampaignUploadSummary(suggestionId, orgId)
      return successResponse(request, summary)
    }

    const payload = await getCampaignUploadPayload(suggestionId, orgId)
    return successResponse(request, payload)
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-uploads")
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await requireTaskAccess(user.id, id, "work")
    const { suggestionId, orgId } = requireCampaignTask(ctx)

    const body = await parseAndValidate(request, patchSchema)
    const email = await patchStoreEmail(suggestionId, orgId, body)
    return successResponse(request, { email })
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-uploads")
  }
}
