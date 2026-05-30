import { describe, it, expect } from "vitest"
import { deriveLogoStyle } from "./logo-style"

describe("deriveLogoStyle", () => {
  it("returns override when provided", () => {
    expect(
      deriveLogoStyle({
        fontHeading: "Inter",
        override: "minimalist symbol",
      }),
    ).toBe("minimalist symbol")
  })

  it("ignores empty/whitespace override", () => {
    expect(
      deriveLogoStyle({ fontHeading: "Playfair Display", override: " " }),
    ).toBe("bold display lettering")
  })

  it("detects serif", () => {
    expect(deriveLogoStyle({ fontHeading: "Playfair" })).toBe(
      "modern wordmark",
    )
    expect(deriveLogoStyle({ fontHeading: "Merriweather Serif" })).toBe(
      "classic monogram",
    )
  })

  it("detects slab serif", () => {
    expect(deriveLogoStyle({ fontHeading: "Roboto Slab" })).toBe(
      "classic monogram",
    )
  })

  it("detects mono", () => {
    expect(deriveLogoStyle({ fontHeading: "JetBrains Mono" })).toBe(
      "tech monospace",
    )
    expect(deriveLogoStyle({ fontHeading: "Courier New" })).toBe(
      "tech monospace",
    )
    expect(deriveLogoStyle({ fontHeading: "Consolas" })).toBe("tech monospace")
  })

  it("detects display/bold/impact/black", () => {
    expect(deriveLogoStyle({ fontHeading: "Bebas Display" })).toBe(
      "bold display lettering",
    )
    expect(deriveLogoStyle({ fontHeading: "Impact" })).toBe(
      "bold display lettering",
    )
    expect(deriveLogoStyle({ fontHeading: "Arial Black" })).toBe(
      "bold display lettering",
    )
  })

  it("falls back to modern wordmark for plain sans-serif", () => {
    expect(deriveLogoStyle({ fontHeading: "Inter" })).toBe("modern wordmark")
    expect(deriveLogoStyle({ fontHeading: "Roboto" })).toBe("modern wordmark")
  })

  it("falls back for null/undefined/empty", () => {
    expect(deriveLogoStyle({ fontHeading: null })).toBe("modern wordmark")
    expect(deriveLogoStyle({ fontHeading: undefined })).toBe("modern wordmark")
    expect(deriveLogoStyle({ fontHeading: "" })).toBe("modern wordmark")
    expect(deriveLogoStyle({})).toBe("modern wordmark")
  })

  it("is case-insensitive", () => {
    expect(deriveLogoStyle({ fontHeading: "MERRIWEATHER SERIF" })).toBe(
      "classic monogram",
    )
  })
})
