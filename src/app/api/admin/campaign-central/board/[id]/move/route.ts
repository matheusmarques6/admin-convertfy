/**
 * POST /api/admin/campaign-central/board/[id]/move
 *
 * Move um card do board pra coluna adjacente. O [id] é o id do card
 * (pipeline_item_id OU "sugg:<suggestion_id>"). Body: { to: BoardColumnKey }.
 *
 * A tradução drag→ação (approve / dispatch copy / updateProductionStore bulk /
 * reopen) e os guard-rails (adjacência, gate de piloto 'good', bulk por loja)
 * vivem em board-move.service.ts, que reusa os services existentes. NÃO usa
 * /api/campaign-pipeline/[id]/move (muta `stage` global — semântica errada).
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, parseAndValidate, requireAuth, successResponse } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { boardMoveSchema } from "@/lib/validations/campaign-central"
import { moveBoardCard } from "@/lib/services/campaign-central/board-move.service"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "board:move")

    const body = await parseAndValidate(request, boardMoveSchema)

    const result = await moveBoardCard({
      orgId: ctx.orgId,
      userId: user.id,
      cardId: id,
      to: body.to,
    })

    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "board:move")
  }
}
