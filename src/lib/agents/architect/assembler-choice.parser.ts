/**
 * assembler-choice.parser — lê a escolha final do Montador (story CM-4).
 *
 * Contrato:
 *
 *   [{"block_index":0,"variant_id":"...","rank":1},
 *    {"block_index":1,"variant_id":"...","rank":2,"motivo":"..."}]
 *
 * `rank` é a colocação da variante no ranking do Curador. `motivo` é
 * obrigatório quando `rank != 1` e proibido quando `rank = 1` — mantém o
 * output curto e evita que o modelo invente justificativa para confirmar o
 * óbvio.
 *
 * Diferença central em relação ao parser do Curador: aqui **sempre há
 * fallback**. O ranking do Curador já é uma composição legítima, avaliada
 * posição por posição, então qualquer coisa que o Montador erre cai para o
 * rank 1 em vez de derrubar o email.
 *
 * Puro (zero I/O) — testável.
 */

import { extractJson } from "./llm-invoke"
import type { RankedChoice } from "./curator-ranking.parser"
import { podeRepetir } from "./repeticao"

export interface AssemblerDecision {
  block_index: number
  variant_id: string
  /** Colocação REAL no ranking do Curador (1-based), corrigida pelo código. */
  rank: number
  /** Só quando `rank != 1`. */
  motivo?: string
}

export interface ParsedAssemblerChoices {
  /** Decisão final por posição — uma entrada por posição com finalistas. */
  decisions: AssemblerDecision[]
  /** Posições em que o Montador saiu do rank 1. */
  desvios: AssemblerDecision[]
  /** Posições que caíram no rank 1 por erro do modelo. */
  forcedRank1: Array<{ block_index: number; reason: ForcedReason }>
  /** Desvio sem justificativa (aceito, só registrado). */
  missingMotivo: number[]
  /** `motivo` enviado num rank 1 — descartado. */
  extraMotivo: number[]
  /** `rank` autodeclarado diferente do real (corrigido). */
  rankMismatch: number[]
  /** Repetições desfeitas pelo código: a posição trocou de variante. */
  dedup: Array<{ block_index: number; de: string; para: string }>
  /**
   * Posições que SAÍRAM da peça: a variante repetia e não havia finalista
   * livre naquela posição (10/09 — antes a repetida ficava). É o sinal de
   * que a biblioteca não tem o bloco que a sequência pediu.
   */
  dedupSemAlternativa: number[]
  /** O JSON não pôde ser lido — tudo caiu no rank 1. */
  malformed: boolean
}

export type ForcedReason =
  /** Posição ausente no output do modelo. */
  | "missing"
  /** Id fora dos finalistas daquela posição. */
  | "not_finalist"
  /** JSON ilegível. */
  | "malformed"

export interface ParseChoicesInput {
  raw: string
  /** Finalistas por posição, na ordem de preferência do Curador. */
  ranking: Map<number, RankedChoice[]>
  /**
   * Seção de cada posição. Sem ela o dedupe não roda: desfazer repetição
   * sem saber a seção é o comportamento antigo, que trocava escolha
   * legítima de corpo por uma alternativa pior.
   */
  sections?: readonly string[]
}

export function parseAssemblerChoices(
  input: ParseChoicesInput,
): ParsedAssemblerChoices {
  const { raw, ranking, sections } = input

  const out: ParsedAssemblerChoices = {
    decisions: [],
    desvios: [],
    forcedRank1: [],
    missingMotivo: [],
    extraMotivo: [],
    rankMismatch: [],
    dedup: [],
    dedupSemAlternativa: [],
    malformed: false,
  }

  let byBlock = new Map<number, Record<string, unknown>>()
  try {
    const json = JSON.parse(extractJson(raw))
    if (!Array.isArray(json)) throw new Error("not_array")
    byBlock = indexByBlock(json)
  } catch {
    out.malformed = true
  }

  // Uma decisão por posição COM finalistas, na ordem da estrutura.
  for (const blockIndex of Array.from(ranking.keys()).sort((a, b) => a - b)) {
    const finalists = ranking.get(blockIndex) ?? []
    if (finalists.length === 0) continue

    const rank1 = finalists[0].variant_id
    const fallback = (reason: ForcedReason): void => {
      out.forcedRank1.push({ block_index: blockIndex, reason })
      out.decisions.push({ block_index: blockIndex, variant_id: rank1, rank: 1 })
    }

    if (out.malformed) {
      fallback("malformed")
      continue
    }

    const item = byBlock.get(blockIndex)
    if (!item) {
      fallback("missing")
      continue
    }

    const id = typeof item.variant_id === "string" ? item.variant_id.trim() : ""
    const realRank = finalists.findIndex((f) => f.variant_id === id) + 1
    if (realRank === 0) {
      fallback("not_finalist")
      continue
    }

    // O `rank` do output é telemetria, não fonte de verdade: quem manda é a
    // posição real no ranking do Curador.
    const declared = typeof item.rank === "number" ? item.rank : null
    if (declared !== null && declared !== realRank) {
      out.rankMismatch.push(blockIndex)
    }

    const motivo =
      typeof item.motivo === "string" && item.motivo.trim()
        ? item.motivo.trim()
        : undefined

    if (realRank === 1) {
      // Motivo no rank 1 é proibido pelo prompt — descarta e registra.
      if (motivo) out.extraMotivo.push(blockIndex)
      out.decisions.push({ block_index: blockIndex, variant_id: id, rank: 1 })
      continue
    }

    if (!motivo) out.missingMotivo.push(blockIndex)
    const decision: AssemblerDecision = {
      block_index: blockIndex,
      variant_id: id,
      rank: realRank,
      ...(motivo ? { motivo } : {}),
    }
    out.decisions.push(decision)
    out.desvios.push(decision)
  }

  dedupeDecisions(out, ranking, sections ?? [])
  return out
}

