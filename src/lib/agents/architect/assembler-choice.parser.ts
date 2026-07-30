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
}

export function parseAssemblerChoices(
  input: ParseChoicesInput,
): ParsedAssemblerChoices {
  const { raw, ranking } = input

  const out: ParsedAssemblerChoices = {
    decisions: [],
    desvios: [],
    forcedRank1: [],
    missingMotivo: [],
    extraMotivo: [],
    rankMismatch: [],
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

  return out
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
