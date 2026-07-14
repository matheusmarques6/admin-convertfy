/**
 * GET /api/crm/cs-painel/nrr
 *
 * NRR (Net Revenue Retention) mes a mes:
 *   NRR = MRR_atual(coorte) / MRR_mes_anterior(coorte) x 100
 *   coorte = clientes ativos no fim do mes anterior (exclui clientes novos)
 *
 * STATUS: placeholder. A base (MRR do mes anterior por cliente) sera obtida
 * via backfill de client_charges (cobrancas pagas no mes anterior) +
 * snapshot client_mrr_snapshots alimentado daqui pra frente. Ate a
 * implementacao, retorna status 'pending' e o card mostra "em breve".
 *
 * Decisoes fixadas:
 *   - Exibicao: NRR mensal cru (~100,6%), delta em pp vs mes anterior.
 *   - MRR = assinaturas ativas normalizadas por ciclo (mesma logica do
 *     /api/crm/dashboard/cs).
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CsPainelNrr")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)

    // TODO(passo 6): backfill de client_charges + client_mrr_snapshots.
    return successResponse(request, {
      status: "pending",
      value: null,
      delta: null,
      note: "NRR sera habilitado apos backfill de client_charges e 1 ciclo de snapshot.",
    })
  } catch (error) {
    log.error("CS painel nrr error:", error)
    return errorResponse(request, error, "cs-painel-nrr")
  }
}
