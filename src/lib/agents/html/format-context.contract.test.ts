/**
 * Contrato builder × schema: toda var que o schema EXIGE tem de ser
 * produzida pelo builder daquele agente.
 *
 * É o guard que faltou. `color_surface`/`color_surface_strong` nasceram para
 * resolver o incidente Luxe Lift (23-24/08): foram criadas em ColorRoles,
 * exigidas no ColorFormatPromptVarsSchema e declaradas na proveniência —
 * mas `buildColorFormatVars` montava a lista de papéis à mão e ficou com
 * seis dos oito. O prompt saía com <surface></surface> vazio, o agente não
 * tinha destino legal para painel nenhum, e o email ia para o cliente com
 * metade das cores do template (brand_share 0,27–0,53 em 15 gerações).
 *
 * Nada disso quebrou: em produção `validateVars` só loga `contract.drift`.
 * Este teste transforma a mesma divergência em falha de build.
 */
import { describe, it, expect } from "vitest"

import {
  buildHeroVars,
  buildTextFormatVars,
  buildColorFormatVars,
  type FormatChainContext,
} from "./format-context"
import {
  HeroPromptVarsSchema,
  TextFormatPromptVarsSchema,
  ColorFormatPromptVarsSchema,
} from "./contract"

const HERO_REGION =
  '<table role="presentation"><tr><td><img src="{{HERO_IMAGE}}"></td></tr></table>'

const DOC = `<!DOCTYPE html><html><body>
  ${HERO_REGION}
  <table><tr><td bgcolor="#E1DEDE" width="600">{{BODY_TEXT}}</td></tr></table>
</body></html>`

function ctx(): FormatChainContext {
  return {
    emailRow: { name: "Email 1", subject: "Assunto", preheader: "" },
    blocks: [],
    referenceHtml: DOC,
    referenceSource: "assembler",
    slotMap: null,
    blueprint: null,
    roles: {
      bg: "#FFFFFF",
      text: "#1F1F1F",
      heading: "#034326",
      button_bg: "#034326",
      button_text: "#FFFFFF",
      accent: "#07A55D",
      surface: "#F2F2F2",
      surface_strong: "#E3E3E3",
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

const CASOS = [
  {
    agente: "hero_section",
    schema: HeroPromptVarsSchema,
    build: () => buildHeroVars(ctx(), { regionHtml: HERO_REGION, variant: null }),
  },
  {
    agente: "text_format",
    schema: TextFormatPromptVarsSchema,
    build: () => buildTextFormatVars(ctx(), DOC),
  },
  {
    agente: "color_format",
    schema: ColorFormatPromptVarsSchema,
    build: () =>
      buildColorFormatVars(ctx(), DOC, {
        brand: null,
        niche: "Casa",
        tones: "Educacional",
        pesquisaFullText: "",
      }),
  },
] as const

describe("contrato builder × schema", () => {
  for (const { agente, schema, build } of CASOS) {
    it(`${agente}: o builder produz todas as vars exigidas`, () => {
      const produzidas = new Set(Object.keys(build()))
      const exigidas = Object.keys(schema.shape)
      const faltando = exigidas.filter((k) => !produzidas.has(k))
      expect(faltando).toEqual([])
    })

    it(`${agente}: o schema aceita o que o builder produz`, () => {
      expect(() => schema.parse(build())).not.toThrow()
    })
  }
})

// O caso concreto que originou o teste — explícito, para o dia em que
// alguém reescrever o builder e a asserção genérica acima parecer abstrata.
describe("color_format recebe os papéis de painel", () => {
  it("surface e surface_strong chegam preenchidos", () => {
    const vars = buildColorFormatVars(ctx(), DOC, {
      brand: null,
      niche: "Casa",
      tones: "Educacional",
      pesquisaFullText: "",
    })
    expect(vars.color_surface).toBe("#F2F2F2")
    expect(vars.color_surface_strong).toBe("#E3E3E3")
  })

  it("os oito papéis vêm dos mesmos roles que a hero recebe", () => {
    const c = ctx()
    const cor = buildColorFormatVars(c, DOC, {
      brand: null,
      niche: "Casa",
      tones: "Educacional",
      pesquisaFullText: "",
    })
    const hero = buildHeroVars(c, { regionHtml: HERO_REGION, variant: null })
    for (const papel of [
      "color_bg",
      "color_text",
      "color_heading",
      "color_button_bg",
      "color_button_text",
      "color_accent",
      "color_surface",
      "color_surface_strong",
    ] as const) {
      expect(cor[papel]).toBe(hero[papel])
    }
  })
})
