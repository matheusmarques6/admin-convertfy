import { describe, expect, it } from "vitest"
import { runRefinerGuards } from "./guards"
import {
  NONE_SHAPES,
  NONE_SPACING,
  NONE_TYPOGRAPHY,
} from "./apply-delta"
import type { RefinerDelta, RefinerDeltaV2 } from "./apply-delta"

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

const serifTypography: RefinerDelta = {
  strategy: "serif_luxury",
  rationale: "",
  display_font: { family: "Playfair Display", weights: [700] },
  targets: [{ index: 0, role: "brand_name" }],
}

const v2 = (partial: Partial<RefinerDeltaV2>): RefinerDeltaV2 => ({
  typography: NONE_TYPOGRAPHY,
  shapes: NONE_SHAPES,
  spacing: NONE_SPACING,
  ...partial,
})

const deltaSerif = v2({ typography: serifTypography })
const OPTS = {
  currentFontHeading: "Montserrat",
  occurrenceCount: 1,
  radiusOccurrenceCount: 2,
  spacingOccurrenceCount: 3,
  junctionCount: 2,
}

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
    const delta = v2({
      typography: {
        ...serifTypography,
        display_font: { family: "Comic Sans MS", weights: [] },
      },
    })
    const r = runRefinerGuards(BEFORE, AFTER_OK, delta, OPTS)
    expect(r.violations.some((v) => v.startsWith("fonte_fora_da_whitelist"))).toBe(true)
  })

  it("fonte igual à da identidade reprova", () => {
    const r = runRefinerGuards(BEFORE, AFTER_OK, deltaSerif, {
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
    const badIdx = v2({
      typography: { ...serifTypography, targets: [{ index: 7, role: "brand_name" as const }] },
    })
    expect(
      runRefinerGuards(BEFORE, AFTER_OK, badIdx, OPTS).violations.some((v) =>
        v.startsWith("target_index_fora_do_range"),
      ),
    ).toBe(true)

    const tooMany = v2({
      typography: {
        ...serifTypography,
        targets: Array.from({ length: 13 }, () => ({ index: 0, role: "price" as const })),
      },
    })
    expect(
      runRefinerGuards(BEFORE, AFTER_OK, tooMany, OPTS).violations.some((v) =>
        v.startsWith("target_excede_teto"),
      ),
    ).toBe(true)
  })

  it("mono_weight_contrast não exige whitelist/import", () => {
    const mono = v2({
      typography: {
        strategy: "mono_weight_contrast",
        rationale: "",
        display_font: null,
        targets: [{ index: 0, role: "brand_name", font_weight: 200 }],
      },
    })
    const after = BEFORE.replace(
      "font-family:'Montserrat',Arial,sans-serif;",
      "font-family: 'Montserrat',Arial,sans-serif; font-weight: 200;",
    )
    expect(runRefinerGuards(BEFORE, after, mono, OPTS).ok).toBe(true)
  })

  // ── v2: formas + espaçamento ─────────────────────────────────────────

  it("shapes: índice fora do range do inventário de radius reprova", () => {
    const delta = v2({
      shapes: { stance: "rounded_warm", rationale: "", targets: [{ index: 5, radius_px: 9 }] },
    })
    const r = runRefinerGuards(BEFORE, BEFORE, delta, OPTS) // radiusOccurrenceCount: 2
    expect(r.violations.some((v) => v.startsWith("shapes_index_fora_do_range"))).toBe(true)
  })

  it("spacing: adjust fora do range e junção inválida reprovam", () => {
    const delta = v2({
      spacing: {
        rhythm: "editorial_spaced",
        rationale: "",
        adjust: [{ index: 9, value_px: 96 }],
        insert: [{ junction: 4, height_px: 64 }],
      },
    })
    const r = runRefinerGuards(BEFORE, BEFORE, delta, OPTS) // spacing: 3, junctions: 2
    expect(r.violations.some((v) => v.startsWith("spacing_adjust_index_fora_do_range"))).toBe(true)
    expect(r.violations.some((v) => v.startsWith("spacing_junction_fora_do_range"))).toBe(true)
  })

  it("spacing: mais de 6 inserções reprova", () => {
    const delta = v2({
      spacing: {
        rhythm: "contrast_peaks",
        rationale: "",
        adjust: [],
        insert: Array.from({ length: 7 }, (_, i) => ({ junction: i % 2, height_px: 40 })),
      },
    })
    const r = runRefinerGuards(BEFORE, BEFORE, delta, OPTS)
    expect(r.violations.some((v) => v.startsWith("spacing_insert_excede_teto"))).toBe(true)
  })

  it("inserções ganham folga de crescimento proporcional (spacers legítimos)", () => {
    const delta = v2({
      spacing: {
        rhythm: "editorial_spaced",
        rationale: "",
        adjust: [],
        insert: [
          { junction: 0, height_px: 64 },
          { junction: 1, height_px: 96 },
        ],
      },
    })
    const after = BEFORE.replace(
      "</table>",
      `</table><div style="height:64px"></div><div style="height:96px"></div>`,
    )
    const r = runRefinerGuards(BEFORE, after, delta, OPTS)
    expect(r.ok).toBe(true)
  })

  it("delta 3-seções válido passa (fonte + raio + spacer)", () => {
    const delta = v2({
      typography: serifTypography,
      shapes: { stance: "rounded_warm", rationale: "", targets: [{ index: 0, radius_px: 9 }] },
      spacing: {
        rhythm: "intimate_uniform",
        rationale: "",
        adjust: [{ index: 1, value_px: 32 }],
        insert: [{ junction: 0, height_px: 24 }],
      },
    })
    const after = AFTER_OK.replace("</table>", `</table><div style="height:24px"></div>`)
    const r = runRefinerGuards(BEFORE, after, delta, OPTS)
    expect(r.violations).toEqual([])
    expect(r.ok).toBe(true)
  })
})

describe("runRefinerGuards — spacer de tabela com &nbsp; não é texto", () => {
  it("respiro inserido como <tr><td>&nbsp;</td></tr> passa no guard", () => {
    // É o formato emitido por fixOrphanSpacerDivs no output do
    // applySpacingDelta — o &nbsp; é espaço invisível, não conteúdo.
    const after = AFTER_OK.replace(
      "</tr>\n<tr><td><a",
      '</tr><tr><td style="height:96px;line-height:96px;font-size:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>\n<tr><td><a',
    )
    const r = runRefinerGuards(BEFORE, after, deltaSerif, OPTS)
    expect(r.violations).not.toContain("texto_alterado")
  })

  it("texto REAL adicionado continua reprovando", () => {
    const bad = AFTER_OK.replace(
      "</tr>\n<tr><td><a",
      '</tr><tr><td>OFERTA SECRETA</td></tr>\n<tr><td><a',
    )
    const r = runRefinerGuards(BEFORE, bad, deltaSerif, OPTS)
    expect(r.violations).toContain("texto_alterado")
  })
})
