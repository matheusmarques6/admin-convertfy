/**
 * Decisão de incentivo da loja, lida do catálogo do Catalogador
 * (`client_stores.objection_catalog.incentivo.existe`). Puro.
 *
 * `false` = a loja NÃO tem incentivo ativo (o Catalogador confirmou pelo
 * contexto); `true` = tem (com `codigo`/`valor`); `null` = não se sabe —
 * e "não se sabe" nunca vira "não tem": inventar promessa é o pior erro
 * possível aqui, e recusar oferta por palpite é o segundo.
 *
 * Consumidores: checks de conteúdo do QA (`oferta_sem_incentivo`), o
 * payload do n8n (`decisao.incentivo`, `coupon_code`) e o outline
 * condicionado. Uma leitura só, para os três concordarem.
 */

export interface DecisaoDeIncentivo {
  existe: boolean | null
  codigo: string | null
  valor: string | null
}

export function incentivoDoCatalogo(catalogo: unknown): DecisaoDeIncentivo {
  const vazio: DecisaoDeIncentivo = { existe: null, codigo: null, valor: null }
  if (!catalogo || typeof catalogo !== "object") return vazio
  const inc = (catalogo as { incentivo?: unknown }).incentivo
  if (!inc || typeof inc !== "object") return vazio
  const r = inc as { existe?: unknown; codigo?: unknown; valor?: unknown }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  return {
    existe: typeof r.existe === "boolean" ? r.existe : null,
    codigo: str(r.codigo),
    valor: str(r.valor),
  }
}

/** Atalho: só o `existe`. */
export function incentivoExisteDoCatalogo(catalogo: unknown): boolean | null {
  return incentivoDoCatalogo(catalogo).existe
}
