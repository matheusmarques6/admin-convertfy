/**
 * GET  /api/conteudo/trends — assuntos em alta + o STATUS da fonte.
 * POST /api/conteudo/trends — gera uma rodada nova pela ConvertIA com busca
 *      na internet (fonte conferida contra o que a busca serviu).
 *
 * O status vai junto de propósito: o painel diz quando rodou e se a busca
 * está configurada. "TikTok Trends API conectada" seria mentira — não
 * existe essa integração aqui.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { loadPerfis } from "@/lib/services/conteudo-perfis.service"
import { gerarTrends, listarTrends, statusTrends } from "@/lib/services/conteudo-trends.service"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const trends = await listarTrends(admin, orgId)
    return successResponse(request, { trends, status: await statusTrends(admin, orgId, trends) })
  } catch (error) {
    return errorResponse(request, error, "conteudo-trends")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const { perfis } = await loadPerfis(admin, orgId)
    const perfil = perfis.find((p) => p.ativo) ?? perfis[0] ?? null
    const r = await gerarTrends(admin, orgId, user.id, {
      handle: perfil?.handle ?? null,
      nome: perfil?.nome ?? "Convertfy",
    })
    return successResponse(request, {
      trends: r.trends,
      status: await statusTrends(admin, orgId, r.trends),
      fontes_descartadas: r.fontesDescartadas,
      busca_indisponivel: r.buscaIndisponivel,
    })
  } catch (error) {
    return errorResponse(request, error, "conteudo-trends-post")
  }
}
