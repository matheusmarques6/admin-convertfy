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
  // Espelha a migration 20261037 (hero v6): as variantes de hero da
  // biblioteca carregam {{HERO_IMAGE}} no lugar exato onde o render usa a
  // imagem — o agente preserva a hero byte a byte e SÓ troca a tag pela URL
  // do image_map. Sem este bloco o agente volta a "reconstruir" a hero.
  it("contém a hero_overlay_hard_rule v6 (paridade com o prompt do banco)", () => {
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("<hero_overlay_hard_rule>")
    // v6 (migration 20261037): swap-only da tag {{HERO_IMAGE}}.
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain(
      "THE REFERENCE HERO IS ALREADY AUTHORED CORRECTLY",
    )
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("{{HERO_IMAGE}}")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("byte-for-byte")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("<formatting_hard_rules>")
  })

  // Espelha a migration 20260930: casamento slot↔imagem por TAG, sem
  // reuso de URL, slot sem imagem é removido, width por render_width_px.
  // Sem este bloco o agente clona a única imagem disponível em todos os
  // slots (Luxe Lift w#1: 1 imagem replicada 10x no HTML final).
  it("contém as image_slot_rules v2 (paridade com o prompt do banco)", () => {
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("<image_slot_rules>")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("ONE SLOT PER IMAGE")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("UNFILLED SLOT → REMOVE")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("TEXT SLOTS ARE NOT IMAGE SLOTS")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("render_width_px")
    // v2 pós-incidente: prompt novo + payload antigo esvaziava o email
    // (remoção de slot sem tag pra casar). O guard torna o prompt seguro
    // em qualquer combinação de deploy — regra 3 só vale com payload
    // taggeado, e o aspect_ratio é respeitado nos dois modos.
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("LEGACY PAYLOAD GUARD")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain(
      "NEVER remove a slot because a tag is missing",
    )
  })
})
