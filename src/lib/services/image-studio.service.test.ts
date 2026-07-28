import { describe, expect, it } from "vitest"
import {
  buildStudioInstruction,
  isImageStudioFormat,
  MAX_VARIATIONS,
  normalizeVariations,
  variationDirective,
} from "./image-studio.service"

describe("normalizeVariations", () => {
  it("vazio/inválido vira [{}] (1 variação livre)", () => {
    expect(normalizeVariations(undefined)).toEqual([{}])
    expect(normalizeVariations([])).toEqual([{}])
    expect(normalizeVariations("x")).toEqual([{}])
  })

  it("apara strings e corta no teto de variações", () => {
    const out = normalizeVariations([
      { label: "  A  ", direction: "  close no produto  " },
      { direction: "" },
    ])
    expect(out).toEqual([
      { label: "A", direction: "close no produto" },
      { label: undefined, direction: "" },
    ])
    const many = normalizeVariations(Array.from({ length: 20 }, () => ({})))
    expect(many).toHaveLength(MAX_VARIATIONS)
  })
})

describe("variationDirective", () => {
  const vars = [{ direction: "fundo claro" }, {}, { direction: "close" }]

  it("com direção → prefixo VARIAÇÃO N + texto", () => {
    expect(variationDirective(vars, 0)).toBe("VARIAÇÃO 1: fundo claro")
    expect(variationDirective(vars, 2)).toBe("VARIAÇÃO 3: close")
  })

  it("sem direção em lote multi-variação → instrução de variação livre", () => {
    const out = variationDirective(vars, 1)
    expect(out).toContain("VARIAÇÃO 2 de 3")
    expect(out).toContain("DIFERENTE")
  })

  it("lote de 1 variação sem direção → vazio (sem ruído no prompt)", () => {
    expect(variationDirective([{}], 0)).toBe("")
  })
})

describe("buildStudioInstruction", () => {
  it("compõe instrução + variação + flags; ajuste lidera", () => {
    const out = buildStudioInstruction({
      instruction: "hero lifestyle",
      variationText: "VARIAÇÃO 2: close",
      flags: { cores: true, logo: true },
      adjustmentNotes: "fundo mais claro",
    })
    const lines = out.split("\n")
    expect(lines[0]).toContain("AJUSTE OBRIGATÓRIO")
    expect(lines[0]).toContain("fundo mais claro")
    expect(out).toContain("hero lifestyle")
    expect(out).toContain("VARIAÇÃO 2: close")
    expect(out).toContain("paleta de cores da marca")
    expect(out).toContain("estilo do logo da marca")
    expect(out).not.toContain("catálogo")
  })

  it("sem nada ligado → só a instrução", () => {
    expect(
      buildStudioInstruction({ instruction: "banner", variationText: "", flags: {} }),
    ).toBe("banner")
  })
})

describe("isImageStudioFormat", () => {
  it("aceita os 7 formatos e rejeita o resto", () => {
    for (const f of ["hero", "square", "story", "portrait", "landscape", "banner", "vertical"]) {
      expect(isImageStudioFormat(f)).toBe(true)
    }
    expect(isImageStudioFormat("gif")).toBe(false)
    expect(isImageStudioFormat(null)).toBe(false)
  })
})
