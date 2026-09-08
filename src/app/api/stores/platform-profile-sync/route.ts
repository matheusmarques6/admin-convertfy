/**
 * POST /api/stores/platform-profile-sync
 *
 * Puxa moeda e fuso da PLATAFORMA (hoje Omnisend, `/v5/brands/current`)
 * e grava em `client_stores`. É o botão "Conferir com a plataforma" da
 * auditoria, e o backfill das lojas que nasceram no default 'BRL'.
 *
 * Corpo (tudo opcional):
 *   { storeId?: string, storeIds?: string[], forcar?: boolean }
 *
 * `forcar` só é preciso para sobrescrever um valor que um humano
 * definiu à mão — sem ele o cadastro manual vence e a divergência é
 * devolvida no relatório em vez de sumir por cima.
 *
 * Roda em SÉRIE (uma chamada por loja): o rate limit da Omnisend é por
 * chave, e disparar 60 em paralelo faria metade voltar 429 — o backfill
 * "terminaria" reportando falha em loja que está perfeita. Por isso o
 * maxDuration alto.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  syncAllStoresPlatformProfile,
  syncStorePlatformProfile,
} from "@/lib/services/store-platform-profile.service"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)

    const body = (await request.json().catch(() => ({}))) as {
      storeId?: string
      storeIds?: string[]
      forcar?: boolean
    }
    const forcar = body.forcar === true

    if (body.storeId) {
      const loja = await syncStorePlatformProfile(body.storeId, { forcar, orgId })
      return successResponse(request, { lojas: [loja], alteradas: loja.decisao?.mudou ? 1 : 0, comErro: loja.erro ? 1 : 0 })
    }

    const resultado = await syncAllStoresPlatformProfile({
      forcar,
      orgId,
      storeIds: body.storeIds,
    })
    return successResponse(request, resultado)
  } catch (error) {
    return errorResponse(request, error, "platform-profile-sync")
  }
}