/**
 * Desfaz variante repetida entre POSIÇÕES do mesmo e-mail.
 *
 * Não havia nada disso: o `Set` de `curator-ranking.parser` é recriado a
 * cada posição (só evita id repetido na mesma lista de finalistas), e entre
 * posições a única barreira era instrução de prompt. O Curador é
 * explicitamente instruído a NÃO se preocupar com repetição ("quem garante
 * variedade dentro do email é a etapa seguinte, não você") e o Montador tem
 * como PADRÃO ficar com o rank 1 — evitar a repetição é exceção que ele
 * precisa reconhecer sozinho. Quando não reconhece, o e-mail sai com o
 * mesmo componente duas vezes seguidas (Luxe Lift 23/08: posições 2 e 3
 * idênticas).
 *
 * A PRIMEIRA posição fica com a escolha original — é a ordem estrutural do
 * e-mail, e trocar a de cima por causa da de baixo seria arbitrário.
 *
 * Sem finalista livre, a repetição FICA: um e-mail repetido é melhor que um
 * e-mail com variante de outro tipo ou com posição vazia. O caso vai para
 * `dedupSemAlternativa`, que é o sinal de que o Curador não está entregando
 * finalistas variados o bastante.
 *
 * 07/09: a regra generalizou demais. Só `hero` e `products` precisam ser
 * únicos (ver `repeticao.ts`) — repetir um corpo, uma oferta ou um CTA é
 * composição legítima, e trocá-la aqui rebaixava a escolha do Curador em
 * nome de uma variedade que ninguém pediu. Fora dessas duas seções o
 * dedupe não age e nada é registrado.
 */
function dedupeDecisions(
  out: ParsedAssemblerChoices,
  ranking: Map<number, RankedChoice[]>,
  sections: readonly string[],
): void {
  const usados = new Set<string>()
  /** Posições que ficaram sem variante — removidas ao fim do laço. */
  const semVariante: AssemblerDecision[] = []
  for (const decision of out.decisions) {
    const section = sections[decision.block_index] ?? ""
    if (!usados.has(decision.variant_id)) {
      usados.add(decision.variant_id)
      continue
    }
    // Repetição permitida nesta seção: fica como o Curador rankeou.
    if (podeRepetir(section)) continue
    const finalists = ranking.get(decision.block_index) ?? []
    const alternativa = finalists.find((f) => !usados.has(f.variant_id))
    if (!alternativa) {
      // 10/09: sem alternativa, a posição SAI da peça — antes ela ficava
      // com a variante repetida. Um bloco a menos é peça mais curta; o
      // bloco repetido é peça que parece defeito (`repeticao.ts`).
      out.dedupSemAlternativa.push(decision.block_index)
      semVariante.push(decision)
      continue
    }
    out.dedup.push({
      block_index: decision.block_index,
      de: decision.variant_id,
      para: alternativa.variant_id,
    })
    decision.variant_id = alternativa.variant_id
    // `rank` é a colocação REAL nos finalistas daquela posição — o resto do
    // código conta com isso para separar "seguiu o Curador" de "desviou".
    decision.rank =
      finalists.findIndex((f) => f.variant_id === alternativa.variant_id) + 1
    // A troca pode ATERRISSAR no rank 1 (o Montador desviou para uma
    // variante já usada e o topo daquela posição estava livre). Aí deixa de
    // ser desvio: `desvios` é "o Montador saiu do rank 1", e depois desta
    // troca ele não está mais fora dele.
    if (decision.rank === 1) {
      const i = out.desvios.indexOf(decision)
      if (i !== -1) out.desvios.splice(i, 1)
      delete decision.motivo
    }
    usados.add(alternativa.variant_id)
  }
  if (semVariante.length === 0) return
  // Sai também de `desvios`: a posição não existe mais, então não há como
  // ela "ter saído do rank 1".
  out.decisions = out.decisions.filter((d) => !semVariante.includes(d))
  out.desvios = out.desvios.filter((d) => !semVariante.includes(d))
}

function indexByBlock(
  json: unknown[],
): Map<number, Record<string, unknown>> {
  const map = new Map<number, Record<string, unknown>>()
  for (const item of json) {
    if (!item || typeof item !== "object") continue
    const rec = item as Record<string, unknown>
    const idx = rec.block_index
    if (typeof idx !== "number" || !Number.isInteger(idx)) continue
    // Posição repetida: a primeira vale.
    if (!map.has(idx)) map.set(idx, rec)
  }
  return map
}

/** `block_index` → `variant_id` escolhido. */
export function decisionMap(
  parsed: ParsedAssemblerChoices,
): Map<number, string> {
  return new Map(parsed.decisions.map((d) => [d.block_index, d.variant_id]))
}
