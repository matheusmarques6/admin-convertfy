import { describe, it, expect } from "vitest"

import {
  anchorByExample,
  auditSchemaTags,
  findExampleAnchor,
  renameTagInHtml,
} from "./schema-tag-coherence"
import type { ComponentOutputField } from "@/types/email-generation"

const field = (over: Partial<ComponentOutputField>): ComponentOutputField => ({
  key: "headline",
  label: "Headline",
  type: "text_short",
  max_len: 40,
  required: true,
  example: "",
  guidance: "",
  ...over,
})

describe("renameTagInHtml", () => {
  it("troca todas as ocorrências, inclusive com espaços internos", () => {
    const html = "<td>{{HERO_BODY}}</td><!--[if mso]><td>{{ HERO_BODY }}</td><![endif]-->"
    expect(renameTagInHtml(html, "HERO_BODY", "BODY")).toBe(
      "<td>{{BODY}}</td><!--[if mso]><td>{{BODY}}</td><![endif]-->",
    )
  })

  it("não confunde tag com prefixo de outra", () => {
    const html = "<td>{{CTA}}{{CTA_LABEL}}</td>"
    expect(renameTagInHtml(html, "CTA", "HERO_CTA")).toBe(
      "<td>{{HERO_CTA}}{{CTA_LABEL}}</td>",
    )
  })

  it("no-op quando origem e destino são iguais ou vazios", () => {
    const html = "<td>{{X}}</td>"
    expect(renameTagInHtml(html, "X", "X")).toBe(html)
    expect(renameTagInHtml(html, "", "Y")).toBe(html)
    expect(renameTagInHtml(html, "X", "")).toBe(html)
  })
})

describe("legacyTag — a proposta de retag bate com o DIAGNOSTICO_schema_x_tags.sql", () => {
  // As duas implementações da mesma regra têm de dar o mesmo veredito: quem
  // roda o SQL e vai consertar na UI precisa achar lá o de/para que leu aqui.
  const casos: Array<[string, string, string, string | null]> = [
    // [descrição, key do schema, tag do HTML, proposta esperada]
    ["copyKey do registry", "body", "HERO_BODY", "HERO_BODY"],
    ["nome normalizado", "coupon_code", "COUPON_CODE", null], // já ancorado
    ["sufixo: tag termina no endereço", "text", "BODY_TEXT", "BODY_TEXT"],
    ["sufixo: endereço termina na tag", "hero_headline", "HEADLINE", "HEADLINE"],
    ["sem parentesco nenhum", "hero_headline", "COUPON_CODE", null],
  ]

  for (const [nome, key, tag, esperado] of casos) {
    it(nome, () => {
      const a = auditSchemaTags(`<td>{{${tag}}}</td>`, [field({ key })])
      expect(a.missing[0]?.legacyTag ?? null).toBe(esperado)
    })
  }
})

describe("consertos do painel levam a variante a alinhada", () => {
  const schema = [
    field({ key: "hero_headline" }),
    field({ key: "hero_subhead", max_len: 90 }),
  ]

  it("ancorar uma tag órfã resolve o campo sem tag", () => {
    const html = "<td>{{HERO_EYEBROW}}</td><td>{{HERO_SUBHEAD}}</td>"
    const before = auditSchemaTags(html, schema)
    expect(before.missing.map((m) => m.key)).toEqual(["hero_headline"])
    expect(before.orphans.map((o) => o.tag)).toEqual(["HERO_EYEBROW"])

    // A ação "ancorar" do painel: renomeia a tag escolhida para o endereço
    // canônico do campo.
    const after = auditSchemaTags(
      renameTagInHtml(html, "HERO_EYEBROW", "HERO_HEADLINE"),
      schema,
    )
    expect(after.ok).toBe(true)
  })

  it("renomear a key move o endereço junto — os dois lados seguem casados", () => {
    const html = "<td>{{HERO_HEADLINE}}</td>"
    const s = [field({ key: "hero_headline" })]
    expect(auditSchemaTags(html, s).ok).toBe(true)

    // commitKey: troca a key no schema E o placeholder no HTML.
    const nextSchema = [field({ key: "titulo_principal" })]
    const nextHtml = renameTagInHtml(html, "HERO_HEADLINE", "TITULO_PRINCIPAL")
    expect(auditSchemaTags(nextHtml, nextSchema).ok).toBe(true)

    // Mexer só no schema quebraria — é o que o painel impede.
    expect(auditSchemaTags(html, nextSchema).ok).toBe(false)
  })

  it("criar campo a partir da tag órfã fecha o outro lado", () => {
    const html = "<td>{{HERO_HEADLINE}}{{COUPON_CODE}}</td>"
    const s = [field({ key: "hero_headline" })]
    expect(auditSchemaTags(html, s).orphans.map((o) => o.tag)).toEqual([
      "COUPON_CODE",
    ])
    const withField = [...s, field({ key: "coupon_code", max_len: 15 })]
    expect(auditSchemaTags(html, withField).ok).toBe(true)
  })
})

describe("âncora pelo exemplo — o outro caminho (13/08)", () => {
  // A variante é um exemplo PRONTO: quando não há tag para renomear, a
  // frase real ainda está no HTML. Sem isto, todo campo de uma variante
  // recém-colada aparecia como "sem tag" e sem conserto oferecido.
  const schema = [
    { key: "hero_headline", label: "", type: "text_short", max_len: 0, required: false, example: "Buy 1, Get 3 Free", guidance: "" },
  ] as any

  it("acha a frase única e propõe a troca", () => {
    const html = "<h1>Buy 1, Get 3 Free</h1><p>outro texto</p>"
    const a = auditSchemaTags(html, schema)
    expect(a.missing[0].examplePhrase).toBe("Buy 1, Get 3 Free")
    expect(anchorByExample(html, a.missing[0].examplePhrase!, "HERO_HEADLINE")).toBe(
      "<h1>{{HERO_HEADLINE}}</h1><p>outro texto</p>",
    )
  })

  it("casa sem diferenciar caixa e devolve o trecho REAL do documento", () => {
    // Quem cadastra digita normalmente; a arte grita.
    expect(findExampleAnchor("<h1>BUY 1, GET 3 FREE</h1>", "Buy 1, Get 3 Free")).toBe(
      "BUY 1, GET 3 FREE",
    )
  })

  it("frase repetida NÃO vira proposta — trocar uma seria adivinhar", () => {
    expect(findExampleAnchor("<a>Comprar agora</a><a>Comprar agora</a>", "Comprar agora")).toBeNull()
  })

  it("exemplo curto demais não ancora (casaria em qualquer canto)", () => {
    expect(findExampleAnchor("<p>Sim, quero</p>", "Sim")).toBeNull()
  })

  it("frase com metacaractere de regex é trocada literalmente", () => {
    // `$`, `(` e `.` na copy quebrariam uma substituição por regex.
    const html = "<p>Economize R$ 50.00 (hoje)</p>"
    const phrase = findExampleAnchor(html, "R$ 50.00 (hoje)")!
    expect(anchorByExample(html, phrase, "OFFER_VALUE")).toBe(
      "<p>Economize {{OFFER_VALUE}}</p>",
    )
  })

  it("campo sem exemplo e sem tag continua sem proposta nenhuma", () => {
    const semExemplo = [{ ...schema[0], example: "" }] as any
    const a = auditSchemaTags("<h1>nada a ver</h1>", semExemplo)
    expect(a.missing[0].examplePhrase).toBeNull()
    expect(a.missing[0].legacyTag).toBeNull()
  })
})
