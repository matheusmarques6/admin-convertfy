/**
 * Vercel Cron — guarda a cotação do dia.
 *
 * Schedule: 5 11 * * * (08:05 BRT) — depois da atualização diária do
 * provedor gratuito e antes do horário em que o time abre o dashboard.
 *
 * Por que um cron, se o próprio serviço de câmbio já grava a linha
 * quando busca a cotação: porque essa gravação depende de ALGUÉM abrir
 * uma tela que converte moeda. Um feriado sem acesso deixaria o dia sem
 * linha, e o buraco só apareceria meses depois — na conversão de um
 * período antigo, como "cotação aproximada" sem ninguém saber por quê.
 *
 * Idempotente: a chave é o dia (upsert), rodar duas vezes só atualiza.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { snapshotDailyRates, getLatestRatesForSnapshot } from "@/lib/services/exchange-rate.service"
import { logger } from "@/lib/logger"

const log = logger.child("CronExchangeRate")

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const cotacao = await getLatestRatesForSnapshot()
    if (!cotacao) {
      // Sem cotação não há o que gravar. É falha do provedor, e o dia
      // ficará sem linha — dizer isso é melhor que gravar uma cópia da
      // cotação de ontem carimbada como sendo de hoje.
      log.warn("provedor não devolveu cotação — dia sem snapshot")
      return NextResponse.json(
        { success: false, error: "Cotação indisponível no provedor" },
        { status: 503 },
      )
    }

    await snapshotDailyRates(cotacao.rates, {
      provider: cotacao.provider,
      providerUpdatedAt: cotacao.providerUpdatedAt,
    })
    const moedas = Object.keys(cotacao.rates).length
    log.info("cotação do dia gravada", { moedas, provider: cotacao.provider })
    return NextResponse.json({ success: true, moedas, provider: cotacao.provider })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error("falhou", { erro: msg })
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
