/**
 * GET  /api/tasks/[id]/campaign-images — lotes + lojas-alvo (com brand) + resultados
 * POST /api/tasks/[id]/campaign-images — { action: 'create_batch' | 'generate_batch' }
 *
 * Alimenta o painel "Gerar imagens" dentro da task de PRODUÇÃO de campanha.
 * Acesso é o da PRÓPRIA task (requireTaskAccess). Só vale pra task de campanha
 * (source_type='campaign_suggestion').
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
  createBatch,
  generateBatch,
  getCampaignImageData,
} from "@/lib/services/campaign-central/campaign-image-generation.service"

export const dynamic = "force-dynamic"
// Geração roda inline com pool de concorrência — pode levar > 60s por lote.
export const maxDuration = 300

const adaptFlagsSchema = z
  .object({
    idioma: z.boolean().optional(),
    cores: z.boolean().optional(),
    logo: z.boolean().optional(),
    catalogo: z.boolean().optional(),
    tom: z.boolean().optional(),
  })
  .strict()

// Contexto textual opt-in: cada campo é { include, value? }. value opcional
// sobrescreve o dado real da loja. .strict() rejeita chaves desconhecidas.
const textFieldSchema = z
  .object({ include: z.boolean(), value: z.string().max(500).optional() })
  .strict()
const textContextSchema = z
  .object({
    nicho: textFieldSchema.optional(),
    publico: textFieldSchema.optional(),
    tom: textFieldSchema.optional(),
    moeda: textFieldSchema.optional(),
    headline: textFieldSchema.optional(),
  })
  .strict()

const createBatchSchema = z.object({
  action: z.literal("create_batch"),
  name: z.string().min(1).max(120),
  format: z.enum(["hero", "square", "story"]),
  instruction: z.string().max(4000).default(""),
  reference_image_url: z.string().url().nullable().optional(),
  adapt_flags: adaptFlagsSchema.optional(),
  text_context: textContextSchema.optional(),
})

const generateBatchSchema = z.object({
  action: z.literal("generate_batch"),
  batch_id: z.string().uuid(),
})

const postSchema = z.discriminatedUnion("action", [
  createBatchSchema,
  generateBatchSchema,
])

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

    const payload = await getCampaignImageData(suggestionId, orgId)
    return successResponse(request, payload)
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-images")
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

    const body = await parseAndValidate(request, postSchema)

    if (body.action === "create_batch") {
      const batch = await createBatch(
        suggestionId,
        orgId,
        {
          name: body.name,
          format: body.format,
          instruction: body.instruction,
          reference_image_url: body.reference_image_url ?? null,
          adapt_flags: body.adapt_flags,
          text_context: body.text_context,
          task_id: id,
        },
        user.id,
      )
      return successResponse(request, { batch }, { status: 201 })
    }

    // generate_batch
    const batch = await generateBatch(body.batch_id, orgId)
    return successResponse(request, { batch })
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-images")
  }
}
