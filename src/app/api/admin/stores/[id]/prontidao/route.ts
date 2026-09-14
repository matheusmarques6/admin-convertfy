/**
 * GET /api/admin/stores/[id]/prontidao
 *
 * Prontidão da loja para geração (B1): bloqueios e avisos — a MESMA
 * avaliação que o gate do enfileiramento e das rotas manuais aplicam.
 * O card "Prontidão para geração" do workspace de produção lê daqui.
 *
 * Query: `flow_type` / `email_number` (toque de referência para o aviso de
 * cupom sem tradução; default welcome 1).
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { carregarProntidao, resolveGateMode } from "@/lib/stores/prontidao.service"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const url = new URL(request.url)
    const flowType = url.searchParams.get("flow_type") ?? undefined
    const emailNumberRaw = Number(url.searchParams.get("email_number"))
    const emailNumber = Number.isInteger(emailNumberRaw) && emailNumberRaw > 0 ? emailNumberRaw : undefined
    const [prontidao, mode] = await Promise.all([
      carregarProntidao(storeId, { flowType, emailNumber }),
      resolveGateMode(storeId),
    ])
    return successResponse(request, { ...prontidao, gate_mode: mode })
  } catch (error) {
    return errorResponse(request, error, "store-prontidao")
  }
}
