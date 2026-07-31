import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, it, expect } from "vitest"

import {
  parseHeroFragment,
  buildHeroSystemPrompt,
  HeroOutputInvalidError,
  DEFAULT_HERO_SYSTEM_PROMPT,
  DEFAULT_HERO_USER_TEMPLATE,
  HERO_OUTPUT_OPEN,
  HERO_OUTPUT_CLOSE,
  HERO_OUTPUT_CONTRACT,
  HERO_REPORT_OPEN,
  HERO_REPORT_CLOSE,
  parseHeroReport,
} from "./hero.chain"
import { renderImageTemplate } from "../image/template-renderer"
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

// CM-5: o relatório é DECLARAÇÃO, não instrução — o código não age sobre
// ele, só registra e alimenta o QA. Por isso o parser é tolerante: ausência
// ou JSON quebrado devolvem null e o fragmento vale do mesmo jeito.
describe("parseHeroReport", () => {
  const wrap = (json: string) =>
    `${HERO_OUTPUT_OPEN}<table></table>${HERO_OUTPUT_CLOSE}\n${HERO_REPORT_OPEN}${json}${HERO_REPORT_CLOSE}`

  it("lê o relatório completo", () => {
    const r = parseHeroReport(
      wrap(
        '{"imagem":"aplicada","campos_vazios":["HERO_CTA_LABEL"],"linhas_removidas":["cta"],"logo":"dark"}',
      ),
    )
    expect(r).toEqual({
      imagem: "aplicada",
      logo: "dark",
      campos_vazios: ["HERO_CTA_LABEL"],
      linhas_removidas: ["cta"],
    })
  })

  it("aceita fences dentro do wrapper", () => {
    const r = parseHeroReport(wrap('```json\n{"imagem":"ausente"}\n```'))
    expect(r?.imagem).toBe("ausente")
  })

  it("sem wrapper → null", () => {
    expect(parseHeroReport(`${HERO_OUTPUT_OPEN}<table></table>${HERO_OUTPUT_CLOSE}`)).toBeNull()
  })

  it("JSON quebrado → null, sem lançar", () => {
    expect(parseHeroReport(wrap('{"imagem":'))).toBeNull()
  })

  it("valores fora do contrato são descartados", () => {
    const r = parseHeroReport(
      wrap('{"imagem":"talvez","logo":"roxo","campos_vazios":"nao-array"}'),
    )
    expect(r).toBeNull()
  })

  it("array com lixo é filtrado", () => {
    const r = parseHeroReport(
      wrap('{"campos_vazios":["OK", 42, "", null, "  OUTRO  "]}'),
    )
    expect(r?.campos_vazios).toEqual(["OK", "OUTRO"])
  })

  it("relatório vazio → null (nada a registrar)", () => {
    expect(parseHeroReport(wrap("{}"))).toBeNull()
  })

  it("o relatório não contamina o fragmento", () => {
    const raw = wrap('{"imagem":"aplicada"}')
    expect(parseHeroFragment(raw)).toBe("<table></table>")
  })
})

// CM-5: o contrato de output é único — o modo full_doc, em que o agente
// devolvia o documento inteiro, foi removido.
describe("contrato de output da hero", () => {
  it("pede fragmento + relatório", () => {
    expect(HERO_OUTPUT_CONTRACT).toContain(HERO_OUTPUT_OPEN)
    expect(HERO_OUTPUT_CONTRACT).toContain(HERO_REPORT_OPEN)
    expect(HERO_OUTPUT_CONTRACT).toContain("campos_vazios")
  })

  it("proíbe documento completo", () => {
    expect(HERO_OUTPUT_CONTRACT).toContain("No <!DOCTYPE>")
    expect(HERO_OUTPUT_CONTRACT.toLowerCase()).not.toContain("complete email document")
  })
})

