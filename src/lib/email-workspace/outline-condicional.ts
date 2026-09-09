/**
 * Outline do flow subordinado à decisão da LOJA (09/09).
 *
 * A "Estrutura geral" do welcome-1 (`email_outline_templates`) manda
 * "entregar o incentivo nos primeiros segundos […] quem abriu para pegar o
 * código precisa achá-lo sem procurar". Para uma loja SEM incentivo isso é
 * ordem errada, e ela chegava ao n8n com o mesmo peso da decisão do
 * Estruturador — foi assim que "Here's 10% OFF" + código inventado saíram
 * no batch 644d86c5. O outline é por FLOW; a decisão de incentivo é por
 * LOJA, então a loja vence.
 *
 * Puro. `existe: null` (não se sabe) deixa o outline como está — não se
 * apaga uma instrução por palpite.
 */

import type { DecisaoDeIncentivo } from "@/lib/agents/objecoes/incentivo"

export interface OutlineCondicionavel {
  objective: string | null
  guidance: string | null
  suggested_blocks: string[] | null
  tone_hint: string | null
  coupon_code: string | null
}

/**
 * Incentivo DESCONHECIDO (`existe: null`) — ninguém confirmou se a loja tem
 * cupom. Até 09/09 esse caso passava intacto, e o outline do welcome-1
 * (que manda "entregar o incentivo nos primeiros segundos… quem abriu para
 * pegar o código") chegava inteiro ao n8n. Junto com ele ia o
 * `coupon_code` do TEMPLATE — os 8 e-mails do welcome trazem `BEMVINDO10`,
 * um código genérico em português — e a Hero Boxers, loja inglesa sem
 * incentivo confirmado, recebeu "Your code. No strings attached".
 *
 * Desconhecido não autoriza promessa. É a mesma régua que o catálogo já
 * aplica ("`incentivo.existe: null` NÃO vira `promessa_a_pagar`"): não se
 * afirma que a loja NÃO tem (isso seria `false`), só se proíbe prometer o
 * que ninguém confirmou.
 */
export const PREFIXO_INCENTIVO_NAO_CONFIRMADO =
  "INCENTIVO NÃO CONFIRMADO nesta loja: ninguém verificou se existe cupom, desconto ou frete grátis. Ignore qualquer instrução abaixo de entregar código, percentual ou oferta — não escreva cupom, desconto nem \"use o código\". Desconhecido não autoriza promessa: o contrato deste e-mail é apresentação e prova."

export const PREFIXO_SEM_INCENTIVO =
  "SEM INCENTIVO ATIVO nesta loja (decisão confirmada): ignore qualquer instrução abaixo de entregar código, percentual ou oferta — não escreva cupom, desconto nem \"use o código\". O contrato deste e-mail é apresentação e prova."

const BLOCOS_DE_OFERTA = new Set(["coupon", "offer", "cupom", "oferta"])

export function condicionarOutline<T extends OutlineCondicionavel>(
  outline: T | null,
  decisao: DecisaoDeIncentivo | null | undefined,
): T | null {
  if (!outline || !decisao) return outline
  // `false` (a loja não tem) e `null` (ninguém confirmou) levam ao MESMO
  // comportamento — não prometer — com prefixos diferentes, porque a
  // instrução que o modelo lê não pode afirmar o que não se sabe.
  if (decisao.existe !== true) {
    const prefixo =
      decisao.existe === false ? PREFIXO_SEM_INCENTIVO : PREFIXO_INCENTIVO_NAO_CONFIRMADO
    const guidance = (outline.guidance ?? "").trim()
    return {
      ...outline,
      guidance: guidance ? `${prefixo}\n\n${guidance}` : prefixo,
      suggested_blocks: outline.suggested_blocks
        ? outline.suggested_blocks.filter((b) => !BLOCOS_DE_OFERTA.has(String(b).trim().toLowerCase()))
        : outline.suggested_blocks,
      coupon_code: null,
    }
  }
  if (decisao.existe === true && decisao.codigo) {
    // O código da LOJA vence o do outline (que é genérico por flow).
    return { ...outline, coupon_code: decisao.codigo }
  }
  return outline
}

/**
 * `coupon_code` efetivo do e-mail.
 *
 * Só incentivo CONFIRMADO (`existe: true`) entrega código. Com `false` ou
 * `null` o campo vai vazio — inclusive quando o template do flow tem um:
 * os 8 outlines do welcome trazem `BEMVINDO10`, e era por essa porta que
 * um código genérico em português saía numa loja inglesa que ninguém
 * confirmou ter cupom.
 *
 * Confirmado SEM código próprio ainda cai no do template: aí a loja disse
 * que tem incentivo, e o código do flow é a única fonte que existe.
 *
 * `decisao` ausente é o único caso que o módulo não opina (catálogo não
 * consultado — feature desligada), igual ao `condicionarOutline`.
 */
export function couponCodeEfetivo(
  outlineCode: string | null | undefined,
  decisao: DecisaoDeIncentivo | null | undefined,
): string | null {
  if (!decisao) return outlineCode ?? null
  if (decisao.existe !== true) return null
  return decisao.codigo ?? outlineCode ?? null
}
