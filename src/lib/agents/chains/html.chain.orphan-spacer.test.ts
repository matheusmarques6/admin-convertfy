import { describe, expect, it } from "vitest"

import { DEFAULT_HTML_SYSTEM_PROMPT, fixOrphanSpacerDivs } from "./html.chain"

describe("fixOrphanSpacerDivs", () => {
  it("converte <div height> orfao (entre </tr> e <tr>) num spacer <tr><td>", () => {
    const html =
      '<table><tr><td>A</td></tr><div style="height:64px"></div><tr><td>B</td></tr></table>'
    const out = fixOrphanSpacerDivs(html)
    // A <div> orfa sumiu; virou uma linha de tabela valida.
    expect(out).not.toContain("<div")
    expect(out).toContain(
      '<tr><td style="height:64px;line-height:64px;font-size:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>',
    )
  })

  it("corrige multiplas divs orfas (caso Luxe Lift: 64+16+16+80+96)", () => {
    const html = [
      "<table>",
      "<tr><td>hero</td></tr>",
      '<div style="height:64px"></div>',
      "<tr><td>body</td></tr>",
      '<div style="height:16px"></div>',
      "<tr><td>offer</td></tr>",
      '<div style="height:16px"></div>',
      "<tr><td>cta</td></tr>",
      '<div style="height:80px"></div>',
      "<tr><td>reviews</td></tr>",
      '<div style="height:96px"></div>',
      "<tr><td>footer</td></tr>",
      "</table>",
    ].join("")
    const out = fixOrphanSpacerDivs(html)
    expect(out).not.toContain("<div")
    // 5 spacers convertidos.
    expect(out.match(/mso-line-height-rule:exactly/g)?.length).toBe(5)
    expect(out).toContain("height:96px;line-height:96px")
  })

  it("aceita variacoes de whitespace/aspas na altura", () => {
    const html =
      "<table><tr><td>A</td></tr>\n  <div  style='height: 24px ;background:#fff'></div>\n<tr><td>B</td></tr></table>"
    const out = fixOrphanSpacerDivs(html)
    expect(out).not.toContain("<div")
    expect(out).toContain("height:24px;line-height:24px")
  })

  it("nao toca em <div> validas dentro de <td> (ex: hero overlay)", () => {
    const html =
      '<table><tr><td><div style="height:750px;background-image:url(x)"></div></td></tr></table>'
    const out = fixOrphanSpacerDivs(html)
    // Continua igual — a div esta legitimamente dentro de um <td>.
    expect(out).toBe(html)
  })
})

describe("DEFAULT_HTML_SYSTEM_PROMPT — no_orphan_spacer_div", () => {
  it("proibe explicitamente <div> como filho direto de <table>", () => {
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("direct child of <table>")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("foster-parent")
  })
})
