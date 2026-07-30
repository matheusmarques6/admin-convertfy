import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import type { RankedChoice } from "./curator-ranking.parser"
import {
  parseAssemblerChoices,
  decisionMap,
} from "./assembler-choice.parser"

const ranking = new Map<number, RankedChoice[]>([
  [0, [{ variant_id: "h1", motivo: "top" }, { variant_id: "h2" }, { variant_id: "h3" }]],
  [1, [{ variant_id: "b1" }, { variant_id: "b2" }]],
  [2, [{ variant_id: "f1" }]],
])

const parse = (raw: string, r = ranking) =>
  parseAssemblerChoices({ raw, ranking: r })

describe("parseAssemblerChoices", () => {
  it("lê as decisões e separa os desvios", () => {
    const raw = JSON.stringify([
      { block_index: 0, variant_id: "h1", rank: 1 },
      { block_index: 1, variant_id: "b2", rank: 2, motivo: "alterna o ritmo" },
      { block_index: 2, variant_id: "f1", rank: 1 },
    ])
    const r = parse(raw)
    expect(r.malformed).toBe(false)
    expect(decisionMap(r)).toEqual(
      new Map([
        [0, "h1"],
        [1, "b2"],
        [2, "f1"],
      ]),
    )
    expect(r.desvios).toHaveLength(1)
    expect(r.desvios[0]).toEqual({
      block_index: 1,
      variant_id: "b2",
      rank: 2,
      motivo: "alterna o ritmo",
    })
    expect(r.forcedRank1).toEqual([])
  })

  it("aceita fences e prosa em volta", () => {
    const raw = "```json\n" + JSON.stringify([
      { block_index: 0, variant_id: "h2", rank: 2, motivo: "m" },
    ]) + "\n```"
    expect(decisionMap(parse(raw)).get(0)).toBe("h2")
  })

  // O rank do output é telemetria; a verdade é a posição no ranking.
  it("rank autodeclarado errado é corrigido pelo código", () => {
    const raw = JSON.stringify([
      { block_index: 0, variant_id: "h3", rank: 2, motivo: "m" },
    ])
    const r = parse(raw)
    expect(r.decisions[0].rank).toBe(3)
    expect(r.rankMismatch).toEqual([0])
  })

  it("rank ausente no output não é problema", () => {
    const raw = JSON.stringify([{ block_index: 0, variant_id: "h2", motivo: "m" }])
    const r = parse(raw)
    expect(r.decisions[0].rank).toBe(2)
    expect(r.rankMismatch).toEqual([])
  })

  it("id fora dos finalistas → cai no rank 1, registrado", () => {
    const raw = JSON.stringify([
      { block_index: 0, variant_id: "inventado", rank: 1 },
      { block_index: 1, variant_id: "b1", rank: 1 },
      { block_index: 2, variant_id: "f1", rank: 1 },
    ])
    const r = parse(raw)
    expect(decisionMap(r).get(0)).toBe("h1")
    expect(r.forcedRank1).toEqual([{ block_index: 0, reason: "not_finalist" }])
  })

  it("posição ausente no output → cai no rank 1, registrado", () => {
    const raw = JSON.stringify([{ block_index: 0, variant_id: "h2", rank: 2, motivo: "m" }])
    const r = parse(raw)
    expect(decisionMap(r)).toEqual(
      new Map([
        [0, "h2"],
        [1, "b1"],
        [2, "f1"],
      ]),
    )
    expect(r.forcedRank1).toEqual([
      { block_index: 1, reason: "missing" },
      { block_index: 2, reason: "missing" },
    ])
  })

  // Aqui o fallback é legítimo: o ranking do Curador JÁ é uma composição
  // válida. Diferente do Curador, onde falhar é melhor que inventar.
  it("JSON malformado → tudo no rank 1, sem derrubar", () => {
    const r = parse("desculpe, não consegui")
    expect(r.malformed).toBe(true)
    expect(decisionMap(r)).toEqual(
      new Map([
        [0, "h1"],
        [1, "b1"],
        [2, "f1"],
      ]),
    )
    expect(r.forcedRank1.map((f) => f.reason)).toEqual([
      "malformed",
      "malformed",
      "malformed",
    ])
    expect(r.desvios).toEqual([])
  })

  it("desvio sem motivo é aceito e registrado", () => {
    const raw = JSON.stringify([{ block_index: 0, variant_id: "h2", rank: 2 }])
    const r = parse(raw)
    expect(r.missingMotivo).toEqual([0])
    expect(r.desvios[0].motivo).toBeUndefined()
    expect(decisionMap(r).get(0)).toBe("h2")
  })

  it("motivo indevido no rank 1 é descartado e registrado", () => {
    const raw = JSON.stringify([
      { block_index: 0, variant_id: "h1", rank: 1, motivo: "justificando o óbvio" },
    ])
    const r = parse(raw)
    expect(r.extraMotivo).toEqual([0])
    expect(r.decisions[0].motivo).toBeUndefined()
    expect(r.desvios).toEqual([])
  })

  it("posição repetida no output → a primeira vale", () => {
    const raw = JSON.stringify([
      { block_index: 0, variant_id: "h2", rank: 2, motivo: "m" },
      { block_index: 0, variant_id: "h3", rank: 3, motivo: "m2" },
    ])
    expect(decisionMap(parse(raw)).get(0)).toBe("h2")
  })

  it("posição sem finalistas não entra nas decisões", () => {
    const r = parseAssemblerChoices({
      raw: JSON.stringify([{ block_index: 0, variant_id: "h1", rank: 1 }]),
      ranking: new Map([
        [0, [{ variant_id: "h1" }]],
        [1, []],
      ]),
    })
    expect(r.decisions).toHaveLength(1)
    expect(r.decisions[0].block_index).toBe(0)
  })

  it("decisões saem na ordem da estrutura", () => {
    const raw = JSON.stringify([
      { block_index: 2, variant_id: "f1", rank: 1 },
      { block_index: 0, variant_id: "h1", rank: 1 },
      { block_index: 1, variant_id: "b1", rank: 1 },
    ])
    expect(parse(raw).decisions.map((d) => d.block_index)).toEqual([0, 1, 2])
  })

  it("ignora entradas malformadas sem derrubar as boas", () => {
    const raw = JSON.stringify([
      null,
      "lixo",
      { variant_id: "h2" },
      { block_index: 0, variant_id: "h2", rank: 2, motivo: "m" },
    ])
    const r = parse(raw)
    expect(r.malformed).toBe(false)
    expect(decisionMap(r).get(0)).toBe("h2")
  })
})
