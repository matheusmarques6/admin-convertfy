import { describe, it, expect, vi } from "vitest"

// Isola o I/O: a cadeia de imports puxa createAdminClient via llm-invoke
// (só `extractJson`, que é puro, é usado aqui).
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import {
  parseCuratorRanking,
  rankingIds,
  type ParsedRanking,
} from "./curator-ranking.parser"

const SECTIONS = ["hero", "body", "footer"]
const TYPES = new Map<string, string>([
  ["h1", "hero"],
  ["h2", "hero"],
  ["h3", "hero"],
  ["h4", "hero"],
  ["b1", "body"],
  ["b2", "body"],
  ["f1", "footer"],
])

const parse = (raw: string, sections = SECTIONS): ParsedRanking =>
  parseCuratorRanking({ raw, sections, typeIndex: TYPES })

const ok = JSON.stringify([
  {
    block_index: 0,
    escolhas: [
      { variant_id: "h1", motivo: "faixa escura combina com o premium" },
      { variant_id: "h2" },
      { variant_id: "h3" },
    ],
  },
  { block_index: 1, escolhas: [{ variant_id: "b1", motivo: "x" }, { variant_id: "b2" }] },
  { block_index: 2, escolhas: [{ variant_id: "f1" }] },
])

describe("parseCuratorRanking", () => {
  it("lê o ranking na ordem de preferência", () => {
    const r = parse(ok)
    expect(r.malformed).toBe(false)
    expect(rankingIds(r)).toEqual({
      0: ["h1", "h2", "h3"],
      1: ["b1", "b2"],
      2: ["f1"],
    })
    expect(r.byBlock.get(0)![0].motivo).toContain("premium")
    expect(r.byBlock.get(0)![1].motivo).toBeUndefined()
    expect(r.emptyBlocks).toEqual([])
  })

  it("aceita fences e prosa em volta", () => {
    const r = parse("Claro! Aqui vai:\n```json\n" + ok + "\n```\nEspero que ajude.")
    expect(r.malformed).toBe(false)
    expect(rankingIds(r)[0]).toEqual(["h1", "h2", "h3"])
  })

  it("corta em 3 por posição", () => {
    const raw = JSON.stringify([
      {
        block_index: 0,
        escolhas: [
          { variant_id: "h1" },
          { variant_id: "h2" },
          { variant_id: "h3" },
          { variant_id: "h4" },
        ],
      },
    ])
    expect(rankingIds(parse(raw))[0]).toEqual(["h1", "h2", "h3"])
  })

  it("menos de 3 elegíveis → devolve o que houver", () => {
    const raw = JSON.stringify([{ block_index: 0, escolhas: [{ variant_id: "h1" }] }])
    expect(rankingIds(parse(raw))[0]).toEqual(["h1"])
  })

  it("id inexistente no catálogo → descartado e registrado", () => {
    const raw = JSON.stringify([
      { block_index: 0, escolhas: [{ variant_id: "inventado" }, { variant_id: "h1" }] },
    ])
    const r = parse(raw)
    expect(r.invalidIds).toEqual(["inventado"])
    expect(rankingIds(r)[0]).toEqual(["h1"])
  })

  // O catálogo vai INTEIRO no prompt: nada impede o modelo de indicar
  // variante de outra seção para a posição — e a escolha VALE. Descartá-la
  // deixava a posição vazia quando era a única, e o email saía sem o bloco
  // (incidente Innova, 27/08: duas `offer` escolhidas para uma posição de
  // `body`, as duas jogadas fora, posição perdida).
  it("id de outra seção é ACEITO e a troca de forma fica registrada", () => {
    const raw = JSON.stringify([
      { block_index: 0, escolhas: [{ variant_id: "b1" }, { variant_id: "h1" }] },
    ])
    const r = parse(raw)
    expect(r.retypedChoices).toEqual([
      { block_index: 0, variant_id: "b1", from: "hero", to: "body" },
    ])
    expect(rankingIds(r)[0]).toEqual(["b1", "h1"])
    expect(r.emptyBlocks).not.toContain(0)
  })

  it("posição SÓ com escolha de outra seção não fica vazia", () => {
    const raw = JSON.stringify([
      { block_index: 0, escolhas: [{ variant_id: "b1" }] },
    ])
    const r = parse(raw)
    expect(rankingIds(r)[0]).toEqual(["b1"])
    expect(r.emptyBlocks).not.toContain(0)
  })

  it("block_index fora da estrutura → ignorado e registrado", () => {
    const raw = JSON.stringify([
      { block_index: 9, escolhas: [{ variant_id: "h1" }] },
      { block_index: 0, escolhas: [{ variant_id: "h1" }] },
    ])
    const r = parse(raw)
    expect(r.unknownBlocks).toEqual([9])
    expect(r.byBlock.has(9)).toBe(false)
    expect(rankingIds(r)[0]).toEqual(["h1"])
  })

  it("duplicata na mesma posição → mantém a primeira", () => {
    const raw = JSON.stringify([
      {
        block_index: 0,
        escolhas: [{ variant_id: "h1" }, { variant_id: "h1" }, { variant_id: "h2" }],
      },
    ])
    const r = parse(raw)
    expect(r.duplicateIds).toEqual(["h1"])
    expect(rankingIds(r)[0]).toEqual(["h1", "h2"])
  })

  it("posição repetida no output → a primeira vale", () => {
    const raw = JSON.stringify([
      { block_index: 0, escolhas: [{ variant_id: "h1" }] },
      { block_index: 0, escolhas: [{ variant_id: "h2" }] },
    ])
    expect(rankingIds(parse(raw))[0]).toEqual(["h1"])
  })

  it("posição sem id válido → entra em emptyBlocks", () => {
    const raw = JSON.stringify([
      { block_index: 0, escolhas: [{ variant_id: "h1" }] },
      { block_index: 1, escolhas: [{ variant_id: "inventado" }] },
    ])
    const r = parse(raw)
    expect(r.emptyBlocks).toEqual([1, 2])
    expect(r.byBlock.has(1)).toBe(false)
  })

  it("JSON truncado → malformed, todas as posições vazias", () => {
    const r = parse('[{"block_index":0,"escolhas":[{"variant_id":"h1"')
    expect(r.malformed).toBe(true)
    expect(r.emptyBlocks).toEqual([0, 1, 2])
  })

  it("JSON válido mas não-array → malformed", () => {
    const r = parse('{"block_index":0}')
    expect(r.malformed).toBe(true)
  })

  it("output vazio → malformed", () => {
    expect(parse("").malformed).toBe(true)
  })

  it("tolera escolha como string crua do id", () => {
    const raw = JSON.stringify([{ block_index: 0, escolhas: ["h1", "h2"] }])
    expect(rankingIds(parse(raw))[0]).toEqual(["h1", "h2"])
  })

  it("ignora entradas malformadas sem derrubar as boas", () => {
    const raw = JSON.stringify([
      null,
      "lixo",
      { escolhas: [{ variant_id: "h1" }] }, // sem block_index
      { block_index: 1.5, escolhas: [{ variant_id: "b1" }] }, // não-inteiro
      { block_index: 0, escolhas: [{ variant_id: "h1" }] },
    ])
    const r = parse(raw)
    expect(r.malformed).toBe(false)
    expect(rankingIds(r)).toEqual({ 0: ["h1"] })
  })

  it("motivo vazio ou não-string é ignorado", () => {
    const raw = JSON.stringify([
      { block_index: 0, escolhas: [{ variant_id: "h1", motivo: "   " }] },
      { block_index: 1, escolhas: [{ variant_id: "b1", motivo: 42 }] },
    ])
    const r = parse(raw)
    expect(r.byBlock.get(0)![0].motivo).toBeUndefined()
    expect(r.byBlock.get(1)![0].motivo).toBeUndefined()
  })
})
