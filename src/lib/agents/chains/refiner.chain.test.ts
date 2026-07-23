import { describe, expect, it } from "vitest"
import {
  RefinerDeltaInvalidError,
  parseRefinerDelta,
  extractRefinedHtml,
  refinedHtmlGuard,
} from "./refiner.chain"

describe("extractRefinedHtml", () => {
  const doc = `<!DOCTYPE html><html><body><table></table></body></html>`

  it("remove fences e prosa em volta do documento", () => {
    expect(extractRefinedHtml("```html\n" + doc + "\n```")).toBe(doc)
    expect(extractRefinedHtml("Aqui está:\n" + doc + "\nPronto!")).toBe(doc)
  })

  it("sem HTML → string vazia", () => {
    expect(extractRefinedHtml("desculpa, não consegui")).toBe("")
  })
})

describe("refinedHtmlGuard", () => {
  const orig = `<!DOCTYPE html><html><body><table><tr><td>${"x".repeat(200)}</td></tr></table></body></html>`

  it("passa quando é HTML válido e preserva nº de <table> + tamanho", () => {
    const refined = orig.replace("x", "y")
    expect(refinedHtmlGuard(orig, refined)).toEqual({ ok: true })
  })

  it("reprova vazio / sem </html> / não-HTML", () => {
    expect(refinedHtmlGuard(orig, "").ok).toBe(false)
    expect(refinedHtmlGuard(orig, "<table></table>").ok).toBe(false) // sem </html>
  })

  it("reprova quando o nº de <table> mudou", () => {
    const r = refinedHtmlGuard(orig, orig.replace("</table>", "</table><table></table>"))
    expect(r.ok).toBe(false)
    expect(r.reason).toContain("table_count")
  })

  it("reprova quando encolheu abaixo de 70% (truncamento)", () => {
    const r = refinedHtmlGuard(orig, `<!DOCTYPE html><html><body><table></table></body></html>`)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe("shrunk")
  })
})

describe("parseRefinerDelta", () => {
  it("parseia o shape v2 completo (3 seções)", () => {
    const delta = parseRefinerDelta(
      JSON.stringify({
        typography: {
          strategy: "serif_luxury",
          rationale: "Relógios premium pedem serifada",
          display_font: { family: "Playfair Display", weights: [400, 700] },
          targets: [{ index: 0, role: "brand_name", font_weight: 700, letter_spacing: "-1.5px" }],
        },
        shapes: {
          stance: "angular_premium",
          rationale: "Base reta, CTA do herói suave",
          targets: [{ index: 2, radius_px: 15 }],
        },
        spacing: {
          rhythm: "editorial_spaced",
          rationale: "Respiro de revista",
          adjust: [{ index: 5, value_px: 96 }],
          insert: [{ junction: 1, height_px: 64 }],
        },
      }),
    )
    expect(delta.typography.strategy).toBe("serif_luxury")
    expect(delta.typography.display_font?.family).toBe("Playfair Display")
    expect(delta.typography.targets).toHaveLength(1)
    expect(delta.shapes.stance).toBe("angular_premium")
    expect(delta.shapes.targets).toEqual([{ index: 2, radius_px: 15 }])
    expect(delta.spacing.rhythm).toBe("editorial_spaced")
    expect(delta.spacing.adjust).toEqual([{ index: 5, value_px: 96 }])
    expect(delta.spacing.insert).toEqual([{ junction: 1, height_px: 64 }])
  })

  it("aceita o shape v1 flat (compat) mapeando para typography", () => {
    const delta = parseRefinerDelta(
      JSON.stringify({
        strategy: "personality_sans",
        rationale: "moda atual",
        display_font: { family: "Sora", weights: [600] },
        targets: [{ index: 1, role: "hero_headline" }],
      }),
    )
    expect(delta.typography.strategy).toBe("personality_sans")
    expect(delta.typography.targets).toHaveLength(1)
    expect(delta.shapes.stance).toBe("none")
    expect(delta.spacing.rhythm).toBe("none")
  })

  it("seções ausentes viram none; tolera fences e prosa em volta", () => {
    const raw =
      'Aqui está a decisão:\n```json\n{"typography":{"strategy":"none","rationale":"já comunica","display_font":null,"targets":[]},"shapes":{"stance":"none","rationale":"","targets":[]}}\n```'
    const delta = parseRefinerDelta(raw)
    expect(delta.typography.strategy).toBe("none")
    expect(delta.typography.display_font).toBeNull()
    expect(delta.shapes.stance).toBe("none")
    expect(delta.spacing.rhythm).toBe("none")
    expect(delta.spacing.adjust).toEqual([])
  })

  it("descarta targets malformados e normaliza role/stance/rhythm desconhecidos", () => {
    const delta = parseRefinerDelta(
      JSON.stringify({
        typography: {
          strategy: "personality_sans",
          display_font: { family: "Sora", weights: [600] },
          targets: [
            { index: 2, role: "banana" },
            { index: "x", role: "brand_name" },
            null,
          ],
        },
        shapes: {
          stance: "circular_everything",
          targets: [{ index: 1, radius_px: 8 }],
        },
        spacing: {
          rhythm: "editorial_spaced",
          adjust: [{ index: 0, value_px: "40" }, { index: 3, value_px: 48 }],
          insert: [{ junction: 1.5, height_px: 40 }],
        },
      }),
    )
    expect(delta.typography.targets).toEqual([{ index: 2, role: "section_title" }])
    // stance desconhecida → none (e targets zerados por consequência)
    expect(delta.shapes.stance).toBe("none")
    // adjust com value não-numérico descartado; junção não-inteira descartada
    expect(delta.spacing.adjust).toEqual([{ index: 3, value_px: 48 }])
    expect(delta.spacing.insert).toEqual([])
  })

  it("shapes com targets vazios vira stance none (não conta como ativo)", () => {
    const delta = parseRefinerDelta(
      JSON.stringify({
        typography: { strategy: "none", display_font: null, targets: [] },
        shapes: { stance: "rounded_warm", targets: [] },
        spacing: { rhythm: "intimate_uniform", adjust: [], insert: [] },
      }),
    )
    expect(delta.shapes.stance).toBe("none")
    expect(delta.spacing.rhythm).toBe("none")
  })

  it("strategy inválida → RefinerDeltaInvalidError (v1 e v2)", () => {
    expect(() =>
      parseRefinerDelta('{"strategy":"comic_sans_everywhere","targets":[]}'),
    ).toThrow(RefinerDeltaInvalidError)
    expect(() =>
      parseRefinerDelta('{"typography":{"strategy":"comic_sans","targets":[]}}'),
    ).toThrow(RefinerDeltaInvalidError)
  })

  it("JSON truncado/inválido/sem seções → RefinerDeltaInvalidError", () => {
    expect(() => parseRefinerDelta('{"strategy":"none",')).toThrow(RefinerDeltaInvalidError)
    expect(() => parseRefinerDelta("sem json nenhum")).toThrow(RefinerDeltaInvalidError)
    expect(() => parseRefinerDelta('{"foo":1}')).toThrow(RefinerDeltaInvalidError)
  })

  it("troca de família sem display_font → RefinerDeltaInvalidError", () => {
    expect(() =>
      parseRefinerDelta('{"typography":{"strategy":"serif_luxury","display_font":null,"targets":[]}}'),
    ).toThrow(RefinerDeltaInvalidError)
  })
})
