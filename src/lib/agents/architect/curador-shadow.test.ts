import { describe, it, expect } from "vitest"

import {
  DEFAULT_CHOOSER_VAULT_SYSTEM,
  measureProtocolViolations,
  parseCuradorVaultOutput,
  rank1ByBlock,
} from "./curador-shadow"
import { buildAprendizadosBlock, renderUsageCounts } from "./curador-vault"
import type { CatalogVaultExtra } from "./catalog-builder"
import type { RankedChoice } from "./curator-ranking.parser"

const OUTPUT = `Aqui está:
{"estrutura":[{"section":"hero","papel":"entrega o cupom"},{"section":"reviews","papel":"prova de terceiro"}],
 "fio_narrativo":"cupom abre, prova fecha",
 "escolhas":[{"block_index":0,"escolhas":[{"variant_id":"a","motivo":"bate momento e objeção"}]},{"block_index":1,"escolhas":[{"variant_id":"b"}]}]}`

describe("parseCuradorVaultOutput", () => {
  it("extrai estrutura, fio e re-serializa as escolhas", () => {
    const p = parseCuradorVaultOutput(OUTPUT)
    expect(p?.estrutura.map((e) => e.section)).toEqual(["hero", "reviews"])
    expect(p?.estrutura[0].papel).toContain("cupom")
    expect(p?.fioNarrativo).toBe("cupom abre, prova fecha")
    expect(JSON.parse(p!.escolhasRaw)).toHaveLength(2)
  })
  it("JSON ilegível → null; campos ausentes degradam para vazios", () => {
    expect(parseCuradorVaultOutput("prosa sem json")).toBeNull()
    const p = parseCuradorVaultOutput('{"escolhas":[]}')
    expect(p?.estrutura).toEqual([])
    expect(p?.fioNarrativo).toBe("")
  })
})

describe("measureProtocolViolations", () => {
  const extras = new Map<string, CatalogVaultExtra>([
    ["v-veta", { slug: "hero-x", momento: [], momento_vetado: ["welcome-1"], convivencia: [] }],
    ["v-fora", { slug: "hero-y", momento: ["carrinho-abandonado"], momento_vetado: [], convivencia: [] }],
    ["v-ok", { slug: "hero-3", momento: ["welcome-1"], momento_vetado: [], convivencia: [] }],
    ["v-prova1", { slug: "reviews-1", momento: [], momento_vetado: [], convivencia: ["prova-social-nao-duplica-na-peca"] }],
    ["v-prova2", { slug: "reviews-5", momento: [], momento_vetado: [], convivencia: ["prova-social-nao-duplica-na-peca"] }],
  ])
  const sec = (pairs: Array<[number, string]>) => new Map(pairs)

  it("momento_vetado e momento positivo não declarado", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "v-veta"], [1, "v-fora"], [2, "v-ok"]]),
      extras,
      momento: "welcome-1",
      sectionByBlock: sec([[0, "hero"], [1, "body"], [2, "offer"]]),
    })
    expect(v.map((x) => x.tipo).sort()).toEqual(["momento_nao_declarado", "momento_vetado"])
  })

  it("hero dupla e variante repetida", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "v-ok"], [1, "v-ok"]]),
      extras,
      momento: "welcome-1",
      sectionByBlock: sec([[0, "hero"], [1, "hero"]]),
    })
    expect(v.some((x) => x.tipo === "hero_dupla")).toBe(true)
    expect(v.some((x) => x.tipo === "variante_repetida")).toBe(true)
  })

  it("convivência: mesmo slug em duas posições", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "v-prova1"], [1, "v-prova2"]]),
      extras,
      momento: null,
      sectionByBlock: sec([[0, "reviews"], [1, "reviews"]]),
    })
    expect(v.some((x) => x.tipo === "convivencia" && x.detalhe.includes("prova-social"))).toBe(true)
  })

  it("sem momento e sem extras → nada além do mecânico", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "desconhecida"]]),
      extras,
      momento: "welcome-1",
      sectionByBlock: sec([[0, "body"]]),
    })
    expect(v).toEqual([])
  })
})

describe("rank1ByBlock + blocos da fase 1", () => {
  it("pega o primeiro de cada posição", () => {
    const byBlock = new Map<number, RankedChoice[]>([
      [0, [{ variant_id: "a", motivo: "x" }, { variant_id: "b" }] as RankedChoice[]],
      [1, [] as RankedChoice[]],
    ])
    const r = rank1ByBlock(byBlock)
    expect(r.get(0)).toBe("a")
    expect(r.has(1)).toBe(false)
  })

  it("aprendizados e uso declaram ausência e presença", () => {
    expect(buildAprendizadosBlock([])).toContain("nenhum aprendizado")
    expect(buildAprendizadosBlock([{ slug: "um-cta-dominante", body: "Um CTA só." }])).toContain("um-cta-dominante")
    expect(renderUsageCounts(new Map())).toContain("sem histórico")
    const counts = new Map([["v1", 3]])
    const extras = new Map([["v1", { slug: "hero-3-cupom-de-captacao" }]])
    const bloco = renderUsageCounts(counts, extras)
    expect(bloco).toContain("hero-3-cupom-de-captacao: 3×")
    expect(bloco).toContain("MENOS usada")
  })

  it("o system do contrato ampliado carrega protocolo, estrutura e zero-elegíveis", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("{{protocolo}}")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("{{catalogo}}")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("fio_narrativo")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain('"estrutura"')
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("escolhas: []")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("O VAULT VENCE")
  })
})