// Story CM-1: os testes abaixo cobrem o prompt que CHEGA AO MODELO, não a
// constante. Os testes de `prompts default da cadeia` afirmam que a
// constante contém `{{HERO_IMAGE}}` — e passavam enquanto o renderer
// apagava a tag no caminho até a API.
describe("buildHeroSystemPrompt", () => {
  const CANONICAL_TAGS = [
    "{{PLACEHOLDERS}}",
    "{{HERO_IMAGE}}",
    "{{HERO_IMAGE_ALT}}",
    "{{COUPON_CODE}}",
    "{{HERO_HEADLINE}}",
    "{{HERO_CTA_LABEL}}",
    "{{ unsubscribe }}",
  ]

  it("preserva as tags canônicas do prompt default", () => {
    const out = buildHeroSystemPrompt("", HERO_OUTPUT_CONTRACT)
    for (const tag of CANONICAL_TAGS) {
      expect(out).toContain(tag)
    }
  })

  it("substitui o contrato de output", () => {
    const out = buildHeroSystemPrompt("", HERO_OUTPUT_CONTRACT)
    expect(out).not.toContain("{{output_contract}}")
    expect(out).toContain(HERO_OUTPUT_CONTRACT)
  })

  it("preserva tag canônica em system_prompt customizado", () => {
    const custom = "Swap {{HERO_IMAGE}} and keep {{COUPON_CODE}}.\n{{output_contract}}"
    const out = buildHeroSystemPrompt(custom, "CONTRATO")
    expect(out).toContain("{{HERO_IMAGE}}")
    expect(out).toContain("{{COUPON_CODE}}")
    expect(out).toContain("CONTRATO")
    expect(out).not.toContain("{{output_contract}}")
  })

  it("system_prompt vazio ou só espaços cai no default", () => {
    expect(buildHeroSystemPrompt("   ", "X")).toContain("hero_source_modes")
  })

  it("prova o bug: renderImageTemplate apagaria as tags", () => {
    // Guarda documental — se alguém "consertar" o build de volta para o
    // renderer, este teste mostra exatamente o que se perde.
    const rendered = renderImageTemplate(DEFAULT_HERO_SYSTEM_PROMPT, {
      output_contract: "X",
    })
    expect(rendered).not.toContain("{{HERO_IMAGE}}")
    expect(rendered).toContain("carrying the `` placeholder")
  })
})

// AC CM-1.3 — nenhum chain pode passar o system_prompt pelo renderer: o
// system carrega tags canônicas como exemplo, o user_template carrega vars.
describe("system prompts não passam por renderImageTemplate", () => {
  const CHAINS = [
    "hero.chain.ts",
    "text-format.chain.ts",
    "image-format.chain.ts",
    "color-format.chain.ts",
    "qa.chain.ts",
    "component-tagger.chain.ts",
    "copy.chain.ts",
  ]

  it.each(CHAINS)("%s", (file) => {
    const src = readFileSync(join(__dirname, file), "utf8")
    // Casa `renderImageTemplate(` seguido, dentro dos próximos ~120 chars,
    // de `system_prompt` — o padrão exato do bug do CM-1. `[\s\S]` em vez
    // da flag /s: o target do tsconfig é anterior a es2018.
    const offending = /renderImageTemplate\([\s\S]{0,120}?system_prompt/.test(src)
    expect(offending).toBe(false)
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
  // O modo library deixou de ser incondicionalmente "substituição pura":
  // com design system escrito, a especificação decide a estrutura final e a
  // região é o material. SEM design system, nada muda — a região volta a ser
  // intocável, que é o comportamento de origem.
  it("hero: modo library é substituição pura SEM design system", () => {
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain(
      "<hero_source>library</hero_source>",
    )
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain(
      "WITHOUT one, the region is structurally final",
    )
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain("SUBSTITUTION ONLY")
    expect(DEFAULT_HERO_USER_TEMPLATE).toContain("{{hero_source}}")
  })

  it("hero: COM design system, a especificação decide a estrutura", () => {
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain(
      "WITH a <design_system>, the region is the starting point",
    )
    expect(DEFAULT_HERO_SYSTEM_PROMPT).toContain(
      "THE SPECIFICATION WINS — including on structure",
    )
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
