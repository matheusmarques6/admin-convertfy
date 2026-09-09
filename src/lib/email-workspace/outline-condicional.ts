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

export const PREFIXO_SEM_INCENTIVO =
  "SEM INCENTIVO ATIVO nesta loja (decisão confirmada): ignore qualquer instrução abaixo de entregar código, percentual ou oferta — não escreva cupom, desconto nem \"use o código\". O contrato deste e-mail é apresentação e prova."

const BLOCOS_DE_OFERTA = new Set(["coupon", "offer", "cupom", "oferta"])

export function condicionarOutline<T extends OutlineCondicionavel>(
  outline: T | null,
  decisao: DecisaoDeIncentivo | null | undefined,
): T | null {
  if (!outline || !decisao) return outline
  if (decisao.existe === false) {
    const guidance = (outline.guidance ?? "").trim()
    return {
      ...outline,
      guidance: guidance ? `${PREFIXO_SEM_INCENTIVO}\n\n${guidance}` : PREFIXO_SEM_INCENTIVO,
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

/** `coupon_code` efetivo do e-mail: loja decide; sem decisão, o outline. */
export function couponCodeEfetivo(
  outlineCode: string | null | undefined,
  decisao: DecisaoDeIncentivo | null | undefined,
): string | null {
  if (decisao?.existe === false) return null
  if (decisao?.existe === true && decisao.codigo) return decisao.codigo
  return outlineCode ?? null
}
