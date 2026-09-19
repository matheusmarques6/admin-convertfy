/**
 * Erro do PROVEDOR de modelo, classificado por CÓDIGO — módulo puro.
 *
 * ── Por que existe (batch d2bd526b, 18/09) ──────────────────────────
 *
 * O leque do Curador tomou HTTP 402 `in_flight_budget_exhausted` nas
 * posições 2 a 5. A chamada não aconteceu: não há veredito nenhum sobre a
 * biblioteca. Mas a posição chegava à montagem como "sem variante" e o
 * RESGATE por código a preenchia com a "menos incompatível" — quatro
 * decisões de fallback no lugar de quatro decisões do Curador, e a peça
 * seguiu para blueprint, copy e seis imagens (US$ 1,50) antes de morrer no
 * `hero_section` com o mesmo 402. Custo do batch: US$ 3,16, entregue nada.
 *
 * A régua aqui é a mesma da ConvertIA (`ai/convertia/model-errors.ts`,
 * que classifica `credits_in_flight` separado de `no_credits`): erro de
 * provedor é RETOMÁVEL, nunca lacuna de biblioteca e nunca resgate. O que
 * este módulo acrescenta é o caminho de erro do SDK Anthropic (que carrega
 * `status` numérico em vez de "HTTP NNN" na mensagem) e os erros nomeados
 * do OpenRouter (`OpenRouterEmptyBodyError` não diz "HTTP" em lugar
 * nenhum).
 */

import { friendlyModelError, type ModelErrorCode } from "@/lib/ai/convertia/model-errors"

/**
 * `orcamento_esgotado` é o relógio da fase 1 (`relogioDesteInvoke` lança
 * "sem orçamento" antes de gastar); `empty_body` é o 200 OK com zero bytes
 * do OpenRouter. Os demais são os da ConvertIA.
 */
export type CodigoDeErroDoProvedor = ModelErrorCode | "orcamento_esgotado" | "empty_body"

/** Prefixo do `erro` de uma posição cuja CHAMADA não chegou a responder. */
export const PREFIXO_CHAMADA_FALHOU = "chamada_falhou: "

function statusNumerico(err: unknown): number | null {
  if (!err || typeof err !== "object") return null
  const s = (err as { status?: unknown }).status
  return typeof s === "number" ? s : null
}

/**
 * Classifica qualquer erro que saia de `invokeAgent`.
 *
 * Ordem: sinais NOSSOS primeiro (nome da classe, mensagem de orçamento),
 * depois o `status` numérico (SDK Anthropic), depois o texto (OpenRouter,
 * que escreve "HTTP NNN" na mensagem). O texto vem por último porque é o
 * sinal menos estável dos três.
 */
export function codigoDoErro(err: unknown): CodigoDeErroDoProvedor {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : String(err ?? "")
  const nome = err instanceof Error ? err.name : ""
  if (/^sem orçamento/i.test(msg)) return "orcamento_esgotado"
  if (nome === "OpenRouterEmptyBodyError" || /empty body/i.test(msg)) return "empty_body"
  if (msg === "timeout" || nome === "AbortError") return "timeout"
  const status = statusNumerico(err)
  if (status != null) {
    if (status === 402) return friendlyModelError(msg).code === "credits_in_flight" ? "credits_in_flight" : "no_credits"
    if (status === 401 || status === 403) return "unauthorized"
    if (status === 429) return "rate_limited"
    if (status === 408) return "timeout"
    if (status >= 500) return "unavailable"
  }
  return friendlyModelError(msg).code
}

/**
 * É erro do PROVEDOR (a chamada não chegou a produzir decisão)?
 *
 * `unknown` fica de fora de propósito: sem saber o que falhou, chamar de
 * "provedor" esconderia um bug nosso (JSON ilegível, parser) atrás de uma
 * retomada que repetiria o mesmo bug.
 */
export function ehErroDeProvedor(codigo: CodigoDeErroDoProvedor): boolean {
  return codigo !== "unknown"
}

/**
 * Rótulo gravado no `erro` da posição: `chamada_falhou: <codigo>: <msg>`.
 * O código vem PRIMEIRO para `codigoDaFalha` não depender da mensagem.
 */
export function rotularChamadaFalhou(err: unknown): { erro: string; codigo: CodigoDeErroDoProvedor } {
  const codigo = codigoDoErro(err)
  const msg = err instanceof Error ? err.message : String(err)
  return { erro: `${PREFIXO_CHAMADA_FALHOU}${codigo}: ${msg}`, codigo }
}

/** O inverso: lê o código de um `erro` gravado. `null` se não é falha de chamada. */
export function codigoDaFalha(erro: string | null | undefined): CodigoDeErroDoProvedor | null {
  if (!erro || !erro.startsWith(PREFIXO_CHAMADA_FALHOU)) return null
  const resto = erro.slice(PREFIXO_CHAMADA_FALHOU.length)
  const m = /^([a-z_]+):/.exec(resto)
  if (!m) return "unknown"
  return m[1] as CodigoDeErroDoProvedor
}
