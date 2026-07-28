/**
 * buildHeroVars — corte do montador_html no modo fragment (Fase C).
 *
 * O agente Hero só precisa da região da hero (hero_region_html) no modo
 * fragment — o splice é por código. O documento completo do Montador
 * (~40KB) só entra no fallback full_doc, onde o agente devolve o documento
 * inteiro. Mandar o doc completo no fragment inflava o prompt e o tempo de
 * reasoning do GLM (timeouts de 240s).
 */
import { describe, it, expect } from "vitest"

import { buildHeroVars, type FormatChainContext } from "./format-context"

const HERO_REGION =
  '<table role="presentation"><tr><td><img src="{{HERO_IMAGE}}"></td></tr></table>'

function minimalCtx(): FormatChainContext {
  return {
    emailRow: { name: "Email 1", subject: "Assunto", preheader: "" },
    blocks: [],
    referenceHtml: `<!DOCTYPE html><html><body>${HERO_REGION}<table><tr><td>{{BODY_TEXT}}</td></tr></table></body></html>`,
    referenceSource: "assembler",
    slotMap: null,
    blueprint: null,
    roles: {
      bg: "#FFFFFF",
      text: "#111111",
      heading: "#111111",
      button_bg: "#111111",
      button_text: "#FFFFFF",
      accent: "#333333",
    },
    logoLight: "",
    logoDark: "",
    locale: "pt-BR",
    brandName: "Loja Teste",
    fontHeading: "Inter",
    fontHeadingWeight: "700",
    fontBody: "Inter",
    fontBodyWeight: "400",
    imageMap: [],
    blocksWithContent: [],
    topProductsJson: "[]",
  }
}

describe("buildHeroVars — montador_html por modo", () => {
  it("fragment: montador_html VAZIO (só a região vai no prompt)", () => {
    const vars = buildHeroVars(minimalCtx(), {
      mode: "fragment",
      regionHtml: HERO_REGION,
      variant: null,
    })
    expect(vars.montador_html).toBe("")
    expect(vars.hero_region_html).toBe(HERO_REGION)
  })

  it("full_doc: montador_html leva o documento completo (o agente devolve o doc inteiro)", () => {
    const ctx = minimalCtx()
    const vars = buildHeroVars(ctx, {
      mode: "full_doc",
      regionHtml: "",
      variant: null,
    })
    expect(vars.montador_html).toBe(ctx.referenceHtml)
  })
})

// Enxerto por ID: quando a região JÁ é a variante da biblioteca, mandar a
// variante de novo é duplicar o mesmo HTML no prompt.
describe("buildHeroVars — modo enxertado", () => {
  const variant = {
    id: "v1",
    html: "<tr><td>{{HERO_HEADLINE}}</td></tr>",
    html_tagged: null,
    tagging_status: null,
    rendered_html: "<table><tr><td><img src='mockup.png'></td></tr></table>",
    output_schema: [],
    block_type: "hero",
  }

  it("grafted: variante e rendered saem do prompt, hero_source=library", () => {
    const vars = buildHeroVars(minimalCtx(), {
      mode: "fragment",
      regionHtml: HERO_REGION,
      variant,
      grafted: true,
    })
    expect(vars.hero_source).toBe("library")
    expect(vars.hero_variant_html).toBe("")
    expect(vars.hero_variant_rendered_html).toBe("")
  })

  it("sem enxerto: variante e rendered continuam sendo o espelho", () => {
    const vars = buildHeroVars(minimalCtx(), {
      mode: "fragment",
      regionHtml: HERO_REGION,
      variant,
    })
    expect(vars.hero_source).toBe("montador")
    expect(vars.hero_variant_html).toBe(variant.html)
    expect(vars.hero_variant_rendered_html).toBe(variant.rendered_html)
  })
})
