import { describe, expect, it } from "vitest"
import {
  buildStudioInstruction,
  isImageStudioFormat,
  MAX_STORE_SPEC_CHARS,
  MAX_VARIATIONS,
  normalizeStoreSpecs,
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

describe("normalizeStoreSpecs", () => {
  it("apara o texto e mantém só as lojas com adendo", () => {
    const out = normalizeStoreSpecs({
      "loja-a": { instruction: "  caixa de presente aberta  " },
      "loja-b": { instruction: "   " },
      "loja-c": {},
    })
    expect(out).toEqual({ "loja-a": { instruction: "caixa de presente aberta" } })
  })

  it("corta no teto e ignora entradas inválidas", () => {
    const out = normalizeStoreSpecs({
      "loja-a": { instruction: "x".repeat(5000) },
      "loja-b": "texto solto",
      "loja-c": null,
    })
    expect(out["loja-a"].instruction).toHaveLength(MAX_STORE_SPEC_CHARS)
    expect(out["loja-b"]).toBeUndefined()
    expect(out["loja-c"]).toBeUndefined()
  })

  it("valor não-objeto vira mapa vazio", () => {
    expect(normalizeStoreSpecs(undefined)).toEqual({})
    expect(normalizeStoreSpecs([{ instruction: "x" }])).toEqual({})
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

  it("adendo da loja entra DEPOIS da variação (mais específico por último)", () => {
    const out = buildStudioInstruction({
      instruction: "hero lifestyle",
      variationText: "VARIAÇÃO 1: close",
      flags: {},
      storeSpec: "usar a caixa de presente aberta",
    })
    const lines = out.split("\n")
    expect(lines).toEqual([
      "hero lifestyle",
      "VARIAÇÃO 1: close",
      "ESPECÍFICO DESTA LOJA: usar a caixa de presente aberta",
    ])
  })

  it("adendo vazio/ausente não emite a linha", () => {
    for (const storeSpec of [undefined, null, "   "]) {
      const out = buildStudioInstruction({
        instruction: "hero",
        variationText: "",
        flags: {},
        storeSpec,
      })
      expect(out).toBe("hero")
    }
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
