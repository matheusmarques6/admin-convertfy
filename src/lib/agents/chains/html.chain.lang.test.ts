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
  it("contém a hero_overlay_hard_rule v3 (paridade com o prompt do banco)", () => {
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("<hero_overlay_hard_rule>")
    // v3 (migration 20260929): a forma AUTORADA da variante é a autoridade —
    // overlay preservado, EMPILHADO preservado, construção só em slot puro.
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain(
      "THE REFERENCE (library variant) IS THE AUTHORITY",
    )
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("STACKED-authored")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("ADAPTIVE HEIGHT")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("<formatting_hard_rules>")
  })

  // Espelha a migration 20260930: casamento slot↔imagem por TAG, sem
  // reuso de URL, slot sem imagem é removido, width por render_width_px.
  // Sem este bloco o agente clona a única imagem disponível em todos os
  // slots (Luxe Lift w#1: 1 imagem replicada 10x no HTML final).
  it("contém as image_slot_rules (paridade com o prompt do banco)", () => {
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("<image_slot_rules>")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("ONE SLOT PER IMAGE")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("UNFILLED SLOT → REMOVE")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("TEXT SLOTS ARE NOT IMAGE SLOTS")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("render_width_px")
  })
})
