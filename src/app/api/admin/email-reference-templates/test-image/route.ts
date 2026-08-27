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
import {
  generateEmailImage,
  renderImagePrompt,
  OPENROUTER_IMAGE_MODEL,
} from "@/lib/agents/chains/image.chain"
import { logGenerationRun } from "@/lib/agents/callbacks/telemetry.callback"
import {
  buildSegmentedPrompt,
  type InputSummaryItem,
} from "@/lib/agents/shared/prompt-provenance"
import { IMAGE_VAR_ORIGINS } from "@/lib/agents/image/prompt-vars-builder"
import { randomUUID } from "crypto"
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
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const { image_prompt, store_id } = bodySchema.parse(body)

    const [storeRes, brandRes, briefingRes] = await Promise.all([
      admin.from("client_stores").select("*").eq("id", store_id).single(),
      admin
        .from("store_brand_identity")
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
    // O prompt de teste é digitado na aba Referências e usa o dialeto de
    // chave única (`{VAR}`), como o template in-code.
    const seg = buildSegmentedPrompt(image_prompt, vars, IMAGE_VAR_ORIGINS, {
      parte: "user",
      dialeto: "single",
    })
    const promptSegments =
      seg.segments && seg.prompt === rendered ? seg.segments : null
    const inputSummary: InputSummaryItem[] = [
      { rotulo: "Origem", cls: "sistema", valor: "teste de prompt na aba Referências" },
      {
        rotulo: "Prompt digitado",
        cls: "agente",
        valor: `${image_prompt.length.toLocaleString("pt-BR")} chars`,
      },
      {
        rotulo: "Contexto da loja",
        cls: "loja",
        valor: `${(storeRes.data as { store_name?: string }).store_name ?? store_id}${brand ? " · identidade visual" : ""}`,
      },
      {
        rotulo: "Produtos",
        cls: "loja",
        valor: `${topProducts.length} produto(s) no contexto`,
      },
    ]
    log.info("test-image.start", { store_id, prompt_length: rendered.length })

    const t0 = Date.now()
    try {
      const url = await generateEmailImage(rendered, store_id)
      log.info("test-image.done", { store_id, url })

      // Esta rota gera imagem PAGA. Até ago/2026 não gravava run nenhuma —
      // o custo aparecia no provedor e não no relatório por agente.
      await logGenerationRun({
        storeId: store_id,
        batchId: randomUUID(),
        triggeredBy: user.id,
        agent: "image",
        status: "success",
        model: OPENROUTER_IMAGE_MODEL,
        renderedPrompt: rendered,
        promptSegments,
        inputSummary,
        inputVars: vars,
        durationMs: Date.now() - t0,
        parsedOutput: { imageUrl: url, trigger: "reference_template_test" },
      }).catch(() => {})

      return successResponse(request, {
        url,
        rendered_prompt: rendered,
        vars_used: vars,
      })
    } catch (err) {
      await logGenerationRun({
        storeId: store_id,
        batchId: randomUUID(),
        triggeredBy: user.id,
        agent: "image",
        status: "error",
        model: OPENROUTER_IMAGE_MODEL,
        errorMessage:
          err instanceof Error ? err.message.slice(0, 500) : String(err),
        renderedPrompt: rendered,
        promptSegments,
        inputSummary,
        durationMs: Date.now() - t0,
        parsedOutput: { trigger: "reference_template_test" },
      }).catch(() => {})
      throw err
    }
  } catch (error) {
    log.error("test-image.error", error)
    return errorResponse(request, error, "test-image")
  }
}
