import { describe, it, expect } from "vitest"

import {
  parseHeroFragment,
  HeroOutputInvalidError,
  DEFAULT_HERO_SYSTEM_PROMPT,
  HERO_OUTPUT_OPEN,
  HERO_OUTPUT_CLOSE,
} from "./hero.chain"
import {
  textFormatGuard,
  DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT,
} from "./text-format.chain"
import { DEFAULT_IMAGE_FORMAT_SYSTEM_PROMPT } from "./image-format.chain"
import { DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT } from "./color-format.chain"
import {
  HERO_SENTINEL_START,
  HERO_SENTINEL_END,
} from "../html/hero-locator"

describe("parseHeroFragment", () => {
  it("extrai o fragmento entre os wrappers (com fences)", () => {
    const raw = `\`\`\`html\n${HERO_OUTPUT_OPEN}\n<table><tr><td>hero</td></tr></table>\n${HERO_OUTPUT_CLOSE}\n\`\`\``
    expect(parseHeroFragment(raw)).toBe("<table><tr><td>hero</td></tr></table>")
  })

  it("remove sentinelas ecoadas pelo modelo", () => {
    const raw = `${HERO_OUTPUT_OPEN}${HERO_SENTINEL_START}<table><tr><td>x</td></tr></table>${HERO_SENTINEL_END}${HERO_OUTPUT_CLOSE}`
    expect(parseHeroFragment(raw)).not.toContain("cfy:hero")
  })

  it("sem wrapper → HeroOutputInvalidError com raw", () => {
    try {
      parseHeroFragment("<table><tr><td>x</td></tr></table>")
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(HeroOutputInvalidError)
      expect((err as HeroOutputInvalidError).raw).toContain("<table>")
    }
  })

  it("fragmento contendo documento inteiro → erro", () => {
    const raw = `${HERO_OUTPUT_OPEN}<!DOCTYPE html><html><body><table></table></body></html>${HERO_OUTPUT_CLOSE}`
    expect(() => parseHeroFragment(raw)).toThrow(HeroOutputInvalidError)
  })

  it("fragmento vazio/sem table → erro", () => {
    expect(() =>
      parseHeroFragment(`${HERO_OUTPUT_OPEN}<div>x</div>${HERO_OUTPUT_CLOSE}`),
    ).toThrow(HeroOutputInvalidError)
  })
})

describe("textFormatGuard", () => {
  const input = [
    `${HERO_SENTINEL_START}<table role="presentation"><tr><td>hero</td></tr></table>${HERO_SENTINEL_END}`,
    `<table role="presentation"><tr><td>{{BODY_TEXT}} {{PRODUCTS_IMAGE}}</td></tr></table>`,
  ].join("\n")

  it("aceita output fiel (copy trocada, tags de imagem intactas)", () => {
    const output = input.replace("{{BODY_TEXT}}", "texto final da copy aqui")
    expect(textFormatGuard(input, output).ok).toBe(true)
  })

  it("tabela sumiu → falha table_count", () => {
    const output = `${HERO_SENTINEL_START}<table role="presentation"><tr><td>hero</td></tr></table>${HERO_SENTINEL_END}`
    const res = textFormatGuard(input, output)
    expect(res.ok).toBe(false)
    expect(res.reason).toContain("table_count")
  })

  it("tag de imagem consumida → falha image_tags_dropped", () => {
    const output = input.replace("{{PRODUCTS_IMAGE}}", "https://cdn/x.png")
    const res = textFormatGuard(input, output)
    expect(res.ok).toBe(false)
    expect(res.reason).toContain("image_tags_dropped")
    expect(res.reason).toContain("PRODUCTS_IMAGE")
  })

  it("sentinelas da hero perdidas → falha", () => {
    const output = input.replaceAll(HERO_SENTINEL_START, "").replaceAll(HERO_SENTINEL_END, "") + " padding para nao encolher o documento alem do limite de noventa por cento do original"
    const res = textFormatGuard(input, output)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe("hero_sentinels_lost")
  })
})

// Paridade dos prompts default com as regras herdadas do monolítico —
// mesmo espírito do antigo html.chain.lang.test.ts.
describe("prompts default da cadeia", () => {
  it("hero herda a regra v6 (swap da tag, sem overlay) + gold reference", () => {
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("{{HERO_IMAGE}}")
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("height:auto")
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("NEVER invent a URL")
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("gold_reference")
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("merge_tags_are_literal")
  })

  it("texto herda merge tags, preheader e proíbe tocar hero/tags de imagem", () => {
    expect(DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT).toContain("merge_tags_are_literal")
    expect(DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT).toContain("PREHEADER")
    expect(DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT).toContain(HERO_SENTINEL_START)
    expect(DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT).toContain("image_tags_survive")
    expect(DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT).toContain("NO DUPLICATE PRODUCTS")
  })

  it("imagem herda as slot rules v6 adaptadas a ops", () => {
    expect(DEFAULT_IMAGE_FORMAT_SYSTEM_PROMPT).toContain("ONE SLOT PER IMAGE")
    expect(DEFAULT_IMAGE_FORMAT_SYSTEM_PROMPT).toContain("MATCH BY TAG")
    expect(DEFAULT_IMAGE_FORMAT_SYSTEM_PROMPT).toContain("remove_slot")
    expect(DEFAULT_IMAGE_FORMAT_SYSTEM_PROMPT).toContain("width=520&height=650&crop=center")
    expect(DEFAULT_IMAGE_FORMAT_SYSTEM_PROMPT).toContain("cfy:hero")
  })

  it("cores herda a conformidade de identidade do Refinador + regras de botão", () => {
    expect(DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT).toContain("identity_conformance")
    expect(DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT).toContain("NEVER introduce a color")
    expect(DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT).toContain("button_rules")
    expect(DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT).toContain("fail-open")
  })
})
