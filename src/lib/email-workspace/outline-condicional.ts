/**
 * Outline do flow subordinado à decisão de incentivo do TOQUE.
 *
 * A "Estrutura geral" do welcome-1 (`email_outline_templates`) manda
 * "entregar o incentivo nos primeiros segundos […] quem abriu para pegar o
 * código precisa achá-lo sem procurar". Para um toque SEM cupom isso é
 * ordem errada, e ela chegava ao n8n com o mesmo peso da decisão do
 * Estruturador — foi assim que "Here's 10% OFF" + código inventado saíram
 * no batch 644d86c5.
 *
 * Desde 14/09 a decisão vem do próprio catálogo de outlines
 * (`incentivoDoOutline`): `existe` é sempre booleano. O ramo "não se sabe"
 * (`existe: null`), que prefixava "INCENTIVO NÃO CONFIRMADO" e zerava o
 * cupom de um toque que TEM cupom (Hero Boxers, 11/09), deixou de existir.
 *
 * Puro.
 */

/** O que o condicionamento precisa saber da decisão. */
export interface IncentivoParaOutline {
  existe: boolean
  codigo: string | null
}

export interface OutlineCondicionavel {
  objective: string | null
  guidance: string | null
  suggested_blocks: string[] | null
  tone_hint: string | null
  coupon_code: string | null
}

export const PREFIXO_SEM_INCENTIVO =
  "SEM INCENTIVO NESTE TOQUE (decisão do flow): ignore qualquer instrução abaixo de entregar código, percentual ou oferta — não escreva cupom, desconto nem \"use o código\". O contrato deste e-mail é apresentação e prova."

const BLOCOS_DE_OFERTA = new Set(["coupon", "offer", "cupom", "oferta"])

export function condicionarOutline<T extends OutlineCondicionavel>(
  outline: T | null,
  decisao: IncentivoParaOutline | null | undefined,
): T | null {
  if (!outline || !decisao) return outline
  if (!decisao.existe) {
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
  if (decisao.codigo) {
    // O código resolvido (traduzido ou override da loja) vence o pt-BR do outline.
    return { ...outline, coupon_code: decisao.codigo }
  }
  return outline
}

/**
 * `coupon_code` efetivo do e-mail: o da decisão (já traduzido / override),
 * senão o do outline quando o toque tem incentivo, senão nada.
 * `decisao` ausente é o único caso em que o módulo não opina.
 */
export function couponCodeEfetivo(
  outlineCode: string | null | undefined,
  decisao: IncentivoParaOutline | null | undefined,
): string | null {
  if (!decisao) return outlineCode ?? null
  if (!decisao.existe) return null
  return decisao.codigo ?? outlineCode ?? null
}
