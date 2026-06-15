/**
 * POST /api/admin/agents/image-spike
 *
 * Ferramenta de teste (story AE-13): gera A=product_ref (com imagem) e
 * B=text2img (sem) pra mesma campanha, pra validar empiricamente se o
 * modelo de imagem recebe e usa a foto do produto. Roda no servidor.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, parseAndValidate, requireAuth, successResponse } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { runImageSpike } from "@/lib/agents/image/image-spike.service"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const schema = z.object({
  image_url: z.string().url(),
  prompt: z.string().min(3).max(2000),
  model: z.string().max(120).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "image-spike")

    const body = await parseAndValidate(request, schema)
    const result = await runImageSpike({
      imageUrl: body.image_url,
      prompt: body.prompt,
      model: body.model,
    })
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "image-spike")
  }
}
