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
 *
 * GET devolve a ÚLTIMA run `catalogador` da loja (id, status, data): é o
 * link "ver run" do painel "Catálogo de argumento" na aba Pesquisa — a run
 * é de LOJA (sem email) e não entra na listagem por email do Estúdio.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { runCatalogador } from "@/lib/agents/objecoes/catalogador.service"
import { comOrcamentoDeFase1 } from "@/lib/agents/fase1-orcamento"
import { logger } from "@/lib/logger"

const log = logger.child("RegenerateObjections")

export const dynamic = "force-dynamic"

/**
 * O Catalogador é UMA chamada ao modelo com teto alto (12.288 tokens de
 * saída em 11/09) e até uma segunda quando o validador reprova. A 90 tok/s
 * medidos, cada uma pede ~150s: os 120s que esta rota declarava não cobriam
 * nem a primeira, e o relógio do invoke (240s) era o DOBRO do orçamento da
 * função inteira — nenhuma das duas pontas sabia da outra.
 *
 * O desfecho era sempre o mesmo: o gateway matava a função no meio, o
 * `finishGenerationRun` nunca rodava e a run ficava `running` órfã até o
 * watchdog. Na tela, "Erro de rede" depois de dois minutos de espera; três
 * tentativas seguidas na Innova Bay (11/09, 03:23/03:26/03:28), todas
 * cobradas do provedor e todas perdidas.
 */
export const maxDuration = 300

/**
 * O que sobra da função para gravar o catálogo, fechar a run e responder.
 * A janela é o resto — é dela que sai o relógio de cada chamada ao modelo
 * (`relogioDaChamada`), então nenhuma pode prometer tempo que a request
 * não tem.
 */
const RESERVA_MS = 25_000

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)

    const r = await comOrcamentoDeFase1(maxDuration * 1000 - RESERVA_MS, () =>
      runCatalogador({ storeId, triggeredBy: user.id }),
    )
    if (r.status === "sem_contexto") {
      throw new AppError(
        "Defina a Pesquisa & Diagnóstico (marca ou persona) antes de catalogar as objeções.",
        400,
      )
    }
    if (r.status === "falhou" || !r.catalogo) {
      // `r.motivo` já vem traduzido pelo serviço (`catalogador-erros`): o cru
      // deste caminho é a palavra "timeout", que na tela não diz o que houve
      // nem o que fazer.
      throw new AppError(
        r.motivo ?? `O Catalogador não devolveu um catálogo válido: ${(r.erros ?? []).slice(0, 3).join("; ") || "tente novamente"}`,
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("email_generation_runs")
      .select("id, status, created_at, model")
      .eq("store_id", storeId)
      .eq("agent", "catalogador")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error

    return successResponse(request, {
      run: data
        ? {
            id: (data as { id: string }).id,
            status: (data as { status: string }).status,
            created_at: (data as { created_at: string }).created_at,
            model: (data as { model: string | null }).model,
          }
        : null,
    })
  } catch (error) {
    log.error("RegenerateObjections GET error:", error)
    return errorResponse(request, error, "regenerate-objections-last-run")
  }
}
