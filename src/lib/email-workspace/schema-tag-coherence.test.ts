import { describe, it, expect } from "vitest"

import { auditSchemaTags, renameTagInHtml } from "./schema-tag-coherence"
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
