/**
 * Vercel Cron — moeda e fuso das lojas, conferidos com a plataforma.
 *
 * Schedule: 50 5 * * 1 (segunda, 02:50 BRT) — semanal porque moeda e
 * fuso de loja quase nunca mudam; o que muda é loja NOVA entrando sem
 * cadastro. Rodar de hora em hora gastaria uma chamada por loja por
 * rodada para não mudar nada.
 *
 * O que ele conserta sozinho: loja que nasceu no default 'BRL' e loja
 * sem fuso — as duas fazem o relatório mentir em silêncio (câmbio
 * errado e janela cortada no fuso errado). O que ele NÃO faz: passar
 * por cima de valor que um humano definiu à mão; para isso existe o
 * botão da auditoria, onde o pedido é explícito.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { syncAllStoresPlatformProfile } from "@/lib/services/store-platform-profile.service"
import { logger } from "@/lib/logger"

const log = logger.child("CronStorePlatformProfile")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const { lojas, alteradas, comErro } = await syncAllStoresPlatformProfile()
    // Só o que mudou ou falhou vira log: 60 linhas de "confere" por
    // semana é ruído que esconde a linha que importa.
    for (const l of lojas) {
      if (l.erro) log.warn(l.resumo, { storeId: l.storeId })
      else if (l.decisao?.mudou) log.info(l.resumo, { storeId: l.storeId })
    }
    log.info("conferência semanal concluída", { lojas: lojas.length, alteradas, comErro })
    return NextResponse.json({ success: true, lojas: lojas.length, alteradas, comErro })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error("falhou", { erro: msg })
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
