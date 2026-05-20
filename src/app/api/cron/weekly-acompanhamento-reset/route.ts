/**
 * Cron domingo 22:00 UTC: reseta pipeline semanal e flag automaticamente
 * lojas que precisam atenção pra Etapa 1.
 *
 * Logica detalhada em src/lib/services/acompanhamento-flagging.service.ts
 * (compartilhada com a rota admin "Sinalizar lojas agora").
 *
 * Lógica de flag:
 *  1. Lojas em risco (health_score < 50)
 *  2. Lojas em atenção (50-69)
 *  3. Lojas em rampup (< 60 dias na Convertfy)
 *  4. Lojas com renovação próxima (contract_end_date <= 30 dias)
 *  5. Lojas com solicitações abertas (client_store_requests status=open)
 *
 * Idempotente: se já rodou pra essa semana, soft-deactiva os estados
 * anteriores e cria novos.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  flagStoresForWeek,
  nextMonday,
  thisMonday,
} from "@/lib/services/acompanhamento-flagging.service"

const log = logger.child("WeeklyAcompanhamentoResetCron")

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()

    // Determina semana alvo (próxima segunda). Se rodar manualmente em
    // outro dia, usa segunda da semana corrente.
    const now = new Date()
    const isSunday = now.getUTCDay() === 0
    const week = isSunday ? nextMonday() : thisMonday()

    const result = await flagStoresForWeek({
      admin,
      week,
    })

    log.info("Reset cron concluido", result)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (e) {
    log.error("Reset cron failed", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
