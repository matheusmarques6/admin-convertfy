import { describe, it, expect } from "vitest"

import {
  parseTaggerOutput,
  placeholderForKey,
  validateTaggedHtml,
  TaggerOutputInvalidError,
  DEFAULT_TAGGER_SYSTEM_PROMPT,
  TAGGED_HTML_OPEN,
  TAGGED_HTML_CLOSE,
  TAGGING_REPORT_OPEN,
  TAGGING_REPORT_CLOSE,
} from "./component-tagger.chain"
import type { ComponentOutputField } from "@/types/email-generation"

const field = (p: Partial<ComponentOutputField>): ComponentOutputField => ({
  key: p.key ?? "section_headline",
  label: "",
  type: p.type ?? "text_short",
  max_len: p.max_len ?? 60,
  required: false,
  example: p.example ?? "",
  guidance: "",
  ...(p.nature ? { nature: p.nature } : {}),
})

function output(html: string, report: unknown): string {
  return [
    TAGGED_HTML_OPEN,
    html,
    TAGGED_HTML_CLOSE,
    TAGGING_REPORT_OPEN,
    JSON.stringify(report),
    TAGGING_REPORT_CLOSE,
  ].join("\n")
}

describe("placeholderForKey", () => {
  it("uppercase + normalização", () => {
    expect(placeholderForKey("section_headline")).toBe("SECTION_HEADLINE")
    expect(placeholderForKey("testimonial_1_quote_body")).toBe(
      "TESTIMONIAL_1_QUOTE_BODY",
    )
    expect(placeholderForKey(" campo com espaço ")).toBe("CAMPO_COM_ESPA_O")
  })
})

describe("parseTaggerOutput", () => {
  it("extrai html + relatório", () => {
    const raw = output("<table><tr><td>{{SECTION_HEADLINE}}</td></tr></table>", [
      { key: "section_headline", placeholder: "SECTION_HEADLINE", anchored_by: "exact" },
    ])
    const res = parseTaggerOutput(raw)
    expect(res.htmlTagged).toContain("{{SECTION_HEADLINE}}")
    expect(res.report).toEqual([
      { key: "section_headline", placeholder: "SECTION_HEADLINE", anchored_by: "exact" },
    ])
  })

  it("anchored_by inválido degrada pra inference; placeholder ausente deriva da key", () => {
    const raw = output("<table></table>", [{ key: "campaign_tape", anchored_by: "zzz" }])
    const res = parseTaggerOutput(raw)
    expect(res.report[0]).toEqual({
      key: "campaign_tape",
      placeholder: "CAMPAIGN_TAPE",
      anchored_by: "inference",
    })
  })

  it("sem seções → TaggerOutputInvalidError com raw", () => {
    try {
      parseTaggerOutput("nada a ver")
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(TaggerOutputInvalidError)
      expect((err as TaggerOutputInvalidError).raw).toBe("nada a ver")
    }
  })

  it("relatório não-JSON → erro", () => {
    const raw = `${TAGGED_HTML_OPEN}<table></table>${TAGGED_HTML_CLOSE}${TAGGING_REPORT_OPEN}oops${TAGGING_REPORT_CLOSE}`
    expect(() => parseTaggerOutput(raw)).toThrow(TaggerOutputInvalidError)
  })
})

