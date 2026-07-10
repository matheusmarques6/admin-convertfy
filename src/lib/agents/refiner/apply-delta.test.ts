import { describe, expect, it } from "vitest"
import {
  applyRefinerDelta,
  extractFontOccurrences,
  injectFontImport,
  type RefinerDelta,
} from "./apply-delta"
import { findWhitelistFont } from "./font-whitelist"

// Fixture table-based no shape real dos emails do pipeline.
const EMAIL = `<!DOCTYPE html><html><head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap');
  body { font-family: Arial, sans-serif; }
  @media screen and (max-width:600px) { .h1 { font-size: 34px !important; } }
</style>
</head>
<body>
<table width="600">
  <tr><td style="font-family:'Montserrat',Arial,sans-serif;font-size:48px;font-weight:bold;">RADIANTLYHERS</td></tr>
  <tr><td style="font-family:'Montserrat',Arial,sans-serif;font-size:18px;">Dresses that look expensive without the price.</td></tr>
  <tr><td><a href="https://store.com" style="font-family:'Montserrat',Arial,sans-serif;font-size:16px;">SHOP NOW</a></td></tr>
  <tr><td style="font-family:'Inter',Arial,sans-serif;font-size:11px;">© 2026 Radiantlyhers. Unsubscribe.</td></tr>
</table>
</body></html>`

describe("extractFontOccurrences", () => {
  it("inventaria só as ocorrências do body, indexadas na ordem", () => {
    const occ = extractFontOccurrences(EMAIL)
    // 4 no body — as 2 do <style> (base + media query) ficam de fora.
    expect(occ).toHaveLength(4)
    expect(occ.map((o) => o.index)).toEqual([0, 1, 2, 3])
    expect(occ[0].fontSizePx).toBe(48)
    expect(occ[0].textSnippet).toContain("RADIANTLYHERS")
    expect(occ[3].textSnippet).toContain("Unsubscribe")
  })
})

describe("applyRefinerDelta", () => {
  const font = findWhitelistFont("Playfair Display")!

  it("troca só os índices alvo; demais ocorrências ficam intactas", () => {
    const delta: RefinerDelta = {
      strategy: "serif_luxury",
      rationale: "luxo",
      display_font: { family: "Playfair Display", weights: [700] },
      targets: [{ index: 0, role: "brand_name", font_weight: 700, letter_spacing: "-1.5px" }],
    }
    const out = applyRefinerDelta(EMAIL, delta, font)
    expect(out).toContain(
      "font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-weight: 700; letter-spacing: -1.5px",
    )
    // O corpo (índice 1), o CTA (2) e o legal (3) NÃO mudam:
    expect(out).toContain(`font-family:'Montserrat',Arial,sans-serif;font-size:18px`)
    expect(out).toContain(`font-family:'Montserrat',Arial,sans-serif;font-size:16px`)
    expect(out).toContain(`font-family:'Inter',Arial,sans-serif;font-size:11px`)
    // <style> do head intocado:
    expect(out).toContain("body { font-family: Arial, sans-serif; }")
  })

  it("clampa letter-spacing fora da faixa [-3px, 2px]", () => {
    const delta: RefinerDelta = {
      strategy: "serif_luxury",
      rationale: "",
      display_font: { family: "Playfair Display", weights: [] },
      targets: [{ index: 0, role: "brand_name", letter_spacing: "-9px" }],
    }
    const out = applyRefinerDelta(EMAIL, delta, font)
    expect(out).toContain("letter-spacing: -3px")
  })

  it("mono_weight_contrast mantém a família e só muda o peso", () => {
    const delta: RefinerDelta = {
      strategy: "mono_weight_contrast",
      rationale: "",
      display_font: null,
      targets: [{ index: 0, role: "brand_name", font_weight: 200 }],
    }
    const out = applyRefinerDelta(EMAIL, delta, null)
    expect(out).toContain("font-family: 'Montserrat',Arial,sans-serif; font-weight: 200")
  })

  it("peso indisponível na fonte → mais próximo disponível", () => {
    const dmSerif = findWhitelistFont("DM Serif Display")! // só 400
    const delta: RefinerDelta = {
      strategy: "serif_luxury",
      rationale: "",
      display_font: { family: "DM Serif Display", weights: [400] },
      targets: [{ index: 0, role: "brand_name", font_weight: 800 }],
    }
    const out = applyRefinerDelta(EMAIL, delta, dmSerif)
    expect(out).toContain("font-weight: 400")
  })

  it("strategy none / targets vazio → HTML byte-a-byte igual", () => {
    const none: RefinerDelta = { strategy: "none", rationale: "", display_font: null, targets: [] }
    expect(applyRefinerDelta(EMAIL, none, null)).toBe(EMAIL)
  })
})

describe("injectFontImport", () => {
  const RULE =
    "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap');"

  it("injeta no primeiro <style> e é idempotente", () => {
    const once = injectFontImport(EMAIL, RULE)
    expect(once).toContain(RULE)
    expect(once.indexOf(RULE)).toBeLessThan(once.indexOf("Montserrat:wght"))
    expect(injectFontImport(once, RULE)).toBe(once)
  })

  it("sem <style> → cria antes do </head>", () => {
    const bare = "<!DOCTYPE html><html><head></head><body></body></html>"
    const out = injectFontImport(bare, RULE)
    expect(out).toContain(`<style>`)
    expect(out).toContain(RULE)
  })
})
