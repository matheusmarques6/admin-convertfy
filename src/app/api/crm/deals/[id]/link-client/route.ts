/**
 * POST /api/crm/deals/[id]/link-client
 *
 * Converte o LEAD do negócio em cliente (ou vincula um existente com o
 * mesmo email) — botão "Vincular cliente" do painel de vendas do funil.
 * Vendas novas já passam por isso automaticamente ao virar won; esta
 * rota cobre as antigas.
 */

import { NextRequest } from "next/server"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { ensureClientForDeal } from "@/lib/services/crm-client-link.service"

const log = logger.child("CrmDealLinkClient")

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    uuid().parse(id)
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const result = await ensureClientForDeal(admin, id)

    if (result.reason === "no_lead") {
      throw new AppError(
        "Este negócio não tem lead para converter — vincule um cliente manualmente pela ficha.",
        422,
        "validation-error",
      )
    }
    if (!result.client_id) {
      throw new AppError("Não foi possível vincular o cliente.", 500)
    }

    return successResponse(request, result)
  } catch (error) {
    log.error("Link client error:", error)
    return errorResponse(request, error, "crm-deal-link-client")
  }
}
