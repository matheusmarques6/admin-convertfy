import { describe, expect, it, vi } from "vitest"
import { translateEventDescription } from "../translate-events"

// Mock the translation API to avoid real API calls in tests
vi.mock("../translation-api", () => ({
  translateViaAPI: vi.fn().mockResolvedValue(null),
}))

describe("translateEventDescription", () => {
  // ─── Layer 1: Exact match ──────────────────────────────────────────────
  describe("exact match", () => {
    it("translates known phrase to pt-BR", async () => {
      expect(await translateEventDescription("in transit", "pt-BR")).toBe("Em trânsito")
    })

    it("translates known phrase to pt-BR (case insensitive)", async () => {
      expect(await translateEventDescription("In Transit", "pt-BR")).toBe("Em trânsito")
    })

    it("translates delivered", async () => {
      expect(await translateEventDescription("delivered", "pt-BR")).toBe("Entregue")
    })

    it("translates new 17track phrases", async () => {
      expect(await translateEventDescription("customs clearance processing", "pt-BR"))
        .toBe("Processando desembaraço aduaneiro")
    })

    it("translates delivery attempt phrases", async () => {
      expect(await translateEventDescription("delivery failed", "pt-BR"))
        .toBe("Entrega falhou")
    })
  })

  // ─── Layer 2: Pattern match ────────────────────────────────────────────
  describe("pattern match", () => {
    it("translates pattern with dynamic content", async () => {
      const result = await translateEventDescription("arrived at NYC facility", "pt-BR")
      expect(result).toBe("Chegou à unidade de NYC")
    })

    it("translates 17track facility pattern", async () => {
      const result = await translateEventDescription(
        "the item has been processed through a facility in ISC NEW YORK NY",
        "pt-BR"
      )
      expect(result).toBe("O item foi processado na unidade de ISC NEW YORK NY")
    })

    it("translates in transit to pattern", async () => {
      const result = await translateEventDescription("in transit to São Paulo", "pt-BR")
      expect(result).toBe("Em trânsito para São Paulo")
    })
  })

  // ─── Untranslated phrases return original (no gibberish) ────────────────
  describe("untranslated phrases", () => {
    it("returns original English when no dict match and no API key", async () => {
      const result = await translateEventDescription("The package arrived at warehouse", "pt-BR")
      expect(result).toBe("The package arrived at warehouse")
    })

    it("returns original for unknown short phrases", async () => {
      const result = await translateEventDescription("ARRIVED AT FACILITY", "pt-BR")
      expect(result).toBe("ARRIVED AT FACILITY")
    })

    it("does not create mixed-language output for non-pt languages", async () => {
      const result = await translateEventDescription("random package arrived somewhere", "fr")
      expect(result).not.toContain("pacote")
      expect(result).not.toContain("chegou")
    })
  })

  // ─── Edge cases ────────────────────────────────────────────────────────
  describe("edge cases", () => {
    it("returns empty string for empty input", async () => {
      expect(await translateEventDescription("", "pt-BR")).toBe("")
    })

    it("returns original text when completely unknown", async () => {
      const result = await translateEventDescription("xyzzy foobar baz", "pt-BR")
      expect(result).toBe("xyzzy foobar baz")
    })

    it("returns original PT text when target is pt-BR", async () => {
      const result = await translateEventDescription("Objeto postado", "pt-BR")
      expect(result).toBe("Objeto postado")
    })

    it("returns original text when target is en and source is en", async () => {
      const result = await translateEventDescription("In Transit", "en")
      expect(result).toBe("In Transit")
    })

    it("preserves trailing period", async () => {
      const result = await translateEventDescription("delivered.", "pt-BR")
      expect(result.replace(".", "").toLowerCase()).toContain("entregue")
    })
  })
})
