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
})
