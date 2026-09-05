/**
 * POST /api/conteudo/ia — IA do Estúdio de Carrosséis (uma ação por chamada).
 *
 * Ações: gerar_estrutura, preencher_frame, headlines, legenda,
 * corrigir_legenda, distribuir, chat, analisar_inspiracao. Saída validada
 * por schema; erro do provedor traduzido (402 = sem crédito no OpenRouter,
 * não "troque o modelo").
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { withTiming } from "@/lib/api/with-timing"
import { friendlyModelErrorText } from "@/lib/ai/convertia/model-errors"
import { entradaSchema } from "@/lib/conteudo/ia/schemas"
import { executarIA, IaJsonInvalidoError } from "@/lib/conteudo/ia/service"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const log = logger.child("ConteudoIARoute")

export async function POST(request: NextRequest) {
  return withTiming("conteudo-ia", async () => {
    try {
      const sb = await createClient()
      await requireAuth(sb)

      const json = await request.json().catch(() => null)
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
  }, { slowMs: 60_000 })
}