describe("validateTaggedHtml", () => {
  const original = "<table><tr><td>It's the Perfect Time</td></tr></table>"

  it("estrutura preservada + placeholder presente → ok sem issues", () => {
    const tagged = "<table><tr><td>{{SECTION_HEADLINE}}</td></tr></table>"
    const res = validateTaggedHtml(
      original,
      tagged,
      [field({ key: "section_headline", example: "It's the Perfect Time" })],
      [{ key: "section_headline", placeholder: "SECTION_HEADLINE", anchored_by: "exact" }],
    )
    expect(res.ok).toBe(true)
    expect(res.issues).toEqual([])
  })

  it("tabela sumiu → hard fail", () => {
    const res = validateTaggedHtml(
      original,
      "<div>{{SECTION_HEADLINE}}</div>",
      [field({ key: "section_headline" })],
      [{ key: "section_headline", placeholder: "SECTION_HEADLINE", anchored_by: "exact" }],
    )
    expect(res.ok).toBe(false)
    expect(res.reason).toContain("table_count")
  })

  it("até +2 tabelas toleradas (inserção MISSING ELEMENT); +3 → fail", () => {
    const plus2 =
      "<table><tr><td>{{SECTION_HEADLINE}}</td></tr></table>" +
      "<table><tr><td>{{X}}</td></tr></table><table><tr><td>y</td></tr></table>"
    expect(
      validateTaggedHtml(original, plus2, [field({ key: "section_headline" })], [
        { key: "section_headline", placeholder: "SECTION_HEADLINE", anchored_by: "exact" },
      ]).ok,
    ).toBe(true)
    const plus3 = plus2 + "<table><tr><td>z</td></tr></table>"
    expect(
      validateTaggedHtml(original, plus3, [field({ key: "section_headline" })], [
        { key: "section_headline", placeholder: "SECTION_HEADLINE", anchored_by: "exact" },
      ]).ok,
    ).toBe(false)
  })

  it("relatório diz exact mas placeholder não está no HTML → issue", () => {
    const res = validateTaggedHtml(
      original,
      original,
      [field({ key: "section_headline" })],
      [{ key: "section_headline", placeholder: "SECTION_HEADLINE", anchored_by: "exact" }],
    )
    expect(res.ok).toBe(true)
    expect(res.issues[0]).toContain("SECTION_HEADLINE")
  })

  it("asset_fixo fica de fora da cobrança", () => {
    const res = validateTaggedHtml(
      original,
      original,
      [field({ key: "campaign_tape", nature: "asset_fixo" })],
      [],
    )
    expect(res.ok).toBe(true)
    expect(res.issues).toEqual([])
  })

  it("tag divergente mantida (existing_tag) NÃO passa mais", () => {
    // O HTML tem {{HERO_HEADLINE}}, o schema pede `headline`. Antes o
    // relatório dizer "existing_tag" isentava o campo da cobrança e a
    // variante entrava na biblioteca com a copy sem endereço.
    const res = validateTaggedHtml(
      original,
      "<table><tr><td>{{HERO_HEADLINE}}</td></tr></table>",
      [field({ key: "headline" })],
      [{ key: "headline", placeholder: "HERO_HEADLINE", anchored_by: "existing_tag" }],
    )
    expect(res.ok).toBe(true)
    expect(res.issues.some((i) => i.includes("{{HEADLINE}}"))).toBe(true)
  })

  it("rename para {{UPPER(key)}} passa limpo", () => {
    const res = validateTaggedHtml(
      original,
      "<table><tr><td>{{HEADLINE}}</td></tr></table>",
      [field({ key: "headline" })],
      [
        {
          key: "headline",
          placeholder: "HEADLINE",
          anchored_by: "renamed",
          note: "era HERO_HEADLINE",
        },
      ],
    )
    expect(res.ok).toBe(true)
    expect(res.issues).toEqual([])
  })

  it("tag sem campo no schema vira issue; tag de sistema não", () => {
    const res = validateTaggedHtml(
      original,
      "<table><tr><td>{{HEADLINE}}{{LOGO}}{{HERO_EYEBROW}}</td></tr></table>",
      [field({ key: "headline" })],
      [{ key: "headline", placeholder: "HEADLINE", anchored_by: "exact" }],
    )
    expect(res.issues.some((i) => i.includes("HERO_EYEBROW"))).toBe(true)
    expect(res.issues.some((i) => i.includes("LOGO"))).toBe(false)
  })

  it("not_found vira issue informativa", () => {
    const res = validateTaggedHtml(
      original,
      original,
      [field({ key: "section_image", type: "image" })],
      [{ key: "section_image", placeholder: "SECTION_IMAGE", anchored_by: "not_found" }],
    )
    expect(res.ok).toBe(true)
    expect(res.issues[0]).toContain("not_found")
  })
})

describe("prompt default do taguedor", () => {
  it("cobre os modos de ancoragem, naturezas e o contrato de output", () => {
    expect(DEFAULT_TAGGER_SYSTEM_PROMPT).toContain("anchoring_rules")
    expect(DEFAULT_TAGGER_SYSTEM_PROMPT).toContain("DOCUMENT ORDER")
    expect(DEFAULT_TAGGER_SYSTEM_PROMPT).toContain("nature_rules")
    expect(DEFAULT_TAGGER_SYSTEM_PROMPT).toContain("asset_fixo")
    expect(DEFAULT_TAGGER_SYSTEM_PROMPT).toContain(TAGGED_HTML_OPEN)
    expect(DEFAULT_TAGGER_SYSTEM_PROMPT).toContain(TAGGING_REPORT_OPEN)
  })

  it("MISSING ELEMENT: rendered_reference localiza campo que sumiu do html", () => {
    // Caso hero_subhead (jul/2026): example presente no rendered_html mas
    // o elemento não existe no html → inserir em vez de not_found.
    expect(DEFAULT_TAGGER_SYSTEM_PROMPT).toContain("MISSING ELEMENT")
    expect(DEFAULT_TAGGER_SYSTEM_PROMPT).toContain("rendered_reference_role")
    expect(DEFAULT_TAGGER_SYSTEM_PROMPT).toContain(
      "missing from HTML",
    )
  })
})
