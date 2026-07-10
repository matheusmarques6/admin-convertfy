import { describe, expect, it } from "vitest"
import {
  FONT_WHITELIST,
  buildGoogleFontsImport,
  findWhitelistFont,
  renderWhitelistForPrompt,
} from "./font-whitelist"

describe("font-whitelist", () => {
  it("toda entrada tem fallbackStack e googleParam válidos", () => {
    for (const f of FONT_WHITELIST) {
      expect(f.fallbackStack.length).toBeGreaterThan(0)
      expect(f.googleParam).toBe(f.family.replace(/ /g, "+"))
      expect(f.availableWeights.length).toBeGreaterThan(0)
    }
  })

  it("findWhitelistFont é case-insensitive e tolera aspas", () => {
    expect(findWhitelistFont("playfair display")?.family).toBe("Playfair Display")
    expect(findWhitelistFont("'Red Hat Display'")?.family).toBe("Red Hat Display")
    expect(findWhitelistFont('  "EB Garamond" ')?.family).toBe("EB Garamond")
    expect(findWhitelistFont("Comic Sans MS")).toBeNull()
    expect(findWhitelistFont("")).toBeNull()
  })

  it("buildGoogleFontsImport filtra weights indisponíveis e ordena", () => {
    const font = findWhitelistFont("Playfair Display")!
    const rule = buildGoogleFontsImport(font, [700, 400, 250, 800])
    expect(rule).toBe(
      "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;800&display=swap');",
    )
  })

  it("weights vazio → default 400;700", () => {
    const font = findWhitelistFont("Lora")!
    expect(buildGoogleFontsImport(font, [])).toContain("wght@400;700")
  })

  it("renderWhitelistForPrompt agrupa por tom e inclui todas as famílias", () => {
    const text = renderWhitelistForPrompt()
    for (const f of FONT_WHITELIST) {
      expect(text).toContain(f.family)
    }
    expect(text).toContain("Luxo")
  })
})
