/**
 * Vercel Cron — saldo do OpenRouter.
 *
 * Schedule: de hora em hora.
 *
 * Existe porque o saldo é o ponto único de falha de TODA a ConvertIA e só
 * era descoberto quando alguma coisa quebrava. Em 07/09/2026, 4 das 20
 * respostas do histórico morreram em 402 e as 124 notas da base ficaram sem
 * embedding pela mesma causa — sem nenhum sinal em tela.
 *
 * O alerta sai na TRANSIÇÃO (ver `deveAlertar`): de hora em hora, repetir a
 * mesma notificação seria 24 por dia até alguém recarregar, e alerta que se
 * repete é alerta que se aprende a ignorar.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { checarSaldo } from "@/lib/ai/convertia/provider-balance"
import { notifyCreditsExhausted } from "@/lib/agents/generation-notify.service"
import { logger } from "@/lib/logger"

const log = logger.child("CronConvertiaSaldo")

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()
    const r = await checarSaldo(admin, {
      notificar: (detalhe) => notifyCreditsExhausted({ provider: "OpenRouter", detail: detalhe }),
    })
    return NextResponse.json({
      ok: true,
      situacao: r.situacao,
      situacao_anterior: r.situacaoAnterior,
      saldo_usd: r.saldoUsd,
      piso_usd: r.pisoUsd,
      alertou: r.alertou,
      erro: r.erro,
    })
  } catch (error) {
    // Um cron de observabilidade que derruba a si mesmo não observa nada.
    const msg = error instanceof Error ? error.message : String(error)
    log.error("checagem de saldo falhou", { error: msg })
    return NextResponse.json({ ok: false, error: msg }, { status: 200 })
  }
}
