import { describe, it, expect } from "vitest"

import { SECOES_UNICAS, normalizarSecao, podeRepetir } from "./repeticao"

describe("podeRepetir", () => {
  it("hero e products são as únicas seções fechadas", () => {
    expect(SECOES_UNICAS).toEqual(["hero", "products"])
    expect(podeRepetir("hero")).toBe(false)
    expect(podeRepetir("products")).toBe(false)
  })

  it("corpo, oferta, reviews, CTA e rodapé podem repetir", () => {
    for (const s of ["body", "offer", "reviews", "cta", "footer", "header"]) {
      expect(podeRepetir(s)).toBe(true)
    }
  })

  it("normaliza caixa e espaço antes de decidir", () => {
    expect(podeRepetir(" HERO ")).toBe(false)
    expect(podeRepetir("Products")).toBe(false)
    expect(normalizarSecao("  Body ")).toBe("body")
  })

  // O padrão é PERMITIR: inventar restrição sobre nome de seção que não
  // conhecemos foi exatamente o erro que este módulo desfaz.
  it("seção desconhecida ou vazia permite repetição", () => {
    expect(podeRepetir("")).toBe(true)
    expect(podeRepetir("secao-nova-que-ninguem-cadastrou")).toBe(true)
  })
})
