import { describe, expect, it } from "vitest"

import { DEFAULT_HTML_SYSTEM_PROMPT, enforceLangAttribute } from "./html.chain"

describe("enforceLangAttribute", () => {
  it("substitui lang errado pelo locale da loja", () => {
    const html = '<!DOCTYPE html><html lang="en"><body></body></html>'
    expect(enforceLangAttribute(html, "pt-BR")).toContain('<html lang="pt-BR">')
  })

  it("injeta lang quando o <html> não tem o atributo", () => {
    const html = "<!DOCTYPE html><html><body></body></html>"
    expect(enforceLangAttribute(html, "pt-BR")).toContain('<html lang="pt-BR">')
  })

  it("preserva outros atributos do <html> (xmlns etc)", () => {
    const html =
      '<!DOCTYPE html><html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml"><body></body></html>'
    const out = enforceLangAttribute(html, "en")
    expect(out).toContain('lang="en"')
    expect(out).toContain('xmlns="http://www.w3.org/1999/xhtml"')
  })

  it("locale vazio ou malformado → no-op", () => {
    const html = '<!DOCTYPE html><html lang="en"><body></body></html>'
    expect(enforceLangAttribute(html, "")).toBe(html)
    expect(enforceLangAttribute(html, "Portugues")).toBe(html)
  })

  it("não toca em lang de elementos internos", () => {
    const html =
      '<!DOCTYPE html><html lang="en"><body><span lang="fr">bonjour</span></body></html>'
    const out = enforceLangAttribute(html, "pt-BR")
    expect(out).toContain('<span lang="fr">')
    expect(out).toContain('<html lang="pt-BR">')
  })
})

describe("DEFAULT_HTML_SYSTEM_PROMPT", () => {
  // Espelha a migration 20260820 (append no prompt ativo): a hero com
  // overlay=needs_html_overlay vira texto-sobre-background SEMPRE, mesmo
  // que a reference empilhe. Sem este bloco o fallback regride pro bug
  // da hero empilhada.
  it("contém a hero_overlay_hard_rule (paridade com o prompt do banco)", () => {
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("<hero_overlay_hard_rule>")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("TEXT-OVER-BACKGROUND-IMAGE")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("<formatting_hard_rules>")
  })
})
