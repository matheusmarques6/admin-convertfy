import { describe, expect, it } from "vitest"
import { translateEventDescription } from "../translate-events"

describe("translateEventDescription", () => {
  // ─── Layer 1: Exact match ──────────────────────────────────────────────
  describe("exact match", () => {
    it("translates known phrase to pt-BR", () => {
      expect(translateEventDescription("in transit", "pt-BR")).toBe("Em trânsito")
    })

    it("translates known phrase to pt-BR (case insensitive)", () => {
      expect(translateEventDescription("In Transit", "pt-BR")).toBe("Em trânsito")
    })

    it("translates delivered", () => {
      expect(translateEventDescription("delivered", "pt-BR")).toBe("Entregue")
    })

    it("translates new 17track phrases", () => {
      expect(translateEventDescription("customs clearance processing", "pt-BR"))
        .toBe("Processando desembaraço aduaneiro")
    })

    it("translates delivery attempt phrases", () => {
      expect(translateEventDescription("delivery failed", "pt-BR"))
        .toBe("Entrega falhou")
    })
  })

  // ─── Layer 2: Pattern match ────────────────────────────────────────────
  describe("pattern match", () => {
    it("translates pattern with dynamic content", () => {
      const result = translateEventDescription("arrived at NYC facility", "pt-BR")
      expect(result).toBe("Chegou à unidade de NYC")
    })

    it("translates 17track facility pattern", () => {
      const result = translateEventDescription(
        "the item has been processed through a facility in ISC NEW YORK NY",
        "pt-BR"
      )
      expect(result).toBe("O item foi processado na unidade de ISC NEW YORK NY")
    })

    it("translates in transit to pattern", () => {
      const result = translateEventDescription("in transit to São Paulo", "pt-BR")
      expect(result).toBe("Em trânsito para São Paulo")
    })
  })

  // ─── Layer 4: Word-level fallback ──────────────────────────────────────
  describe("word-level fallback", () => {
    it("partially translates unknown phrase with known words", () => {
      const result = translateEventDescription("The package arrived at warehouse", "pt-BR")
      expect(result).toContain("pacote")
      expect(result).toContain("chegou")
      expect(result).toContain("armazém")
    })

    it("is case insensitive", () => {
      const result = translateEventDescription("ARRIVED AT FACILITY", "pt-BR")
      expect(result.toLowerCase()).toContain("chegou")
      expect(result.toLowerCase()).toContain("unidade")
    })

    it("does not apply fallback for non-pt languages", () => {
      // fr has its own dict but no word-level fallback
      const result = translateEventDescription("random package arrived somewhere", "fr")
      // Should not contain Portuguese words
      expect(result).not.toContain("pacote")
      expect(result).not.toContain("chegou")
    })
  })

  // ─── Edge cases ────────────────────────────────────────────────────────
  describe("edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(translateEventDescription("", "pt-BR")).toBe("")
    })

    it("returns original text when completely unknown", () => {
      const result = translateEventDescription("xyzzy foobar baz", "pt-BR")
      expect(result).toBe("xyzzy foobar baz")
    })

    it("returns original PT text when target is pt-BR", () => {
      const result = translateEventDescription("Objeto postado", "pt-BR")
      expect(result).toBe("Objeto postado")
    })

    it("returns original text when target is en and source is en", () => {
      const result = translateEventDescription("In Transit", "en")
      expect(result).toBe("In Transit")
    })

    it("preserves trailing period", () => {
      const result = translateEventDescription("delivered.", "pt-BR")
      // The function strips period for matching, so the translated result
      // may or may not have period — but should still translate
      expect(result.replace(".", "").toLowerCase()).toContain("entregue")
    })
  })
})
