import { describe, it, expect } from "vitest"

import { graftHeroVariant, normalizeFonts } from "./hero-graft"
import { extractHeroBySentinels, locateHeroRegion } from "./hero-locator"

// Documento no formato que o Montador entrega: tabela container 600px com
// os blocos envolvidos pelos marcadores cfy:block.
const doc = [
  "<!DOCTYPE html><html><body>",
  '<table width="600"><tbody>',
  "<!-- cfy:block:1:hero:start -->",
  '<tr><td><h1 style="font-family:Arial">{{HERO_HEADLINE}}</h1></td></tr>',
  "<!-- cfy:block:1:hero:end -->",
  "<!-- cfy:block:2:body:start -->",
  "<tr><td>{{BODY_TEXT}}</td></tr>",
  "<!-- cfy:block:2:body:end -->",
  "</tbody></table>",
  "</body></html>",
].join("\n")

// Variante da biblioteca: estrutura RICA que o Montador achatou (banda
// escura do logo + headline + dois CTAs) — é isso que precisa sobreviver.
const variantTr = [
  '<tr><td bgcolor="#111111" align="center"><img src="{{LOGO}}"></td></tr>',
  '<tr><td><h1>{{HERO_HEADLINE}}</h1><p>{{HERO_SUBHEADLINE}}</p></td></tr>',
  '<tr><td><a href="{{HERO_CTA_URL}}">{{HERO_CTA_LABEL}}</a></td></tr>',
].join("\n")

describe("graftHeroVariant", () => {
  it("substitui a região da hero pelo HTML canônico da variante", () => {
    const res = graftHeroVariant(doc, variantTr)
    expect(res.status).toBe("grafted")
    expect(res.replaced_len).toBeGreaterThan(0)
    expect(res.variant_len).toBe(variantTr.length)

    // A estrutura da variante entrou inteira, byte a byte.
    expect(res.html).toContain('bgcolor="#111111"')
    expect(res.html).toContain("{{HERO_SUBHEADLINE}}")
    expect(res.html).toContain("{{HERO_CTA_LABEL}}")
    // A região achatada do Montador saiu (o <h1> com font-family inline).
    expect(res.html).not.toContain('font-family:Arial')
    // O resto do documento é intocado.
    expect(res.html).toContain("{{BODY_TEXT}}")
    expect(res.html).toContain("<!-- cfy:block:2:body:start -->")
  })

  it("deixa a região sentinelada — o splice do agente continua funcionando", () => {
    const res = graftHeroVariant(doc, variantTr)
    const region = extractHeroBySentinels(res.html)
    expect(region).not.toBeNull()
    expect(region?.inner).toContain("{{HERO_CTA_LABEL}}")
    expect(region?.inner).not.toContain("{{BODY_TEXT}}")
  })

  it("variante que começa em <table> é embrulhada em <tr><td>", () => {
    const variantTable = '<table width="600"><tr><td>{{HERO_HEADLINE}}</td></tr></table>'
    const res = graftHeroVariant(doc, variantTable)
    expect(res.status).toBe("grafted")
    const inner = extractHeroBySentinels(res.html)?.inner ?? ""
    expect(inner.trim().startsWith("<tr>")).toBe(true)
    expect(inner).toContain('<table width="600">')
  })

  it("comentário de cabeçalho na variante não atrapalha", () => {
    const res = graftHeroVariant(doc, `<!-- welcome hero 8 -->\n${variantTr}`)
    expect(res.status).toBe("grafted")
    expect(res.html).toContain('bgcolor="#111111"')
  })

  it("fragmento inutilizável (div solto) → invalid_variant, documento intacto", () => {
    const res = graftHeroVariant(doc, '<div class="hero">oi</div>')
    expect(res.status).toBe("invalid_variant")
    expect(res.html).toBe(doc)
  })

  it("sem variante → no_variant, documento intacto", () => {
    expect(graftHeroVariant(doc, null).status).toBe("no_variant")
    expect(graftHeroVariant(doc, "   ").html).toBe(doc)
  })

  it("documento sem região de hero → no_region, documento intacto", () => {
    const semHero = "<html><body><table><tr><td>{{BODY_TEXT}}</td></tr></table></body></html>"
    const res = graftHeroVariant(semHero, variantTr)
    expect(res.status).toBe("no_region")
    expect(res.html).toBe(semHero)
  })

  it("funciona no modo tag (referência legada sem marcadores cfy:block)", () => {
    const legado = [
      "<!DOCTYPE html><html><body>",
      '<table width="600"><tr><td>{{HERO_HEADLINE}}</td></tr></table>',
      "<table><tr><td>{{BODY_TEXT}}</td></tr></table>",
      "</body></html>",
    ].join("\n")
    expect(locateHeroRegion(legado)?.mode).toBe("tag")
    const res = graftHeroVariant(legado, variantTr)
    expect(res.status).toBe("grafted")
    expect(res.html).toContain("{{HERO_CTA_LABEL}}")
    expect(res.html).toContain("{{BODY_TEXT}}")
  })
})

