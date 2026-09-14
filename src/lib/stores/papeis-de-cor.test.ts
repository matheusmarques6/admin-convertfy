import { describe, expect, it } from "vitest"

import { PAPEIS_DE_COR, ehPapelDeCor, normalizarPaleta, normalizarPapel } from "./papeis-de-cor"

describe("papéis de cor", () => {
  it("normaliza legado capitalizado e com acento; fora do vocabulário vira sem papel", () => {
    expect(normalizarPapel("Principal")).toBe("principal")
    expect(normalizarPapel(" FUNDO ")).toBe("fundo")
    expect(normalizarPapel("Superfície")).toBe("superficie")
    expect(normalizarPapel("Secundário")).toBe("")
    expect(normalizarPapel(undefined)).toBe("")
    expect(normalizarPapel(42)).toBe("")
    expect(ehPapelDeCor("texto")).toBe(true)
    expect(ehPapelDeCor("Texto")).toBe(false)
    expect(PAPEIS_DE_COR).toHaveLength(5)
  })
})

describe("normalizarPaleta — uma principal, N secundárias", () => {
  it("a primeira primária vira a principal; a segunda desce para o topo das secundárias sem papel", () => {
    // Hero Boxers em 14/09: preto e branco, os dois como "Principal".
    const r = normalizarPaleta(
      [
        { hex: "#000000", name: "Nova cor", role: "Principal" },
        { hex: "#ffffff", name: "Nova cor", role: "Principal" },
      ],
      [{ hex: "#f4f4f4", name: "Apoio", role: "fundo" }],
    )
    expect(r.principal).toEqual([{ hex: "#000000", name: "Nova cor", role: "principal" }])
    expect(r.secundarias.map((c) => c.hex)).toEqual(["#ffffff", "#f4f4f4"])
    expect(r.secundarias.every((c) => c.role === "")).toBe(true)
    expect(r.movidas).toBe(1)
  })

  it("paleta vazia sai vazia — nunca inventa cor", () => {
    expect(normalizarPaleta([], [])).toEqual({ principal: [], secundarias: [], movidas: 0 })
    expect(normalizarPaleta()).toEqual({ principal: [], secundarias: [], movidas: 0 })
  })

  it("uma primária sem papel ganha o carimbo; hex e nome ficam intactos", () => {
    const r = normalizarPaleta([{ hex: "#123456", name: "Azul" }])
    expect(r.principal).toEqual([{ hex: "#123456", name: "Azul", role: "principal" }])
    expect(r.movidas).toBe(0)
  })

  it("é idempotente: normalizar o resultado não muda nada", () => {
    const uma = normalizarPaleta([{ hex: "#000" }, { hex: "#fff" }], [{ hex: "#ccc", role: "texto" }])
    const duas = normalizarPaleta(uma.principal, uma.secundarias)
    expect(duas.principal).toEqual(uma.principal)
    expect(duas.secundarias).toEqual(uma.secundarias)
    expect(duas.movidas).toBe(0)
  })
})
