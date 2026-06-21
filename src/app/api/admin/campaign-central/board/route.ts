/**
 * GET /api/admin/campaign-central/board
 *
 * Board unificado de 7 colunas da Central de Campanhas. Devolve os cards
 * (campanhas) com a coluna DERIVADA server-side + os designers disponíveis.
 * Cross-ciclo: inclui campanhas em produção de ciclos passados.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { getBoard } from "@/lib/services/campaign-central/board.service"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "board:list")

    const result = await getBoard(ctx.orgId)
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "board:list")
  }
}
