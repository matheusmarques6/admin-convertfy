/**
 * GET /api/conteudo/raio-x?perfil=&start=&end= — Raio-X do perfil.
 *
 * Nota, diagnóstico e desempenho por formato, tudo derivado do MESMO
 * carregador do Dashboard Social. A rota não faz conta nenhuma: quem decide
 * é `lib/conteudo/raio-x` (puro, testado), e é por isso que a tela e o
 * teste medem a mesma régua.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { withTiming } from "@/lib/api/with-timing"
import { carregarRaioX } from "@/lib/services/conteudo-raio-x.service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

async function handleGet(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const q = request.nextUrl.searchParams
    const raioX = await carregarRaioX(admin, orgId, {
      perfil: q.get("perfil"),
      start: q.get("start"),
      end: q.get("end"),
      // O Raio-X é leitura: o sync inline fica com o dashboard, que é a
      // tela que o usuário abre para ver número fresco. Sincronizar aqui
      // faria a varredura demorar sem mudar o diagnóstico.
      syncBudgetMs: 0,
    })
    return successResponse(request, { raioX })
  } catch (error) {
    return errorResponse(request, error, "conteudo-raio-x")
  }
}

export const GET = withTiming("conteudo-raio-x", handleGet, { slowMs: 12_000 })
