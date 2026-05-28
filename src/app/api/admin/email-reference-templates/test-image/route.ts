/**
 * POST /api/admin/email-reference-templates/test-image
 *
 * Renderiza um prompt customizado com o contexto de uma loja real
 * e gera a imagem via OpenRouter GPT Image 2.
 *
 * Body: { image_prompt: string, store_id: string }
 *
 * Custo: ~$0.04 por chamada. Tempo: ~3min.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { buildImagePromptVars } from "@/lib/agents/email-generation.service"
import { generateEmailImage, renderImagePrompt } from "@/lib/agents/chains/image.chain"
import type {
  StoreBrandIdentity,
  StoreBriefing,
  TopProduct,
} from "@/types/email-workspace"

const log = logger.child("EmailReferenceTestImage")

export const dynamic = "force-dynamic"
export const maxDuration = 300

const bodySchema = z.object({
  image_prompt: z.string().min(1),
  store_id: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const { image_prompt, store_id } = bodySchema.parse(body)

    const [storeRes, brandRes, briefingRes] = await Promise.all([
      admin.from("client_stores").select("*").eq("id", store_id).single(),
      admin
        .from("store_brand_identities")
        .select("*")
        .eq("store_id", store_id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("store_briefings")
        .select("*")
        .eq("store_id", store_id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (storeRes.error || !storeRes.data) {
      return errorResponse(
        request,
        new Error("Loja não encontrada"),
        "test-image-store-not-found",
      )
    }

    const brand = (brandRes.data as StoreBrandIdentity | null) ?? null
    const briefing = (briefingRes.data as StoreBriefing | null) ?? null
    const topProducts = (brand?.top_products as TopProduct[] | undefined) ?? []

    const vars = buildImagePromptVars({
      brand,
      briefing,
      topProducts,
      storeRaw: storeRes.data as Record<string, unknown>,
      blockPurpose: "Banner de teste — visualização do prompt customizado",
    })

    const rendered = renderImagePrompt(image_prompt, vars)
    log.info("test-image.start", { store_id, prompt_length: rendered.length })

    const url = await generateEmailImage(rendered, store_id)

    log.info("test-image.done", { store_id, url })

    return successResponse(request, {
      url,
      rendered_prompt: rendered,
      vars_used: vars,
    })
  } catch (error) {
    log.error("test-image.error", error)
    return errorResponse(request, error, "test-image")
  }
}
