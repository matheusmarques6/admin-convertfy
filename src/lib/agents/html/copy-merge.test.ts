/**
 * Merge determinístico de copy (Fase A, estágio 0 — sem LLM).
 */
import { describe, it, expect } from "vitest"
import { copyMerge, textTagsOutsideHero } from "./copy-merge"
import {
  HERO_SENTINEL_START,
  HERO_SENTINEL_END,
} from "./hero-locator"

const DOC = [
  `${HERO_SENTINEL_START}<table><tr><td>{{HERO_HEADLINE}}</td></tr></table>${HERO_SENTINEL_END}`,
  "<table><tr><td>{{BODY_TITLE}}</td></tr>",
  '<tr><td><a href="{{BODY_CTA_URL}}">{{BODY_CTA_LABEL}}</a></td></tr>',
  '<tr><td><img src="{{SECTION_IMAGE}}"></td></tr>',
  "<tr><td>{{ORFAO_SEM_COPY}}</td></tr></table>",
].join("\n")

const field = (key: string, tag: string | null, type = "text_short") => ({
  key,
  tag,
  type,
})

describe("textTagsOutsideHero", () => {
  it("lista só tags de TEXTO fora da hero (imagem e hero ficam de fora)", () => {
    expect(textTagsOutsideHero(DOC)).toEqual([
      "BODY_TITLE",
      "BODY_CTA_URL",
      "BODY_CTA_LABEL",
      "ORFAO_SEM_COPY",
    ])
  })
})

describe("copyMerge", () => {
  it("resolve por código o que tem tag+valor; hero e imagem intocadas; relatório metrificado", () => {
    const { html, report } = copyMerge(DOC, [
      {
        fields: [
          field("body_title", "BODY_TITLE"),
          field("body_cta_label", "BODY_CTA_LABEL"),
          field("body_cta_url", "BODY_CTA_URL", "url"),
          // sem âncora: vai pro relatório, não pro doc
          field("frase_solta", null),
          // imagem: fora do merge por natureza
          field("section_image", "SECTION_IMAGE", "image"),
        ],
        content: {
          body_title: "Título real",
          body_cta_label: "Comprar",
          body_cta_url: "https://loja.com/x",
          frase_solta: "texto sem casa",
        },
      },
    ])

    expect(html).toContain("Título real")
    expect(html).toContain('href="https://loja.com/x"')
    expect(html).toContain(">Comprar<")
    // hero intocada; imagem intocada; órfã sobra pro agente de exceção
    expect(html).toContain("{{HERO_HEADLINE}}")
    expect(html).toContain("{{SECTION_IMAGE}}")
    expect(report.slots_total).toBe(4)
    expect(report.ops_built).toBe(3)
    expect(report.merged).toBe(3)
    expect(report.left_for_llm).toEqual(["ORFAO_SEM_COPY"])
    expect(report.unanchored_keys).toEqual(["frase_solta"])
    expect(report.skipped).toEqual([])
  })

  it("content vazio/ausente não vira op (slot fica pro LLM decidir remoção)", () => {
    const { report } = copyMerge(DOC, [
      {
        fields: [field("body_title", "BODY_TITLE")],
        content: { body_title: "   " },
      },
    ])
    expect(report.ops_built).toBe(0)
    expect(report.left_for_llm).toContain("BODY_TITLE")
  })

  it("tag apontando pra dentro da hero é pulada (hero_protected)", () => {
    const { report } = copyMerge(DOC, [
      {
        fields: [field("hero_headline", "HERO_HEADLINE")],
        content: { hero_headline: "invasão" },
      },
    ])
    expect(report.merged).toBe(0)
    expect(report.skipped[0]?.reason).toBe("hero_protected")
  })
})
