import { describe, expect, it } from "vitest"

import { embeddingInput, lotesPorOrcamento } from "./knowledge-embeddings"

const texto = (n: number) => "a".repeat(n)

describe("lotesPorOrcamento", () => {
  // O defeito medido em 15/09: `BATCH = 32` fixo mandava até 32 notas de
  // 16k num POST só — 512k chars —, e o limite do endpoint é por CHAMADA.
  // O lote inteiro era recusado, inclusive as notas pequenas que viajavam
  // com as grandes.
  it("fecha o lote quando o orçamento de caracteres estoura", () => {
    const lotes = lotesPorOrcamento([texto(40_000), texto(30_000), texto(10_000)], 60_000, 32)
    expect(lotes).toEqual([[0], [1, 2]])
  })

  it("respeita também o teto de itens, para lote de notas curtas", () => {
    const lotes = lotesPorOrcamento(Array.from({ length: 5 }, () => texto(10)), 60_000, 2)
    expect(lotes).toEqual([[0, 1], [2, 3], [4]])
  })

  // Descartar aqui repetiria em silêncio o defeito que a função desfaz: a
  // nota nunca entraria na busca. Ela vai sozinha e, se o provedor a
  // recusar, a causa aparece por nota.
  it("item maior que o orçamento vai SOZINHO, não é descartado", () => {
    const lotes = lotesPorOrcamento([texto(10), texto(200_000), texto(10)], 60_000, 32)
    expect(lotes).toEqual([[0], [1], [2]])
    expect(lotes.flat()).toHaveLength(3)
  })

  it("devolve ÍNDICES — é o que casa o vetor com a linha do banco", () => {
    const lotes = lotesPorOrcamento([texto(10), texto(10)], 60_000, 32)
    expect(lotes).toEqual([[0, 1]])
  })

  it("lista vazia não inventa lote", () => {
    expect(lotesPorOrcamento([], 60_000, 32)).toEqual([])
  })

  it("nenhum item se perde, qualquer que seja o recorte", () => {
    const textos = Array.from({ length: 37 }, (_, i) => texto(1_000 + i * 700))
    const lotes = lotesPorOrcamento(textos)
    expect(lotes.flat().sort((a, b) => a - b)).toEqual(textos.map((_, i) => i))
  })
})

describe("embeddingInput", () => {
  // As 5 notas sem vetor em 15/09 tinham 12k a 43,4k chars. O teto de
  // 24.000 dizia ter "folga" para os 8.192 tokens do modelo — em
  // português acentuado a régua é ~3 chars/token, então 24k ficavam
  // colados no limite.
  it("corta a nota gigante num tamanho com folga real", () => {
    const entrada = embeddingInput({ title: "T", tags: [], body: texto(43_444) })
    expect(entrada.length).toBeLessThanOrEqual(16_000)
    // ~3 chars/token no pior caso: continua bem abaixo dos 8.192.
    expect(entrada.length / 3).toBeLessThan(8_192)
  })

  it("nota pequena passa inteira, com título e tags no texto do vetor", () => {
    const entrada = embeddingInput({ title: "Autoria", tags: ["copy", "voz"], body: "corpo" })
    expect(entrada).toContain("Autoria")
    expect(entrada).toContain("#copy")
    expect(entrada).toContain("corpo")
  })
})
