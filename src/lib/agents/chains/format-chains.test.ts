import { describe, it, expect } from "vitest"

import {
  parseHeroFragment,
  HeroOutputInvalidError,
  DEFAULT_HERO_SYSTEM_PROMPT,
  DEFAULT_HERO_USER_TEMPLATE,
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
  it("hero herda a regra v6 (swap da tag, sem overlay) + modos de origem", () => {
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("{{HERO_IMAGE}}")
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("height:auto")
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("NEVER invent a URL")
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("hero_source_modes")
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("merge_tags_are_literal")
  })

  // Enxerto por ID: quando a região vem da biblioteca (grafted por código)
  // ela é estruturalmente FINAL — o agente só substitui.
  it("hero: modo library é substituição pura", () => {
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain(
      "<hero_source>library</hero_source>",
    )
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("STRUCTURALLY FINAL")
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("SUBSTITUTION ONLY")
    expect(DEFAULT_HERO_USER_TEMPLATE).toContain("{{hero_source}}")
  })

  it("hero: fidelidade estrutural no fallback montador (Luxe Lift achatada)", () => {
    // Sem enxerto (variante ausente/região não localizável) a variante volta
    // a ser a verdade do interior: região achatada pelo Montador não pode
    // rebaixar o design (botão → link, faixa sumida, logo branca no branco).
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain(
      "<hero_source>montador</hero_source>",
    )
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("structural truth")
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain(
      "never downgraded to a bare text link",
    )
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("background bands survive")
  })

  it("texto herda merge tags, preheader e proíbe tocar hero/tags de imagem", () => {
    expect(DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT).toContain("merge_tags_are_literal")
    expect(DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT).toContain("PREHEADER")
    expect(DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT).toContain(HERO_SENTINEL_START)
    expect(DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT).toContain("image_tags_survive")
    expect(DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT).toContain("NO DUPLICATE PRODUCTS")
  })

  it("imagem herda as slot rules v6 adaptadas a ops (views, sem documento)", () => {
    expect(DEFAULT_IMAGE_FORMAT_SYSTEM_PROMPT).toContain("ONE SLOT PER IMAGE")
    expect(DEFAULT_IMAGE_FORMAT_SYSTEM_PROMPT).toContain("MATCH BY TAG")
    expect(DEFAULT_IMAGE_FORMAT_SYSTEM_PROMPT).toContain("remove_slot")
    expect(DEFAULT_IMAGE_FORMAT_SYSTEM_PROMPT).toContain("width=520&height=650&crop=center")
    // F3 (arquitetura por views): o agente não vê mais o documento — a
    // menção a cfy:hero saiu do prompt (a proteção segue no applyOps).
    expect(DEFAULT_IMAGE_FORMAT_SYSTEM_PROMPT).toContain("do NOT see the email document")
    expect(DEFAULT_IMAGE_FORMAT_SYSTEM_PROMPT).not.toContain("{{html}}")
  })

  it("cores herda a conformidade de identidade do Refinador + regras de botão", () => {
    expect(DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT).toContain("identity_conformance")
    expect(DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT).toContain("NEVER introduce a color")
    expect(DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT).toContain("button_rules")
    expect(DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT).toContain("fail-open")
  })
})

describe("regras novas (Luxe Lift, jul/2026)", () => {
  it("hero: hero_content é ARRAY (hero composta) + regra de slot vazio", () => {
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("is an ARRAY")
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("coupon banner")
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("empty_slot_rule")
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain('never emit a button with empty label or href=""')
    // Copy ainda não chegou (array vazio) NÃO autoriza remover slot — foi o
    // que comeu o CTA da Luxe Lift.
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("remove NOTHING")
  })
  it("texto: ignora blocos já colocados + fatiamento de copy corrida + slot vazio", () => {
    expect(DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT).toContain("already_placed_blocks")
    expect(DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT).toContain("structured_copy_fallback")
    expect(DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT).toContain("Splitting is allowed; rewriting is not")
    expect(DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT).toContain("empty_slot_rule")
  })
})
