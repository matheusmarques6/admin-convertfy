/**
 * POST /api/conteudo/dashboard/sync — força a sincronização dos canais
 * Instagram da org (mídias + insights + série diária + perfil) e devolve o
 * resultado por canal. É o "Atualizar dados" do dashboard.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { ensureChannelsSynced } from "@/lib/services/conteudo-instagram-sync.service"
import { loadPerfis } from "@/lib/services/conteudo-perfis.service"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const { channels, perfis } = await loadPerfis(admin, orgId, { refresh: true })
    const resultados = await ensureChannelsSynced(admin, channels, { force: true, budgetMs: 90_000 })
    return successResponse(request, { perfis, resultados })
  } catch (error) {
    return errorResponse(request, error, "conteudo-dashboard-sync")
  }
}
