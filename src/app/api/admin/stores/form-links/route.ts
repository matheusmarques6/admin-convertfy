/**
 * GET /api/admin/stores/form-links
 *
 * Links de formulario de todas as lojas ativas da org, em uma passada.
 * Alimenta a lista de Lojas e o aviso geral de pendencias — por isso e
 * agregado aqui em vez de um GET por loja (evita N+1 na render).
 *
 * `?pending=1` devolve so o que precisa de acao: sem link, link vencido
 * ou formulario ainda nao respondido.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import {
  listStoreFormLinks,
  type StoreFormLinkSummary,
} from "@/lib/services/onboarding-form-link.service"

const log = logger.child("StoreFormLinks")

export const dynamic = "force-dynamic"

/** Precisa de acao: nao da pra enviar o link, ou o cliente nao respondeu. */
function isPending(link: StoreFormLinkSummary): boolean {
  return link.status !== "active" || link.awaiting_response
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)

    const all = await listStoreFormLinks(orgId)
    const pendingOnly = request.nextUrl.searchParams.get("pending") === "1"
    const links = pendingOnly ? all.filter(isPending) : all

    return successResponse(request, {
      links,
      total: all.length,
      pending_count: all.filter(isPending).length,
    })
  } catch (error) {
    log.error("error", error)
    return errorResponse(request, error, "store-form-links")
  }
}
