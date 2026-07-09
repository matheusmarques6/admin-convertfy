/**
 * GET /api/tasks/[id]/campaign-cuts — mapa de cortes da campanha + título
 * PUT /api/tasks/[id]/campaign-cuts — salva rascunho (autosave do modal)
 * POST /api/tasks/[id]/campaign-cuts — { action: "approve", ...estado } valida
 *      estrito e marca aprovado. NÃO conclui a task: o client conclui via
 *      PUT /api/tasks/[id] (único dono de status — timer flush + handoff
 *      de etapa + notificações).
 *
 * O mapa é POR CAMPANHA (suggestion_id = source_id da task): qualquer task
 * da mesma campanha lê o mesmo mapa — as tasks "Subir e-mails - <idioma>"
 * usam este mesmo GET (filtrando status === "approved").
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
  approveCutMap,
  getCutMap,
  saveCutMapDraft,
} from "@/lib/services/campaign-central/campaign-cut-map.service"

export const dynamic = "force-dynamic"

const portSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(80),
    type: z.enum(["header", "hero", "texto", "produtos", "cupom", "cta", "rodape"]),
    y0: z.number().min(0).max(1),
    y1: z.number().min(0).max(1),
  })
  .strict()

const areaSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().max(80),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
  })
  .strict()

const saveSchema = z
  .object({
    image_url: z.string().url().nullable().optional(),
    image_path: z.string().max(500).nullable().optional(),
    image_filename: z.string().max(200).nullable().optional(),
    image_natural_w: z.number().int().positive().max(20000).nullable().optional(),
    image_natural_h: z.number().int().positive().max(60000).nullable().optional(),
    portas: z.array(portSchema).max(40),
    special_areas: z.array(areaSchema).max(40),
  })
  .strict()

const approveSchema = saveSchema.extend({ action: z.literal("approve") }).strict()

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

    const payload = await getCutMap(suggestionId, orgId)
    return successResponse(request, payload)
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-cuts")
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await requireTaskAccess(user.id, id, "work")
    const { suggestionId, orgId } = requireCampaignTask(ctx)

    const body = await parseAndValidate(request, saveSchema)
    const map = await saveCutMapDraft(suggestionId, orgId, body, user.id, id)
    return successResponse(request, { map })
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-cuts")
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await requireTaskAccess(user.id, id, "work")
    const { suggestionId, orgId } = requireCampaignTask(ctx)

    const body = await parseAndValidate(request, approveSchema)
    const { action: _action, ...input } = body
    const map = await approveCutMap(suggestionId, orgId, input, user.id, id)
    return successResponse(request, { map })
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-cuts")
  }
}
