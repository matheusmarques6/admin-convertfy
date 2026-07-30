import { describe, it, expect } from "vitest"

import { userContent } from "./openrouter-invoke"

// A regra que protege TODAS as chamadas existentes: sem anexo, o corpo da
// request tem de ser byte a byte o de antes da story CM-8. Uma quebra aqui
// atinge hero, text_format, image_format, color_format, merge_verifier e o
// Curador/Montador de uma vez.
describe("userContent — sem anexo nada muda", () => {
  it("devolve a STRING crua, não um array de um item", () => {
    expect(userContent("<store>oi</store>")).toBe("<store>oi</store>")
  })

  it("lista vazia, undefined e lista só de vazios são o mesmo caso", () => {
    for (const imgs of [undefined, [], ["", "   "]]) {
      expect(userContent("texto", imgs)).toBe("texto")
    }
  })
})

describe("userContent — com anexo", () => {
  it("vira array multimodal no formato do qa-vision", () => {
    const out = userContent("descreva", ["https://a/1.png"])
    expect(out).toEqual([
      { type: "image_url", image_url: { url: "https://a/1.png" } },
      { type: "text", text: "descreva" },
    ])
  })

  // O texto fala "o exemplo anexado"; se ele viesse primeiro, a referência
  // apontaria para o vazio.
  it("as imagens vêm ANTES do texto", () => {
    const out = userContent("txt", ["https://a/1.png", "https://a/2.png"])
    expect(Array.isArray(out)).toBe(true)
    const parts = out as Array<{ type: string }>
    expect(parts.map((p) => p.type)).toEqual(["image_url", "image_url", "text"])
  })

  it("descarta as entradas vazias e mantém as boas", () => {
    const out = userContent("txt", ["", "https://a/1.png", "  "])
    expect(out).toEqual([
      { type: "image_url", image_url: { url: "https://a/1.png" } },
      { type: "text", text: "txt" },
    ])
  })
})
