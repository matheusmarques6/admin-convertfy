/**
 * Decisão de incentivo de um TOQUE (flow × e-mail), derivada do catálogo de
 * outlines — não do Catalogador.
 *
 * Até 14/09 `existe` vinha de `client_stores.objection_catalog.incentivo`,
 * escrito por um LLM a partir da pesquisa. Quando ele gravava `null`
 * ("não se sabe"), `couponCodeEfetivo` zerava o código e o outline recebia
 * o prefixo "não prometa" — e a Hero Boxers, cujo welcome 1 TEM cupom no
 * catálogo de outlines (`BEMVINDO10`), saiu com a hero prometendo 10% OFF
 * sobre uma estrutura montada sem cupom (batch 6249aef2, 11/09).
 *
 * O incentivo é decisão do FLOW: `email_outline_templates.coupon_code` diz
 * se o toque entrega cupom (27 dos 34 toques têm). A tradução por idioma é
 * DADO (`coupon_codes`, preenchido à mão na tela de outlines — BEMVINDO10 →
 * WELCOME10 é decisão humana, não regra), e a loja pode sobrescrever o
 * código no bloco `coupon` do e-mail. Nenhum LLM opina sobre existência.
 *
 * `existe` é SEMPRE booleano: "não se sabe" deixou de existir, porque o
 * catálogo de outlines sempre responde.
 *
 * Puro. Quem lê banco é `incentivo-da-loja.service.ts`.
 */

export type OrigemDoIncentivo =
  /** Código gravado no bloco `coupon` do e-mail (por loja). */
  | "override_loja"
  /** `coupon_codes[idioma]` do outline. */
  | "outline_traduzido"
  /** `coupon_code` (pt-BR) do outline — idioma pt-BR ou sem tradução. */
  | "outline_pt"
  /** O toque não tem cupom no catálogo de outlines. */
  | "sem_incentivo"

export interface DecisaoDeIncentivo {
  existe: boolean
  codigo: string | null
  /** Valor do desconto como texto ("10%", "R$ 20"); null quando não cadastrado. */
  valor: string | null
  origem: OrigemDoIncentivo
  /**
   * O toque tem cupom, a loja fala outro idioma e não há tradução: o código
   * que sai é o pt-BR. Vira aviso no QA — é o sintoma da Hero Boxers.
   */
  traducao_faltante: boolean
}

export interface OutlineComCupom {
  coupon_code?: string | null
  coupon_codes?: Record<string, unknown> | null
  coupon_value?: string | null
}

export const SEM_INCENTIVO: Readonly<DecisaoDeIncentivo> = Object.freeze({
  existe: false,
  codigo: null,
  valor: null,
  origem: "sem_incentivo" as const,
  traducao_faltante: false,
})

const PT_BR = "pt-br"

function limparCodigo(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim().toUpperCase()
  return t || null
}

function limparValor(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t || null
}

/**
 * Código traduzido para o idioma: chave exata, depois a chave normalizada
 * (`en-US` → `en`, caixa ignorada). `pt-BR` nunca procura tradução — o
 * próprio `coupon_code` é o pt-BR.
 */
function codigoTraduzido(codes: Record<string, unknown> | null | undefined, idioma: string): string | null {
  if (!codes || typeof codes !== "object") return null
  const alvo = idioma.trim().toLowerCase()
  if (!alvo || alvo === PT_BR) return null
  const base = alvo.split(/[-_]/)[0]
  const entradas = Object.entries(codes)
  for (const [k, v] of entradas) {
    if (k.trim().toLowerCase() === alvo) return limparCodigo(v)
  }
  for (const [k, v] of entradas) {
    if (k.trim().toLowerCase() === base) return limparCodigo(v)
  }
  return null
}

export function incentivoDoOutline(
  outline: OutlineComCupom | null | undefined,
  idioma: string | null | undefined,
  overrideDaLoja?: string | null,
): DecisaoDeIncentivo {
  const valor = limparValor(outline?.coupon_value)
  const codigoPt = limparCodigo(outline?.coupon_code)
  const idiomaNorm = (idioma ?? "").trim().toLowerCase()
  const traduzido = codigoPt ? codigoTraduzido(outline?.coupon_codes, idiomaNorm) : null
  const override = limparCodigo(overrideDaLoja)

  // A loja escreveu o código no bloco: ela sabe o que está em vigor.
  if (override) {
    return { existe: true, codigo: override, valor, origem: "override_loja", traducao_faltante: false }
  }
  // O toque não entrega cupom — decisão do flow.
  if (!codigoPt) return { ...SEM_INCENTIVO }

  if (traduzido) {
    return { existe: true, codigo: traduzido, valor, origem: "outline_traduzido", traducao_faltante: false }
  }
  const precisaTraducao = Boolean(idiomaNorm) && idiomaNorm !== PT_BR
  return {
    existe: true,
    codigo: codigoPt,
    valor,
    origem: "outline_pt",
    traducao_faltante: precisaTraducao,
  }
}
