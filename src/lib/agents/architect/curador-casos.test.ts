/**
 * Os dois casos do diagnóstico vault × Advisor Max (09/09), como assert.
 *
 * `componentes/_casos-de-teste.md` descreve os casos em prosa e ninguém os
 * roda: um caso de teste que não é executado é documentação que envelhece.
 * Aqui eles viram fixtures sobre as três réguas puras que decidem o
 * desfecho de uma geração — a medição do protocolo, a conformação da
 * estrutura e a cobertura da montagem. Se uma régua regredir, o caso
 * reprova com o nome do caso, não com um número solto.
 *
 * Caso A (welcome-1): três heroes elegíveis, nenhuma com a objeção do alvo
 *   → o eixo `objecao` é NEUTRO (nada a preferir), a escolha vale pelos
 *   eixos seguintes, e a única violação medível é o aliviador ausente —
 *   que é uma LACUNA da biblioteca, não um erro do Curador.
 * Caso B (welcome-5): a única variante de body está inativa → zero
 *   elegíveis para a posição; a estrutura devolvida perde a posição, a
 *   montagem registra o buraco e SÓ recusa a peça se a hero faltar.
 */
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import { measureProtocolViolations } from "./curador-shadow"
import { conformarEstrutura } from "./curador-estrutura"
import { coberturaSuficiente, type AssembledStats } from "./assemble-document"
import type { CatalogVaultExtra } from "./catalog-builder"

const extra = (slug: string, over: Partial<CatalogVaultExtra> = {}): CatalogVaultExtra => ({
  slug,
  objecao: [],
  aliviador: [],
  convivencia: [],
  ...over,
})

const stats = (over: Partial<AssembledStats>): AssembledStats => ({
  blocks: 0,
  variants: 0,
  skipped: [],
  fontsNormalized: 0,
  weightsNormalized: 0,
  chars: 0,
  wrappedUnknown: [],
  unshelled: [],
  stylesInlined: 0,
  guttersNeutralized: [],
  expected: [],
  ...over,
} as AssembledStats)

describe("Caso A — welcome-1: nenhuma hero realiza o aliviador do alvo", () => {
  const extras = new Map<string, CatalogVaultExtra>([
    ["hero-3", extra("hero-3-cupom-de-captacao", { objecao: ["preco"], aliviador: ["entrega_de_incentivo"], exige_medicao: ["cupom-ativo"] })],
    ["hero-7", extra("hero-7-manifesto", { objecao: ["confianca"], aliviador: ["reputacao_da_marca"] })],
    ["hero-9", extra("hero-9-produto-heroi", { objecao: ["adequacao"], aliviador: ["demonstracao"] })],
    ["reviews-2", extra("reviews-2-tres-depoimentos", { objecao: ["confianca"], aliviador: ["prova_de_terceiro"] })],
    ["footer-1", extra("footer-1")],
  ])
  const sectionByBlock = new Map([[0, "hero"], [1, "reviews"], [2, "footer"]])
  const alvo = {
    aliviador_pedido: "reputacao_da_loja",
    proibicoes: ["Não inventar código, valor ou expiração de incentivo"],
    incentivo_existe: false,
  }

  it("com a hero de manifesto: só o aliviador ausente — lacuna da biblioteca, não erro de escolha", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "hero-7"], [1, "reviews-2"], [2, "footer-1"]]),
      extras,
      sectionByBlock,
      alvo,
    })
    expect(v.map((x) => x.tipo)).toEqual(["aliviador_ausente"])
    expect(v[0].detalhe).toContain("reputacao_da_loja")
    // block_index -1: não é de uma posição, é da biblioteca inteira.
    expect(v[0].block_index).toBe(-1)
  })

  it("com a hero de cupom: a proibição do toque × exige cupom-ativo é violação, além da lacuna", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "hero-3"], [1, "reviews-2"], [2, "footer-1"]]),
      extras,
      sectionByBlock,
      alvo,
    })
    const tipos = v.map((x) => x.tipo)
    expect(tipos).toContain("aliviador_ausente")
    expect(tipos).toContain("proibicao_violada")
    expect(v.find((x) => x.tipo === "proibicao_violada")?.detalhe).toContain("× exige cupom-ativo")
  })

  it("estrutura devolvida na ordem pedida conforma sem divergência", () => {
    const r = conformarEstrutura(
      [{ section: "hero" }, { section: "reviews" }, { section: "footer" }],
      [
        { section: "hero", papel: "apresenta a marca" },
        { section: "reviews", papel: "prova de terceiro" },
        { section: "footer", papel: "fecha" },
      ],
    )
    expect(r.conforme).toBe(true)
    expect(r.papeis).toEqual(["apresenta a marca", "prova de terceiro", "fecha"])
  })
})

describe("Caso B — welcome-5: a única body está inativa (zero elegíveis)", () => {
  it("estrutura devolvida sem a posição de body: divergência de contagem, papel da body vazio, sem inventar", () => {
    const r = conformarEstrutura(
      [{ section: "hero" }, { section: "body" }, { section: "footer" }],
      [
        { section: "hero", papel: "abre" },
        { section: "footer", papel: "fecha" },
      ],
    )
    expect(r.conforme).toBe(false)
    expect(r.divergencias.map((d) => d.motivo)).toContain("contagem")
    expect(r.papeis).toEqual(["abre", "", "fecha"])
  })

  it("posição de body sem variante: a peça entra POBRE — não é recusada porque a hero existe", () => {
    const r = coberturaSuficiente(
      stats({
        blocks: 2,
        variants: 2,
        expected: [{ block_index: 0, section: "hero" }, { block_index: 2, section: "footer" }],
        skipped: [{ block_index: 1, section: "body", label: "Corpo", reason: "no_variant" as never }],
      }),
    )
    expect(r.ok).toBe(true)
  })

  it("mas se a lacuna fosse na hero, a peça é recusada com as posições nomeadas", () => {
    const r = coberturaSuficiente(
      stats({
        blocks: 1,
        variants: 1,
        expected: [{ block_index: 2, section: "footer" }],
        skipped: [
          { block_index: 0, section: "hero", label: "Hero", reason: "no_variant" as never },
          { block_index: 1, section: "body", label: "Corpo", reason: "no_variant" as never },
        ],
      }),
    )
    expect(r.ok).toBe(false)
    expect(r.motivo).toContain("0:hero")
    expect(r.motivo).toContain("2 de 3 posições sem variante")
  })
})
