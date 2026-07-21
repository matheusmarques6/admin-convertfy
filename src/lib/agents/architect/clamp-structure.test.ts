import { describe, it, expect } from "vitest"
import { clampStructure, type OutlineSection } from "./outline-sections"

const sec = (section: string): OutlineSection => ({ section, label: section })

const WELCOME: OutlineSection[] = [
  "header",
  "hero",
  "body",
  "products",
  "reviews",
  "cta",
  "offer",
  "footer",
].map(sec)

describe("clampStructure", () => {
  it("não altera quando já cabe no limite", () => {
    expect(clampStructure(WELCOME, 8)).toEqual(WELCOME)
    expect(clampStructure(WELCOME, 20)).toEqual(WELCOME)
  })

  it("preserva header (abertura) e footer ao aparar o miolo", () => {
    const out = clampStructure(WELCOME, 6)
    expect(out).toHaveLength(6)
    expect(out[0].section).toBe("header")
    // O footer NUNCA é cortado (compliance/descadastro).
    expect(out[out.length - 1].section).toBe("footer")
    // Aparou o miolo pelo fim (offer/cta antes do footer saíram).
    expect(out.map((s) => s.section)).toEqual([
      "header",
      "hero",
      "body",
      "products",
      "reviews",
      "footer",
    ])
  })

  it("mantém o footer mesmo com limite mínimo", () => {
    const out = clampStructure(WELCOME, 3)
    expect(out.map((s) => s.section)).toEqual(["header", "hero", "footer"])
  })

  it("sem footer no fim, apara a cauda normalmente", () => {
    const noFooter = ["header", "hero", "body", "products", "cta"].map(sec)
    const out = clampStructure(noFooter, 3)
    expect(out.map((s) => s.section)).toEqual(["header", "hero", "body"])
  })

  it("limite inválido (<1) não altera a estrutura", () => {
    expect(clampStructure(WELCOME, 0)).toEqual(WELCOME)
    expect(clampStructure(WELCOME, -2)).toEqual(WELCOME)
  })
})
