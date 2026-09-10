import { describe, it, expect } from "vitest"

import { normalizarSecao, podeRepetir } from "./repeticao"

describe("podeRepetir", () => {
  // Decisão do dono, 10/09: a mesma variante NÃO se repete na peça, em
  // seção nenhuma. O caso que a motivou: a `body 3` nas posições 2 e 3 do
  // Welcome 1 da Hero Boxers — mesma anatomia, mesmos três selos, coladas.
  it("nenhuma seção repete a mesma variante", () => {
    for (const s of [
      "hero",
      "products",
      "body",
      "offer",
      "reviews",
      "cta",
      "footer",
      "header",
    ]) {
      expect(podeRepetir(s)).toBe(false)
    }
  })

  it("seção desconhecida ou vazia também não repete", () => {
    // O padrão inverteu junto: antes o desconhecido permitia.
    expect(podeRepetir("")).toBe(false)
    expect(podeRepetir("secao-nova-que-ninguem-cadastrou")).toBe(false)
  })

  it("normalizarSecao segue sendo a fonte única de caixa e espaço", () => {
    expect(normalizarSecao("  Body ")).toBe("body")
    expect(normalizarSecao(" HERO ")).toBe("hero")
  })
})
