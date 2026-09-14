import { describe, expect, it } from "vitest"

import { PAPEIS_DE_COR, ehPapelDeCor, normalizarPapel, validarPaleta } from "./papeis-de-cor"

describe("papéis de cor (B5)", () => {
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

  it("uma principal por paleta — a 2ª (mesmo na secundária, mesmo capitalizada) reprova com os hex", () => {
    expect(validarPaleta([{ hex: "#000", role: "principal" }], [{ hex: "#fff", role: "fundo" }])).toEqual({ ok: true })
    const r = validarPaleta([{ hex: "#000000", role: "principal" }], [{ hex: "#FFFFFF", role: "Principal" }])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.codigo).toBe("paleta_dois_principais")
      expect(r.mensagem).toContain("#000000")
      expect(r.mensagem).toContain("#FFFFFF")
    }
    // Sem papel nenhum não é erro: a derivação por luminância cobre.
    expect(validarPaleta([{ hex: "#000" }, { hex: "#fff" }]).ok).toBe(true)
  })
})
