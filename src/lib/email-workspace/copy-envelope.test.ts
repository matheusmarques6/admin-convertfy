import { describe, it, expect } from "vitest"
import { normalizeCopyEnvelope } from "./copy-envelope"

describe("normalizeCopyEnvelope", () => {
  // Caso REAL (Luxe Lift, 12/08): a copy estava completa e correta, com as
  // chaves exatas do contrato, embrulhada em `campos`.
  it("desembrulha {campos:[{key,valor}]} — o formato que quebrou a geração", () => {
    const { content, report } = normalizeCopyEnvelope({
      campos: [
        { key: "hero_headline", valor: "We saved it for you" },
        { key: "hero_cta_label", valor: "BACK TO MY CART" },
      ],
    })
    expect(content).toEqual({
      hero_headline: "We saved it for you",
      hero_cta_label: "BACK TO MY CART",
    })
    expect(report.wrapper).toBe("campos")
    expect(report.unwrapped).toEqual(["hero_headline", "hero_cta_label"])
  })

  it("aceita os apelidos do valor e o embrulho `fields`", () => {
    expect(
      normalizeCopyEnvelope({ fields: [{ key: "a", value: "1" }] }).content,
    ).toEqual({ a: "1" })
    expect(
      normalizeCopyEnvelope({ campos: [{ key: "b", content: "2" }] }).content,
    ).toEqual({ b: "2" })
  })

  it("aceita embrulho em forma de mapa", () => {
    const { content, report } = normalizeCopyEnvelope({
      campos: { section_headline: "Buy 1, Walk Away With 4 Bras" },
    })
    expect(content).toEqual({ section_headline: "Buy 1, Walk Away With 4 Bras" })
    expect(report.wrapper).toBe("campos")
  })

  // O agente de imagem grava image_url/image_alt DEPOIS da copy. Um embrulho
  // que repetisse a chave não pode desfazer isso.
  it("o primeiro nível vence o embrulho", () => {
    const { content } = normalizeCopyEnvelope({
      campos: [
        { key: "image_url", valor: "https://antigo" },
        { key: "hero_headline", valor: "ok" },
      ],
      image_url: "https://novo",
      image_alt: "alt",
    })
    expect(content).toEqual({
      hero_headline: "ok",
      image_url: "https://novo",
      image_alt: "alt",
    })
  })

  it("formato plano — o contrato — passa intacto", () => {
    const plano = { hero_headline: "x", hero_subhead: "y" }
    const { content, report } = normalizeCopyEnvelope(plano)
    expect(content).toEqual(plano)
    expect(report.wrapper).toBeNull()
    expect(report.unwrapped).toEqual([])
  })

  it("objeto vazio e entrada inválida não viram exceção", () => {
    expect(normalizeCopyEnvelope({}).content).toEqual({})
    expect(normalizeCopyEnvelope(null).content).toEqual({})
    expect(normalizeCopyEnvelope("texto").content).toEqual({})
    expect(normalizeCopyEnvelope([1, 2]).content).toEqual({})
  })

  it("descarta item sem key e sem valor, mantém o resto do lote", () => {
    const { content, report } = normalizeCopyEnvelope({
      campos: [
        { key: "", valor: "sem chave" },
        { valor: "sem key nenhuma" },
        { key: "vazio" },
        { key: "bom", valor: "fica" },
      ],
    })
    expect(content).toEqual({ bom: "fica" })
    expect(report.unwrapped).toEqual(["bom"])
  })

  // `campos` escalar não é envelope. Deixar o bloco como está faz o callback
  // registrar o desvio, em vez de a gente inventar um formato.
  it("campos escalar não é tratado como envelope", () => {
    const entrada = { campos: "3 campos", headline: "x" }
    const { content, report } = normalizeCopyEnvelope(entrada)
    expect(content).toEqual(entrada)
    expect(report.wrapper).toBeNull()
  })

  it("preserva valor não-string (número, booleano, objeto)", () => {
    const { content } = normalizeCopyEnvelope({
      campos: [
        { key: "qtd", valor: 3 },
        { key: "ativo", valor: false },
        { key: "obj", valor: { a: 1 } },
      ],
    })
    expect(content).toEqual({ qtd: 3, ativo: false, obj: { a: 1 } })
  })
})
