/**
 * POST /api/admin/stores/[id]/regenerate-objections
 *
 * Roda o CATALOGADOR (set/2026 — plano das objeções): produz o catálogo de
 * argumento da loja em `client_stores.objection_catalog` (objeções tipadas
 * por risco/aliviador com lastro, veículos de argumento, medos de categoria,
 * incentivo) e grava a PROJEÇÃO [{objection, treatment}] em
 * `icp_objections` — a resposta continua devolvendo `objections` para a UI
 * atual atualizar sem reload, e passa a devolver `catalog` inteiro.
 *
 * Era o Haiku com 5 objeções fixas sem tipagem; agora é `runCatalogador`
 * (sonnet-4.6 via OpenRouter, validação por código, run `catalogador` no
 * Estúdio). Requer contexto de pesquisa/ICP — senão 400.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { runCatalogador } from "@/lib/agents/objecoes/catalogador.service"
import { logger } from "@/lib/logger"

const log = logger.child("RegenerateObjections")

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)

    const r = await runCatalogador({ storeId, triggeredBy: user.id })
    if (r.status === "sem_contexto") {
      throw new AppError(
        "Defina a Pesquisa & Diagnóstico (marca ou persona) antes de catalogar as objeções.",
        400,
      )
    }
    if (r.status === "falhou" || !r.catalogo) {
      throw new AppError(
        `O Catalogador não devolveu um catálogo válido: ${(r.erros ?? []).slice(0, 3).join("; ") || "tente novamente"}`,
        502,
      )
    }

    log.info("[RegenerateObjections] success", {
      store_id: storeId,
      count: r.objections.length,
      run_id: r.runId,
    })
    return successResponse(request, { objections: r.objections, catalog: r.catalogo, run_id: r.runId })
  } catch (error) {
    log.error("RegenerateObjections error:", error)
    return errorResponse(request, error, "regenerate-objections")
  }
}
