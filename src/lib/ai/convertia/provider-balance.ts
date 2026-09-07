/**
 * Saldo do OpenRouter — o ponto único de falha da ConvertIA.
 *
 * Incidente medido em 07/09/2026: das 20 respostas no histórico, 4 morreram
 * em HTTP 402 ("would exceed your available credits" e
 * "weight_exceeds_budget"). As MESMAS 402 zeraram os embeddings da base de
 * conhecimento — 124 notas ativas, nenhuma vetorizada — porque `embedTexts`
 * engole a falha em `log.warn` e o sync continua reportando sucesso.
 *
 * Um saldo só, três subsistemas parados, e nada disso aparecia em tela.
 *
 * Este módulo lê o saldo, classifica e guarda o snapshot. A classificação é
 * PURA e testada: é ela que decide se alguém é acordado de madrugada.
 *
 * Nota sobre o `weight_exceeds_budget`: o OpenRouter RESERVA o custo MÁXIMO
 * da chamada (prompt + max_tokens no preço do modelo), não o custo real.
 * Por isso o modelo mais caro estoura primeiro e parece "defeito do Fable" —
 * daí o piso ser folgado, e não centavos.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

const log = logger.child("ProviderBalance")

const CREDITS_URL = "https://openrouter.ai/api/v1/credits"
const TIMEOUT_MS = 15_000

export type SituacaoSaldo = "ok" | "baixo" | "esgotado" | "desconhecido"

export interface SaldoProvedor {
  saldoUsd: number | null
  limiteUsd: number | null
  usadoUsd: number | null
  situacao: SituacaoSaldo
  pisoUsd: number
  erro: string | null
  checadoEm: string
}

/**
 * Piso abaixo do qual o saldo é "baixo". Default US$ 5 porque a reserva de
 * um turno com modelo caro e prompt grande já passa de US$ 1 — piso de
 * centavos avisaria depois de o chat já estar quebrado.
 */
export function pisoConfigurado(): number {
  const bruto = Number(process.env.OPENROUTER_SALDO_MINIMO_USD)
  return Number.isFinite(bruto) && bruto > 0 ? bruto : 5
}

/**
 * PURA. `null` é "não sei", nunca "acabou": um timeout na consulta não pode
 * disparar o alerta de crédito esgotado — a equipe perderia a confiança no
 * alerta, que é a única coisa que o torna útil.
 */
export function classificarSaldo(saldoUsd: number | null, pisoUsd: number): SituacaoSaldo {
  if (saldoUsd === null || !Number.isFinite(saldoUsd)) return "desconhecido"
  if (saldoUsd <= 0) return "esgotado"
  // `<=`: o alerta dispara AO CHEGAR no piso, não depois de furá-lo. O piso
  // já é a margem — gastá-la antes de avisar seria não ter margem.
  return saldoUsd <= pisoUsd ? "baixo" : "ok"
}

/**
 * PURA. Só alerta na TRANSIÇÃO para pior. Sem isto o cron horário mandaria
 * a mesma notificação 24×/dia enquanto ninguém recarrega, e o alerta viraria
 * ruído que se aprende a ignorar — exatamente quando ele mais importa.
 *
 * `desconhecido` nunca dispara nem "cura": a consulta falhar não é notícia
 * sobre o saldo.
 */
export function deveAlertar(anterior: SituacaoSaldo | null, atual: SituacaoSaldo): boolean {
  if (atual === "ok" || atual === "desconhecido") return false
  if (anterior === null) return true
  if (anterior === atual) return false
  // baixo → esgotado avisa de novo (piorou); esgotado → baixo não (melhorou).
  if (anterior === "baixo" && atual === "esgotado") return true
  return anterior === "ok" || anterior === "desconhecido"
}

interface RespostaCredits {
  data?: { total_credits?: unknown; total_usage?: unknown }
}

