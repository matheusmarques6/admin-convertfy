import { describe, expect, it } from "vitest"
import { runRefinerGuards } from "./guards"
import type { RefinerDelta } from "./apply-delta"

const BEFORE = `<!DOCTYPE html><html><head><style>@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400&display=swap');</style></head>
<body><table><tr><td style="font-family:'Montserrat',Arial,sans-serif;">RADIANTLYHERS</td></tr>
<tr><td><a href="https://store.com/products/a">Shop</a> <img src="https://cdn/img.png"/></td></tr></table></body></html>`

// "After" legítimo: só a font-family + @import mudaram.
const AFTER_OK = BEFORE.replace(
  "font-family:'Montserrat',Arial,sans-serif;",
  "font-family: 'Playfair Display', Georgia, 'Times New Roman', serif;",
).replace(
  "<style>",
  "<style>@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap');",
)

const deltaSerif: RefinerDelta = {
  strategy: "serif_luxury",
  rationale: "",
  display_font: { family: "Playfair Display", weights: [700] },
  targets: [{ index: 0, role: "brand_name" }],
}
const OPTS = { currentFontHeading: "Montserrat", occurrenceCount: 1 }

describe("runRefinerGuards", () => {
  it("caso feliz passa", () => {
    const r = runRefinerGuards(BEFORE, AFTER_OK, deltaSerif, OPTS)
    expect(r.violations).toEqual([])
    expect(r.ok).toBe(true)
  })

  it("texto alterado reprova", () => {
    const bad = AFTER_OK.replace("RADIANTLYHERS", "OUTRA MARCA")
    const r = runRefinerGuards(BEFORE, bad, deltaSerif, OPTS)
    expect(r.violations).toContain("texto_alterado")
  })

  it("href removido/alterado reprova", () => {
    const bad = AFTER_OK.replace("https://store.com/products/a", "https://evil.com")
    expect(runRefinerGuards(BEFORE, bad, deltaSerif, OPTS).violations).toContain("hrefs_alterados")
  })

  it("img src trocado reprova", () => {
    const bad = AFTER_OK.replace("https://cdn/img.png", "https://cdn/outra.png")
    expect(runRefinerGuards(BEFORE, bad, deltaSerif, OPTS).violations).toContain("srcs_alterados")
  })

  it("fonte fora da whitelist reprova", () => {
    const delta = {
      ...deltaSerif,
      display_font: { family: "Comic Sans MS", weights: [] },
    }
    const r = runRefinerGuards(BEFORE, AFTER_OK, delta, OPTS)
    expect(r.violations.some((v) => v.startsWith("fonte_fora_da_whitelist"))).toBe(true)
  })

  it("fonte igual à da identidade reprova", () => {
    const delta = {
      ...deltaSerif,
      display_font: { family: "Playfair Display", weights: [] },
    }
    const r = runRefinerGuards(BEFORE, AFTER_OK, delta, {
      ...OPTS,
      currentFontHeading: "Playfair Display",
    })
    expect(r.violations.some((v) => v.startsWith("fonte_igual_identidade"))).toBe(true)
  })

  it("@import ausente reprova", () => {
    const semImport = BEFORE.replace(
      "font-family:'Montserrat',Arial,sans-serif;",
      "font-family: 'Playfair Display', Georgia, serif;",
    )
    const r = runRefinerGuards(BEFORE, semImport, deltaSerif, OPTS)
    expect(r.violations.some((v) => v.startsWith("import_ausente"))).toBe(true)
  })

  it("HTML truncado (sem </html>) reprova", () => {
    const truncated = AFTER_OK.slice(0, AFTER_OK.length - 20)
    expect(runRefinerGuards(BEFORE, truncated, deltaSerif, OPTS).violations).toContain(
      "html_incompleto",
    )
  })

  it("tamanho fora da faixa reprova (anti-regeneração; folga absoluta de 2KB)", () => {
    // Crescimento acima de 30% + 2KB (injetado ANTES do </html> pra isolar o guard)
    const bloated = AFTER_OK.replace("</html>", `<!--${"x".repeat(6000)}--></html>`)
    const r = runRefinerGuards(BEFORE, bloated, deltaSerif, OPTS)
    expect(r.violations.some((v) => v.startsWith("tamanho_fora_da_faixa"))).toBe(true)
    // Encolhimento >30% também reprova (sem folga)
    const shrunk = "<!DOCTYPE html><html><body>x</body></html>"
    const r2 = runRefinerGuards(BEFORE, shrunk, deltaSerif, OPTS)
    expect(r2.violations.some((v) => v.startsWith("tamanho_fora_da_faixa"))).toBe(true)
  })

  it("índice fora do range / targets demais reprovam", () => {
    const badIdx = { ...deltaSerif, targets: [{ index: 7, role: "brand_name" as const }] }
    expect(
      runRefinerGuards(BEFORE, AFTER_OK, badIdx, OPTS).violations.some((v) =>
        v.startsWith("target_index_fora_do_range"),
      ),
    ).toBe(true)

    const tooMany = {
      ...deltaSerif,
      targets: Array.from({ length: 13 }, (_, i) => ({ index: 0, role: "price" as const, _i: i })),
    }
    expect(
      runRefinerGuards(BEFORE, AFTER_OK, tooMany, OPTS).violations.some((v) =>
        v.startsWith("targets_excede_teto"),
      ),
    ).toBe(true)
  })

  it("mono_weight_contrast não exige whitelist/import", () => {
    const mono: RefinerDelta = {
      strategy: "mono_weight_contrast",
      rationale: "",
      display_font: null,
      targets: [{ index: 0, role: "brand_name", font_weight: 200 }],
    }
    const after = BEFORE.replace(
      "font-family:'Montserrat',Arial,sans-serif;",
      "font-family: 'Montserrat',Arial,sans-serif; font-weight: 200;",
    )
    expect(runRefinerGuards(BEFORE, after, mono, OPTS).ok).toBe(true)
  })
})
