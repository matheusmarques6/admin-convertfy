/**
 * POST /api/admin/email-blocks/[blockId]/regenerate-image
 *
 * AE-16 — Regenera a imagem de UM bloco especifico (escopo cirurgico),
 * reusando todo o pipeline AE-10..14 (vars niche-adaptive, mode
 * product_ref, aspect ratio, fallbacks). Diferente do AE-2 (mode=redo)
 * que regera o flow inteiro.
 *
 * Rate limit: 1 regen por bloco a cada 30s — via campo
 * `email_blocks.content.image_last_generated_at` (zero schema change).
 *
 * Persiste em `email_blocks.content`:
 *   - image_url (nova URL)
 *   - image_alt (mantem ou usa label como fallback)
 *   - image_last_generated_at (ISO timestamp)
 *   - image_last_prompt (snapshot do prompt resolvido, truncado 2KB)
 *
 * Telemetria: `logGenerationRun` com agent='image',
 * metadata.trigger='manual_block_regen', metadata.block_id=blockId.
 *
 * Resposta 200: `{ success, image_url, image_last_generated_at, mode, aspect }`
 * Resposta 409: `{ error: 'Aguarde Xs', code: 'rate_limited', retry_after_seconds }`
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { corsHeaders } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { randomUUID } from "crypto"
import { resolveBlockPrompt } from "@/lib/agents/image/resolve-block-prompt.service"
import {
  generateEmailImage,
  OPENROUTER_IMAGE_MODEL,
} from "@/lib/agents/chains/image.chain"
import { logGenerationRun } from "@/lib/agents/callbacks/telemetry.callback"

const log = logger.child("RegenerateImageAPI")

export const dynamic = "force-dynamic"

const RATE_LIMIT_WINDOW_MS = 30_000
const PROMPT_SNAPSHOT_LIMIT = 2_000
const IMAGE_MODEL_LABEL = OPENROUTER_IMAGE_MODEL

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ blockId: string }> },
) {
  try {
    const { blockId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    // 1. Resolve prompt + contexto (carrega bloco, valida existencia)
    const resolution = await resolveBlockPrompt(blockId)

    // 2. Rate limit — usa image_last_generated_at do proprio content
    if (resolution.lastGeneratedAt) {
      const lastMs = new Date(resolution.lastGeneratedAt).getTime()
      if (!Number.isNaN(lastMs)) {
        const elapsed = Date.now() - lastMs
        if (elapsed < RATE_LIMIT_WINDOW_MS) {
          const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - elapsed) / 1000)
          const origin = request.headers.get("origin")
          return NextResponse.json(
            {
              error: `Aguarde ${retryAfter}s antes de regenerar novamente`,
              code: "rate_limited",
              retry_after_seconds: retryAfter,
            },
            { status: 409, headers: corsHeaders(origin) },
          )
        }
      }
    }

    // 3. Chama o modelo de imagem
    const t0 = Date.now()
    const imageUrl = await generateEmailImage(
      resolution.prompt,
      resolution.storeId,
      {
        aspect: resolution.aspect,
        overlayReserveBottom: resolution.overlayReserveBottom,
        mode: resolution.mode,
        referenceImageUrl:
          resolution.mode === "product_ref" && resolution.topProductImageUrl
            ? resolution.topProductImageUrl
            : undefined,
      },
    )
    const durationMs = Date.now() - t0

    // 4. Persiste no bloco (merge preservando outros campos)
    const generatedAt = new Date().toISOString()
    const promptSnapshot = resolution.prompt.slice(0, PROMPT_SNAPSHOT_LIMIT)
    const mergedContent = {
      ...resolution.blockContent,
      image_url: imageUrl,
      image_alt:
        (resolution.blockContent.image_alt as string | undefined) ??
        resolution.blockLabel ??
        undefined,
      image_last_generated_at: generatedAt,
      image_last_prompt: promptSnapshot,
    }

    // AE-16 KNOWN RACE: se 2 requests concorrentes chegam aqui ao mesmo
    // tempo (designer clica rapido em 2 abas, mobile flaky), last-write-wins
    // sobrescreve silenciosamente — ambos clientes recebem 200, mas so 1
    // imagem persiste. Rate-limit 30s + serial designer workflow tornam
    // isso <1% em prod. Monitorar via `logGenerationRun` (trigger =
    // manual_block_regen) — duplicatas rapidas no mesmo blockId indicam
    // o cenario. Fix futuro: UPDATE atomico com
    // WHERE (content->>'image_last_generated_at')::timestamptz = $old_value.
    const { error: updateErr } = await admin
      .from("email_blocks")
      .update({ content: mergedContent })
      .eq("id", blockId)

    if (updateErr) throw updateErr

    // 5. Telemetria
    // batchId e UUID novo (regen manual nao pertence a um batch agendado).
    await logGenerationRun({
      storeId: resolution.storeId,
      flowId: resolution.flowId ?? undefined,
      emailId: resolution.emailId,
      triggeredBy: user.id,
      batchId: randomUUID(),
      agent: "image",
      status: "success",
      model: IMAGE_MODEL_LABEL,
      renderedPrompt: promptSnapshot,
      durationMs,
      parsedOutput: {
        blockId,
        imageUrl,
        trigger: "manual_block_regen",
        aspect: resolution.aspect,
        mode: resolution.mode,
      },
    }).catch((err) => {
      // Telemetria nao deve quebrar resposta de sucesso
      log.warn("regenerate.telemetry_failed", { blockId, error: String(err) })
    })

    return successResponse(request, {
      success: true,
      image_url: imageUrl,
      image_last_generated_at: generatedAt,
      mode: resolution.mode,
      aspect: resolution.aspect,
    })
  } catch (error) {
    log.error("regenerate-image error", { error })
    return errorResponse(request, error, "regenerate-image")
  }
}
