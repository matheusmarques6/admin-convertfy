/**
 * POST /api/admin/email-blocks/[blockId]/resolve-prompt
 *
 * AE-16 — Renderiza o prompt mestre da imagem do bloco com TODAS as vars
 * ja substituidas (incluindo INSTRUCAO_ADICIONAL do bloco, appendix de
 * aspect ratio, fidelidade ao produto anexado e descricao de
 * produto-ref-fallback se aplicavel). NAO dispara OpenRouter.
 *
 * Faz UM HEAD na foto do produto (<=5s, `isUsableProductImage`) — o mesmo
 * que o pipeline faz antes de anexá-la. Sem ele o preview mostraria
 * `product_ref` para uma foto morta e o operador receberia outra coisa:
 * o custo é a honestidade do preview.
 *
 * Usado por designers/devs no `PromptPreviewModal` pra auditar
 * exatamente o que sera enviado ao modelo antes de regerar.
 *
 * Resposta 200:
 * ```ts
 * {
 *   prompt: string,
 *   mode: 'product_ref' | 'text2img',
 *   mode_source: string,      // por que esse modo (rebaixamento e motivo)
 *   aspect: '4:5' | '3:5' | '4:3' | '1:1' | '3:4',
 *   has_reference: boolean,    // true se existe topProductImageUrl
 *   vars_used: Record<string, string>  // UPPERCASE only, truncado 200ch
 * }
 * ```
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { resolveBlockPrompt } from "@/lib/agents/image/resolve-block-prompt.service"

const log = logger.child("ResolvePromptAPI")

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ blockId: string }> },
) {
  try {
    const { blockId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)

    const resolution = await resolveBlockPrompt(blockId)

    return successResponse(request, {
      prompt: resolution.prompt,
      mode: resolution.mode,
      mode_source: resolution.modeSource,
      aspect: resolution.aspect,
      has_reference: !!resolution.topProductImageUrl,
      vars_used: resolution.vars,
    })
  } catch (error) {
    log.error("resolve-prompt error", { error })
    return errorResponse(request, error, "resolve-prompt")
  }
}
