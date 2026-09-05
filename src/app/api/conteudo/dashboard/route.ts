/**
 * GET /api/conteudo/dashboard?perfil=&start=&end= — Dashboard Social.
 *
 * Lê do banco (mídias sincronizadas, CRM, agenda, histórico de seguidores)
 * e, se o último sync do canal passou de 30 min, sincroniza inline com
 * orçamento curto. Visitas ao perfil vêm direto da Graph API (total do
 * intervalo). Fonte ausente → `null` + item em `avisos`, nunca número inventado.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { withTiming } from "@/lib/api/with-timing"
import { carregarDashboard } from "@/lib/services/conteudo-dashboard.service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

async function handleGet(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const q = request.nextUrl.searchParams
    const data = await carregarDashboard(admin, orgId, {
      perfil: q.get("perfil"),
      start: q.get("start"),
      end: q.get("end"),
      syncBudgetMs: q.get("sync") === "0" ? 0 : 18_000,
    })
    return successResponse(request, { dashboard: data })
  } catch (error) {
    return errorResponse(request, error, "conteudo-dashboard")
  }
}

export const GET = withTiming("conteudo-dashboard", handleGet, { slowMs: 15_000 })