describe("normalizeFonts", () => {
  const fonts = { heading: "Playfair Display", body: "Inter" }

  it("aplica a fonte de heading em declaração com cara de título", () => {
    const html = '<td style="font-family:Georgia,serif;font-size:32px;">Oi</td>'
    const res = normalizeFonts(html, fonts)
    expect(res.replaced).toBe(1)
    expect(res.html).toContain("font-family:'Playfair Display',Georgia,serif")
  })

  it("peso alto também conta como heading", () => {
    const html = '<td style="font-family:Arial;font-weight:700;">Oi</td>'
    expect(normalizeFonts(html, fonts).html).toContain("'Playfair Display',Arial")
  })

  it("texto pequeno recebe a fonte de corpo", () => {
    const html = '<p style="font-family:Courier,monospace;font-size:14px;">Oi</p>'
    const res = normalizeFonts(html, fonts)
    expect(res.html).toContain("font-family:Inter,monospace")
    expect(res.html).not.toContain("Playfair")
  })

  it("preserva só os fallbacks genéricos e não duplica", () => {
    const html = '<td style="font-family:Inter,Helvetica,Trebuchet MS,sans-serif;">x</td>'
    const res = normalizeFonts(html, fonts)
    expect(res.html).toContain("font-family:Inter,Helvetica,sans-serif")
    expect(res.html).not.toContain("Trebuchet")
  })

  it("sem fontes configuradas é no-op", () => {
    const html = '<td style="font-family:Arial;">x</td>'
    expect(normalizeFonts(html, { heading: null, body: "" })).toEqual({
      html,
      replaced: 0,
    })
  })

  it("normaliza todas as declarações do documento", () => {
    const html = [
      '<h1 style="font-family:Georgia;font-size:28px;">T</h1>',
      '<p style="font-family:Courier;font-size:15px;">B</p>',
    ].join("")
    const res = normalizeFonts(html, fonts)
    expect(res.replaced).toBe(2)
    expect(res.html).toContain("'Playfair Display',Georgia")
    expect(res.html).toContain("font-family:Inter")
  })
})

// O caso REAL (Luxe Lift, jul/2026): a biblioteca inteira está cadastrada
// como documento completo, o modo conservador do fitFragment recusava
// documento e o enxerto virava `invalid_variant` — SEMPRE. Sem enxerto a
// hero caía no modo `montador` (legado/degradado), com um mockup por
// espelho, e saía achatada: botão fora de lugar, logo não trocada, copy
// duplicada com o texto queimado na imagem.
describe("variante cadastrada como documento completo", () => {
  const variantDoc = [
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN">',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"></head>',
    "<body>",
    `<table><tbody>${variantTr}</tbody></table>`,
    "</body></html>",
  ].join("\n")

  it("é enxertada (era invalid_variant)", () => {
    const res = graftHeroVariant(doc, variantDoc)
    expect(res.status).toBe("grafted")
  })

  it("a anatomia da variante entra inteira", () => {
    const { html } = graftHeroVariant(doc, variantDoc)
    expect(html).toContain('bgcolor="#111111"')
    expect(html).toContain("{{HERO_SUBHEADLINE}}")
    expect(html).toContain("{{HERO_CTA_LABEL}}")
  })

  it("a casca do documento não entra junto", () => {
    const { html } = graftHeroVariant(doc, variantDoc)
    const hero = extractHeroBySentinels(html)
    expect(hero).not.toBeNull()
    expect(html.slice(hero!.start, hero!.end)).not.toMatch(
      /<!DOCTYPE|<html[\s>]|<body[\s>]/i,
    )
  })

  it("o resto do email continua intacto", () => {
    const { html } = graftHeroVariant(doc, variantDoc)
    expect(html).toContain("{{BODY_TEXT}}")
    expect(html).toContain("<!-- cfy:block:2:body:start -->")
  })
})
