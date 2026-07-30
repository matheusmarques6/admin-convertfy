/**
 * curator-ranking.parser — lê o ranking do Curador (story CM-3).
 *
 * Substitui o `parseAssemblerOutput`, que esperava UMA escolha por posição.
 * Contrato novo:
 *
 *   [{"block_index":0,"escolhas":[{"variant_id":"...","motivo":"..."},
 *                                 {"variant_id":"..."},{"variant_id":"..."}]}]
 *
 * A ORDEM do array `escolhas` É a preferência — não há campo de rank.
 * Somente a 1ª de cada posição carrega `motivo`.
 *
 * O parser é a única defesa do pipeline: não há structured output nesses
 * agentes (texto puro + `extractJson`), então tudo o que o modelo pode
 * errar é tratado aqui e registrado na telemetria.
 *
 * Puro (zero I/O) — testável.
 */

import { extractJson } from "./llm-invoke"

/** Uma indicação do Curador, na ordem de preferência. */
export interface RankedChoice {
  variant_id: string
  /** Presente só na 1ª de cada posição (teto de 20 palavras no prompt). */
  motivo?: string
}

export interface ParsedRanking {
  /** `block_index` → finalistas válidos, em ordem de preferência. */
  byBlock: Map<number, RankedChoice[]>
  /** Ids que não existem no catálogo. */
  invalidIds: string[]
  /** Ids cujo `block_type` não é a seção daquela posição. */
  wrongTypeIds: Array<{ block_index: number; variant_id: string; type: string }>
  /** `block_index` fora da estrutura do email. */
  unknownBlocks: number[]
  /** Ids repetidos na mesma posição (só o primeiro vale). */
  duplicateIds: string[]
  /** Posições da estrutura que ficaram sem nenhum id válido. */
  emptyBlocks: number[]
  /** O JSON não pôde ser lido. */
  malformed: boolean
}

export interface ParseRankingInput {
  raw: string
  /** Seção esperada de cada posição, na ordem da estrutura. */
  sections: string[]
  /** `variant_id` → `block_type` do catálogo (ver `buildTypeIndex`). */
  typeIndex: Map<string, string>
  /** Teto de finalistas por posição. */
  maxPerBlock?: number
}

export const DEFAULT_MAX_PER_BLOCK = 3

export function parseCuratorRanking(
  input: ParseRankingInput,
): ParsedRanking {
  const { raw, sections, typeIndex, maxPerBlock = DEFAULT_MAX_PER_BLOCK } = input

  const out: ParsedRanking = {
    byBlock: new Map(),
    invalidIds: [],
    wrongTypeIds: [],
    unknownBlocks: [],
    duplicateIds: [],
    emptyBlocks: [],
    malformed: false,
  }

  let json: unknown
  try {
    json = JSON.parse(extractJson(raw))
  } catch {
    out.malformed = true
    out.emptyBlocks = sections.map((_, i) => i)
    return out
  }
  if (!Array.isArray(json)) {
    out.malformed = true
    out.emptyBlocks = sections.map((_, i) => i)
    return out
  }

  for (const item of json) {
    if (!item || typeof item !== "object") continue
    const rec = item as Record<string, unknown>
    const blockIndex = rec.block_index
    if (typeof blockIndex !== "number" || !Number.isInteger(blockIndex)) continue

    const section = sections[blockIndex]
    if (section === undefined) {
      out.unknownBlocks.push(blockIndex)
      continue
    }
    // Uma posição repetida no output: a primeira ocorrência vale.
    if (out.byBlock.has(blockIndex)) continue

    const rawChoices = Array.isArray(rec.escolhas) ? rec.escolhas : []
    const valid: RankedChoice[] = []
    const seen = new Set<string>()

    for (const c of rawChoices) {
      const id = choiceId(c)
      if (!id) continue

      if (seen.has(id)) {
        out.duplicateIds.push(id)
        continue
      }
      const type = typeIndex.get(id)
      if (type === undefined) {
        out.invalidIds.push(id)
        continue
      }
      // O catálogo vai INTEIRO no prompt, então nada impede o modelo de
      // indicar variante de outra seção. Descarta e registra.
      if (type.toLowerCase() !== section.toLowerCase()) {
        out.wrongTypeIds.push({ block_index: blockIndex, variant_id: id, type })
        continue
      }
      seen.add(id)
      const motivo = choiceMotivo(c)
      valid.push(motivo ? { variant_id: id, motivo } : { variant_id: id })
      if (valid.length >= maxPerBlock) break
    }

    if (valid.length > 0) out.byBlock.set(blockIndex, valid)
  }

  out.emptyBlocks = sections
    .map((_, i) => i)
    .filter((i) => !out.byBlock.has(i))

  return out
}

/** Aceita `{variant_id}` ou a string crua do id (tolerância barata). */
function choiceId(c: unknown): string | null {
  if (typeof c === "string") return c.trim() || null
  if (!c || typeof c !== "object") return null
  const id = (c as Record<string, unknown>).variant_id
  return typeof id === "string" && id.trim() ? id.trim() : null
}

function choiceMotivo(c: unknown): string | undefined {
  if (!c || typeof c !== "object") return undefined
  const m = (c as Record<string, unknown>).motivo
  return typeof m === "string" && m.trim() ? m.trim() : undefined
}

/** Só os ids, por posição — atalho para telemetria e para o Montador. */
export function rankingIds(parsed: ParsedRanking): Record<number, string[]> {
  const out: Record<number, string[]> = {}
  for (const [block, choices] of parsed.byBlock) {
    out[block] = choices.map((c) => c.variant_id)
  }
  return out
}
