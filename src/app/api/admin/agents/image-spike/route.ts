/**
 * POST /api/admin/agents/image-spike
 *
 * Ferramenta de teste (story AE-13): gera UMA imagem por chamada, no modo
 * pedido (product_ref = com a foto do produto; text2img = só texto). O
 * cliente dispara A e B em requisições separadas, uma de cada vez — cada
 * geração é cobrada. Roda no servidor (onde existe OPENROUTER_API_KEY).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, parseAndValidate, requireAuth, successResponse } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { runImageGeneration } from "@/lib/agents/image/image-spike.service"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const schema = z
  .object({
    mode: z.enum(["product_ref", "text2img"]),
    image_url: z.string().url().optional(),
    prompt: z.string().min(3).max(2000),
    model: z.string().max(120).optional(),
    max_tokens: z.number().int().min(256).max(65536).optional(),
  })
  .refine((d) => d.mode !== "product_ref" || !!d.image_url, {
    message: "image_url é obrigatório quando mode=product_ref",
    path: ["image_url"],
  })

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "image-spike")

    const body = await parseAndValidate(request, schema)
    const result = await runImageGeneration({
      mode: body.mode,
      imageUrl: body.image_url,
      prompt: body.prompt,
      model: body.model,
      maxTokens: body.max_tokens,
    })
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "image-spike")
  }
}
