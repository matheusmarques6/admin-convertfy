/**
 * POST /api/conteudo/ia — IA do Estúdio de Carrosséis (uma ação por chamada).
 *
 * Ações de texto: gerar_estrutura, preencher_frame, headlines, legenda,
 * corrigir_legenda, distribuir, chat, analisar_inspiracao — saída validada
 * por schema. Ação `gerar_imagem`: reusa o pipeline de imagem da ConvertIA
 * (OpenRouter → sharp → bucket) e devolve URLs servidas pelo admin.
 * Erro do provedor traduzido (402 = sem crédito no OpenRouter).
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { withTiming } from "@/lib/api/with-timing"
import { friendlyModelErrorText } from "@/lib/ai/convertia/model-errors"
import { rewriteStorageImageSrc } from "@/lib/ai/convertia-image-url"
import { generateEmailImage, OPENROUTER_IMAGE_MODEL } from "@/lib/agents/chains/image.chain"
import { aspectInstructionForPrompt } from "@/lib/agents/image/aspect-ratio"
import { entradaImagemSchema, entradaSchema } from "@/lib/conteudo/ia/schemas"
import { executarIA, IaJsonInvalidoError } from "@/lib/conteudo/ia/service"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const log = logger.child("ConteudoIARoute")

async function handlePost(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)

    const json = await request.json().catch(() => null)

    // Imagem: fluxo próprio (não é JSON de modelo de texto).
    if (json && typeof json === "object" && (json as { acao?: string }).acao === "gerar_imagem") {
      const img = entradaImagemSchema.safeParse(json)
      if (!img.success) throw new AppError("Pedido de imagem inválido.", 400)
      const orgId = await resolveOrgId(user.id)
      const aspect = img.data.aspecto ?? "4:5"
      const n = img.data.quantidade ?? 1
      const prompt = `${img.data.prompt.trim()}\n\nEstética editorial premium, sem texto na imagem, sem marcas d'água, paleta com azuis profundos e neutros, luz natural.\n${aspectInstructionForPrompt(aspect)}`
      try {
        const urls = await Promise.all(
          Array.from({ length: n }, () =>
            generateEmailImage(prompt, `org-${orgId}`, { aspect, mode: "text2img", model: OPENROUTER_IMAGE_MODEL }).then(rewriteStorageImageSrc),
          ),
        )
        return successResponse(request, { dados: { urls } })
      } catch (e) {
        log.warn("conteudo_ia.imagem", { erro: (e as Error).message })
        throw new AppError(friendlyModelErrorText(e), 502)
      }
    }

    const parsed = entradaSchema.safeParse(json)
    if (!parsed.success) {
      throw new AppError(`Pedido inválido: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, 400)
    }

    try {
      const r = await executarIA(parsed.data, { signal: request.signal })
      return successResponse(request, { dados: r.dados, meta: { modelo: r.modelo, ms: r.ms, custo_usd: r.custoUsd, tentativas: r.tentativas } })
    } catch (e) {
      if (e instanceof IaJsonInvalidoError) {
        throw new AppError("A ConvertIA respondeu fora do formato esperado. Tente de novo ou use o modo local.", 502)
      }
      log.warn("conteudo_ia.provedor", { acao: parsed.data.acao, erro: (e as Error).message })
      throw new AppError(friendlyModelErrorText(e), 502)
    }
  } catch (error) {
    return errorResponse(request, error, "conteudo-ia")
  }
}

export const POST = withTiming("conteudo-ia", handlePost, { slowMs: 60_000 })
