/**
 * Validador do RESGATE por código (`menosIncompativel`).
 *
 * O resgate aceita incompatibilidade por construção — escolhe a menos
 * incompatível. O que ele NÃO pode aceitar é anatomia contrária à decisão:
 * slot de cupom numa peça sem incentivo, CTA onde a decisão nega, grade
 * acima do máximo. Redação (preço, avaliação, mínimo de itens) é a
 * concessão que o resgate existe para fazer, e fica em `medium`. Puro.
 */

import type { ContratoResumo } from "../field-roles"
import type { DecisaoDoEmail } from "../decisao-do-email"
import { violacoesDaEscolha } from "./escolhas"
import { resultado, type ResultadoValidacao } from "./tipos"

export function validarResgate(
  decisao: DecisaoDoEmail,
  resgate: { block_index: number; variant_id: string },
  contrato: ContratoResumo | undefined,
): ResultadoValidacao {
  const violacoes = violacoesDaEscolha(decisao, resgate.block_index, resgate.variant_id, contrato).map((v) => ({
    ...v,
    tipo: `resgate_${v.tipo}`,
  }))
  return resultado(violacoes)
}