function numeroOuNulo(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

/**
 * Consulta o saldo. NUNCA lança: quem chama é um cron e uma rota de painel,
 * e os dois preferem "não sei" a uma exceção.
 */
export async function lerSaldoOpenRouter(): Promise<SaldoProvedor> {
  const pisoUsd = pisoConfigurado()
  const base = (erro: string | null, extra: Partial<SaldoProvedor> = {}): SaldoProvedor => ({
    saldoUsd: null,
    limiteUsd: null,
    usadoUsd: null,
    situacao: "desconhecido",
    pisoUsd,
    erro,
    checadoEm: new Date().toISOString(),
    ...extra,
  })

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return base("OPENROUTER_API_KEY não configurada")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(CREDITS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      cache: "no-store",
    })
    if (!resp.ok) {
      const corpo = (await resp.text().catch(() => "")).slice(0, 200)
      return base(`OpenRouter HTTP ${resp.status}${corpo ? `: ${corpo}` : ""}`)
    }
    const json = (await resp.json()) as RespostaCredits
    const limiteUsd = numeroOuNulo(json.data?.total_credits)
    const usadoUsd = numeroOuNulo(json.data?.total_usage)
    if (limiteUsd === null || usadoUsd === null) {
      // Formato inesperado: registrar como desconhecido com o corpo, em vez
      // de inventar um saldo a partir de campo ausente.
      return base(`resposta sem total_credits/total_usage: ${JSON.stringify(json).slice(0, 200)}`)
    }
    const saldoUsd = Math.round((limiteUsd - usadoUsd) * 10_000) / 10_000
    return {
      saldoUsd,
      limiteUsd,
      usadoUsd,
      situacao: classificarSaldo(saldoUsd, pisoUsd),
      pisoUsd,
      erro: null,
      checadoEm: new Date().toISOString(),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return base(msg.includes("abort") ? `tempo esgotado após ${TIMEOUT_MS / 1000}s` : msg)
  } finally {
    clearTimeout(timer)
  }
}

const MISSING = new Set(["42P01", "PGRST205"])

/** Último snapshot gravado. `null` quando não há nenhum (ou sem a migration). */
export async function ultimoSaldo(admin: SupabaseClient): Promise<SaldoProvedor | null> {
  const { data, error } = await admin
    .from("ai_provider_balance")
    .select("saldo_usd, limite_usd, usado_usd, situacao, piso_usd, erro, checado_em")
    .eq("provider", "openrouter")
    .order("checado_em", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) {
    if (error && !MISSING.has(error.code ?? "")) log.warn("leitura do saldo falhou", { error: error.message })
    return null
  }
  const r = data as Record<string, unknown>
  return {
    saldoUsd: r.saldo_usd === null ? null : Number(r.saldo_usd),
    limiteUsd: r.limite_usd === null ? null : Number(r.limite_usd),
    usadoUsd: r.usado_usd === null ? null : Number(r.usado_usd),
    situacao: (r.situacao as SituacaoSaldo) ?? "desconhecido",
    pisoUsd: r.piso_usd === null ? pisoConfigurado() : Number(r.piso_usd),
    erro: (r.erro as string | null) ?? null,
    checadoEm: String(r.checado_em),
  }
}

export interface ResultadoChecagem extends SaldoProvedor {
  situacaoAnterior: SituacaoSaldo | null
  alertou: boolean
}

/**
 * Checa, grava o snapshot e alerta na transição para pior.
 *
 * A gravação acontece MESMO quando a consulta falha: um histórico com buraco
 * não responde "desde quando", que é a pergunta que se faz quando algo para.
 */
export async function checarSaldo(
  admin: SupabaseClient,
  opts: { notificar?: (detalhe: string) => Promise<void> } = {},
): Promise<ResultadoChecagem> {
  const anterior = await ultimoSaldo(admin)
  const atual = await lerSaldoOpenRouter()

  const { error } = await admin.from("ai_provider_balance").insert({
    provider: "openrouter",
    saldo_usd: atual.saldoUsd,
    limite_usd: atual.limiteUsd,
    usado_usd: atual.usadoUsd,
    situacao: atual.situacao,
    piso_usd: atual.pisoUsd,
    erro: atual.erro,
    checado_em: atual.checadoEm,
  })
  if (error && !MISSING.has(error.code ?? "")) {
    log.warn("snapshot do saldo não gravado", { error: error.message })
  }

  let alertou = false
  if (deveAlertar(anterior?.situacao ?? null, atual.situacao) && opts.notificar) {
    const detalhe =
      atual.situacao === "esgotado"
        ? `Saldo do OpenRouter zerado (US$ ${atual.saldoUsd?.toFixed(2) ?? "?"}). O chat da ConvertIA, os embeddings da base de conhecimento e os agentes de email param juntos.`
        : `Saldo do OpenRouter em US$ ${atual.saldoUsd?.toFixed(2) ?? "?"}, abaixo do piso de US$ ${atual.pisoUsd.toFixed(2)}.`
    try {
      await opts.notificar(detalhe)
      alertou = true
    } catch (err) {
      log.warn("alerta de saldo falhou", { error: err instanceof Error ? err.message : String(err) })
    }
  }

  log.info("saldo checado", {
    situacao: atual.situacao,
    saldo: atual.saldoUsd,
    anterior: anterior?.situacao ?? null,
    alertou,
    erro: atual.erro,
  })
  return { ...atual, situacaoAnterior: anterior?.situacao ?? null, alertou }
}
