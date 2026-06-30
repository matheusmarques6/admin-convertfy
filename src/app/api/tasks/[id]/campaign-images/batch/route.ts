/**
 * PATCH /api/tasks/[id]/campaign-images/batch
 *   { batch_id, name?, format?, instruction?, reference_image_url?, adapt_flags? }
 *
 * Atualiza os campos de um lote (sem gerar). Acesso é o da própria task de
 * campanha (requireTaskAccess work).
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
  getCampaignImageData,
  updateBatch,
} from "@/lib/services/campaign-central/campaign-image-generation.service"

export const dynamic = "force-dynamic"

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

const patchSchema = z.object({
  batch_id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  format: z.enum(["hero", "square", "story"]).optional(),
  instruction: z.string().max(4000).optional(),
  reference_image_url: z.string().url().nullable().optional(),
  adapt_flags: adaptFlagsSchema.optional(),
  text_context: textContextSchema.optional(),
})

export async function PATCH(
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

    const body = await parseAndValidate(request, patchSchema)
    await updateBatch(body.batch_id, ctx.member.orgId, {
      name: body.name,
      format: body.format,
      instruction: body.instruction,
      reference_image_url: body.reference_image_url,
      adapt_flags: body.adapt_flags,
      text_context: body.text_context,
    })

    // Devolve o lote já com os resultados atuais (o cliente preserva os seus,
    // mas isto mantém a resposta consistente com o GET).
    const data = await getCampaignImageData(source_id, ctx.member.orgId)
    const batch = data.batches.find((b) => b.id === body.batch_id)
    return successResponse(request, { batch })
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-images:batch")
  }
}
