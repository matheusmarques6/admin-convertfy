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
import {
  resolveBlockPrompt,
  type BlockPromptResolution,
} from "@/lib/agents/image/resolve-block-prompt.service"
import type { InputSummaryItem } from "@/lib/agents/shared/prompt-provenance"
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

/** A Entrada estruturada da regeneração manual — o que entrou nesta imagem. */
function regenInputSummary(r: BlockPromptResolution): InputSummaryItem[] {
  return [
    {
      rotulo: "Bloco",
      cls: "upstream",
      valor: `${r.blockType}${r.blockLabel ? ` — ${r.blockLabel}` : ""}`,
    },
    { rotulo: "Disparo", cls: "sistema", valor: "regeneração manual pelo workspace" },
    {
      rotulo: "Modo",
      cls: "sistema",
      valor: r.mode === "product_ref" ? "foto real do produto anexada" : "text2img",
    },
    { rotulo: "Proporção", cls: "sistema", valor: r.aspect },
    {
      rotulo: "Produto de referência",
      cls: "loja",
      valor: r.topProductImageUrl ?? "(sem foto de produto)",
    },
  ]
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ blockId: string }> },
) {
  // Fora do try: o catch precisa deles para registrar a FALHA da geração —
  // até aqui um erro do modelo não deixava rastro nenhum na telemetria.
  let resolution: BlockPromptResolution | null = null
  let blockIdForLog = ""
  const tStart = Date.now()
  try {
    const { blockId } = await context.params
    blockIdForLog = blockId
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    // Slot alvo (geração por campo). Um bloco de produtos tem 8 imagens:
    // sem isto, "regenerar a imagem do bloco" não diz qual.
    const body = await request.json().catch(() => ({}))
    const fieldKey =
      typeof (body as { field_key?: unknown })?.field_key === "string"
        ? ((body as { field_key: string }).field_key.trim() || null)
        : null

    // 1. Resolve prompt + contexto (carrega bloco, valida existencia)
    resolution = await resolveBlockPrompt(blockId, fieldKey)

    // Rate limit POR SLOT quando há slot: o carimbo do bloco bloquearia as
    // outras 7 fotos por 30s só porque uma foi regerada.
    const slotStamp = fieldKey
      ? ((
          resolution.blockContent.images as
            | Record<string, { generated_at?: string }>
            | undefined
        )?.[fieldKey]?.generated_at ?? null)
      : resolution.lastGeneratedAt

    // 2. Rate limit — usa image_last_generated_at do proprio content
    if (slotStamp) {
      const lastMs = new Date(slotStamp).getTime()
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
    const altText =
      (resolution.blockContent.image_alt as string | undefined) ??
      resolution.blockLabel ??
      undefined
    const existingImages =
      (resolution.blockContent.images as
        | Record<string, { url: string; alt?: string; generated_at?: string }>
        | undefined) ?? {}
    // Com slot, grava NO SLOT e só espelha em `image_url` quando ele é a
    // imagem principal do bloco — sobrescrever o espelho com uma miniatura
    // trocaria a foto do preview do designer.
    const images = fieldKey
      ? {
          ...existingImages,
          [fieldKey]: {
            url: imageUrl,
            alt: altText ?? "",
            generated_at: generatedAt,
          },
        }
      : existingImages
    const isMainSlot =
      !fieldKey || Object.keys(existingImages)[0] === fieldKey
    const mergedContent = {
      ...resolution.blockContent,
      ...(fieldKey ? { images } : {}),
      ...(isMainSlot ? { image_url: imageUrl, image_alt: altText } : {}),
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
      // O prompt INTEIRO na run. O snapshot de 2.000 chars continua indo
      // para `email_blocks.image_last_prompt` (outro consumidor, com outro
      // limite) — mas a telemetria não tem por que guardar meio prompt.
      renderedPrompt: resolution.prompt,
      promptSegments: resolution.promptSegments,
      inputSummary: regenInputSummary(resolution),
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
    // A falha vira run: sem isto, uma regeneração que quebra no modelo
    // some — o custo aparece no provedor e não no relatório.
    if (resolution) {
      await logGenerationRun({
        storeId: resolution.storeId,
        flowId: resolution.flowId ?? undefined,
        emailId: resolution.emailId,
        batchId: randomUUID(),
        agent: "image",
        status: "error",
        model: IMAGE_MODEL_LABEL,
        errorMessage:
          error instanceof Error ? error.message.slice(0, 500) : String(error),
        renderedPrompt: resolution.prompt,
        promptSegments: resolution.promptSegments,
        inputSummary: regenInputSummary(resolution),
        durationMs: Date.now() - tStart,
        parsedOutput: { blockId: blockIdForLog, trigger: "manual_block_regen" },
      }).catch(() => {})
    }
    return errorResponse(request, error, "regenerate-image")
  }
}
