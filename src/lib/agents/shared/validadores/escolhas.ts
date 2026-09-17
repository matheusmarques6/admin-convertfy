/**
 * Validador das ESCOLHAS do Curador contra a decisão (escolha final por
 * posição × contrato da variante × requisitos da posição × incentivo).
 *
 * Desde 14/09 as elegíveis por posição são filtro (Passo 3), então a
 * escolha do Curador do vault já nasce dentro do contrato. Este validador
 * é a rede: o Curador legado recebe a eliminação só no prompt, e a
 * `escolha` do vault pode citar variante fora da shortlist quando o parser
 * resolve por apelido. Puro.
 */

import { conflitoDeContrato, type ContratoResumo } from "../field-roles"
import type { DecisaoDoEmail } from "../decisao-do-email"
import { resultado, type ResultadoValidacao, type Violacao } from "./tipos"

/** Seções em que a MESMA variante não pode ocupar duas posições (regra da montagem). */
const SECOES_UNICAS = new Set(["hero", "products"])

const norm = (s: string) => s.trim().toLowerCase()

export interface EscolhaAValidar {
  block_index: number
  variant_id: string
}

/**
 * Violações de uma escolha isolada (usada também pelo resgate e pela
 * substituição por código — a régua tem de ser a MESMA nos três lugares).
 */
export function violacoesDaEscolha(
  decisao: DecisaoDoEmail,
  blockIndex: number,
  variantId: string,
  contrato: ContratoResumo | undefined,
): Violacao[] {
  const pos = decisao.posicoes[blockIndex]
  const out: Violacao[] = []
  if (!contrato) return out
  const base = { block_index: blockIndex, section: pos?.section ?? null, variant_id: variantId }
  const conflito = conflitoDeContrato(contrato, pos?.requisitos ?? null)
  if (conflito) {
    // Preço/avaliação ausentes são redação (a copy põe o preço no
    // subtítulo); o resto — cupom, CTA, grade fora da faixa — é anatomia,
    // e a copy não cria nem remove slot. Mesma régua do resgate.
    const redacao = /não mostra (preço|avaliação)/.test(conflito)
    out.push({
      ...base,
      tipo: "requisito_violado",
      severidade: redacao ? "medium" : "high",
      evidencia: conflito,
      esperado: JSON.stringify(pos?.requisitos ?? null),
    })
  }
  // CTA negado numa anatomia com botão: aviso, não veto — o campo será
  // omitido pelo blueprint e a linha sai no merge (ver `conflitoDeContrato`).
  if (pos?.requisitos?.cta === false && contrato.tem_cta) {
    out.push({
      ...base,
      tipo: "requisito_violado",
      severidade: "medium",
      campo: "cta",
      evidencia: "tem CTA e a decisão nega CTA — o campo será omitido pelo blueprint",
      esperado: JSON.stringify(pos?.requisitos ?? null),
    })
  }
  // Slot de cupom numa peça SEM incentivo é violação mesmo com `cupom: null`
  // na posição: o example ("Use code: [WELCOME-CODE]") fica no HTML.
  if (decisao.incentivo.existe === false && contrato.tem_cupom && pos?.requisitos?.cupom !== false) {
    out.push({
      ...base,
      tipo: "cupom_sem_incentivo",
      severidade: "high",
      campo: "cupom",
      evidencia: "a anatomia tem slot de cupom",
      esperado: `incentivo.existe = false (${decisao.incentivo.origem})`,
    })
  }
  return out
}

export function validarEscolhas(
  decisao: DecisaoDoEmail,
  escolhas: EscolhaAValidar[],
  contratoPorId: ReadonlyMap<string, ContratoResumo>,
): ResultadoValidacao {
  const violacoes: Violacao[] = []
  for (const e of escolhas) {
    violacoes.push(...violacoesDaEscolha(decisao, e.block_index, e.variant_id, contratoPorId.get(e.variant_id)))
  }
  // Repetição em seção única.
  const vistas = new Map<string, number>()
  for (const e of [...escolhas].sort((a, b) => a.block_index - b.block_index)) {
    const sec = norm(decisao.posicoes[e.block_index]?.section ?? "")
    if (!SECOES_UNICAS.has(sec)) continue
    const antes = vistas.get(e.variant_id)
    if (antes != null) {
      violacoes.push({
        tipo: "variante_repetida",
        severidade: "high",
        block_index: e.block_index,
        section: sec,
        variant_id: e.variant_id,
        evidencia: `a mesma variante já ocupa a posição ${antes + 1}`,
        esperado: `seção ${sec} única por peça`,
      })
    } else {
      vistas.set(e.variant_id, e.block_index)
    }
  }
  return resultado(violacoes)
}
