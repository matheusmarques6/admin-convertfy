/**
 * Vercel Cron — radar editorial diário do módulo Conteúdo.
 *
 * Schedule: 40 9 * * * (06:40 BRT)
 *
 * **Por que ele existe**: o painel "Em alta" do pipeline de Reels estava
 * pronto desde set/2026 e `conteudo_trends` tinha **ZERO linhas** em
 * produção — a única entrada era um botão, e ninguém clicou. Painel vazio por
 * falta de gatilho é indistinguível, na tela, de painel vazio por não haver
 * assunto.
 *
 * Cada rodada: expira o que passou da validade (14 dias), busca na internet,
 * pede os assuntos à ConvertIA e confere cada link contra o que a busca
 * serviu. Uma rodada por org por dia — `precisaRodar` recusa a segunda, então
 * retry da plataforma ou disparo manual não custa duas chamadas de modelo
 * (`?forcar=1` fura a guarda, para quando alguém quer a rodada agora).
 *
 * **Zero não é sucesso.** Havendo org para rodar e nenhuma tendo rodado, a
 * rota responde 500: cron mudo reportado como verde é como o `crm-snapshot`
 * passou meses sem gravar uma linha.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { varrerRadar } from "@/lib/services/conteudo-trends.service"

const log = logger.child("CronConteudoRadar")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()
    const forcar = request.nextUrl.searchParams.get("forcar") === "1"
    const rodadas = await varrerRadar(admin, { budgetMs: 240_000, forcar })

    const rodaram = rodadas.filter((r) => r.rodou)
    const comErro = rodadas.filter((r) => r.motivo === "erro")
    const semFatoExterno = rodaram.filter((r) => r.semFatoExterno).length
    const assuntos = rodaram.reduce((n, r) => n + (r.assuntos ?? 0), 0)
    const expirados = rodaram.reduce((n, r) => n + (r.expirados ?? 0), 0)

    log.info("radar editorial", { orgs: rodadas.length, rodaram: rodaram.length, assuntos, expirados, semFatoExterno, erros: comErro.length })

    // Org pulada por "rodou há pouco" é rodada bem-sucedida de ontem, não
    // falha de hoje: só é problema quando havia org e NENHUMA produziu nada.
    const houveTrabalho = rodadas.length === 0 || rodaram.length > 0 || rodadas.every((r) => r.motivo === "rodou_ha_pouco")
    if (!houveTrabalho) {
      return NextResponse.json(
        { success: false, error: "nenhuma org rodou o radar", orgs: rodadas.length, rodadas },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, orgs: rodadas.length, rodaram: rodaram.length, assuntos, expirados, semFatoExterno, rodadas })
  } catch (error) {
    log.error("radar editorial falhou:", error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "unknown" }, { status: 500 })
  }
}
