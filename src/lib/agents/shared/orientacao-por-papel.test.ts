import { describe, expect, it } from "vitest"

import { orientacaoDeRedacao, orientacaoParaCampo, papelDeRedacao } from "./orientacao-por-papel"

describe("papelDeRedacao", () => {
  it("as partes que o e-mail tem de verdade, pelas chaves da biblioteca", () => {
    expect(papelDeRedacao("hero_headline", "text_short")).toBe("headline")
    expect(papelDeRedacao("hero_subhead", "text_short")).toBe("subhead")
    expect(papelDeRedacao("body_paragraph", "text_long")).toBe("corpo")
    expect(papelDeRedacao("hero_cta_label", "text_short")).toBe("cta")
    expect(papelDeRedacao("product_1_cta_label", "text_short")).toBe("cta")
    expect(papelDeRedacao("review_1_quote", "text_long")).toBe("depoimento")
    expect(papelDeRedacao("coupon_note", "text_short")).toBe("microcopy")
  })

  // Título de card é lido em paralelo com os irmãos, não como manchete.
  it("título dentro de uma grade é ITEM, não headline", () => {
    expect(papelDeRedacao("product_2_title", "text_short")).toBe("item")
    expect(papelDeRedacao("feature_3_title", "text_short")).toBe("item")
    expect(papelDeRedacao("headline", "text_short")).toBe("headline")
  })

  it("campo que é DADO não recebe régua de estilo", () => {
    expect(papelDeRedacao("product_1_price", "text_short")).toBeNull()
    expect(papelDeRedacao("coupon_code", "text_short")).toBeNull()
    expect(papelDeRedacao("review_1_name", "text_short")).toBeNull()
    expect(papelDeRedacao("review_1_rating", "text_short")).toBeNull()
  })

  it("campo que não é texto não tem papel de redação", () => {
    expect(papelDeRedacao("hero_image", "image")).toBeNull()
    expect(papelDeRedacao("product_1_url", "url")).toBeNull()
  })

  // Palpite servido como regra é pior que silêncio: o modelo obedece igual.
  it("chave que ninguém classifica devolve null, nunca uma régua genérica", () => {
    expect(papelDeRedacao("zzz_algo_novo", "text_short")).toBeNull()
    expect(orientacaoParaCampo("zzz_algo_novo", "text_short")).toBeNull()
    expect(papelDeRedacao("", "text_short")).toBeNull()
  })
})

describe("orientacaoDeRedacao", () => {
  it("cada papel tem uma régua própria — CTA e corpo não recebem a mesma", () => {
    const cta = orientacaoParaCampo("hero_cta_label", "text_short")
    const corpo = orientacaoParaCampo("body_paragraph", "text_long")
    expect(cta).toBeTruthy()
    expect(corpo).toBeTruthy()
    expect(cta).not.toBe(corpo)
    expect(cta).toMatch(/2 a 4 palavras/)
  })

  it("assunto e preheader são pedidos pelo papel — não vêm de output_schema", () => {
    expect(orientacaoDeRedacao("assunto")).toMatch(/55 caracteres/)
    expect(orientacaoDeRedacao("assunto")).toMatch(/não começa pelo código/i)
    expect(orientacaoDeRedacao("preheader")).toMatch(/nunca o repete/)
  })

  it("papel nulo devolve nulo", () => {
    expect(orientacaoDeRedacao(null)).toBeNull()
  })
})
