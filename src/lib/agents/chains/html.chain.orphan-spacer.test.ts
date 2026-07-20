import { describe, expect, it } from "vitest"

import {
  DEFAULT_HTML_SYSTEM_PROMPT,
  fixOrphanSpacerDivs,
  fixSpacerColumnWidths,
} from "./html.chain"

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

describe("fixSpacerColumnWidths", () => {
  it("injeta width=\"24\" em <td class=\"mobile-spacer\"> sem width", () => {
    // Caso Luxe Lift carrinho#1: em table-layout:fixed, o spacer sem width
    // dividia o espaco restante meio-a-meio com a coluna de texto (151px cada).
    const html =
      '<table style="table-layout:fixed;width:600px"><tr>' +
      '<td width="238"><img src="p.jpg"></td>' +
      '<td class="mobile-spacer" style="font-size:0">&nbsp;</td>' +
      "<td>Texto do produto aqui</td>" +
      "</tr></table>"
    const out = fixSpacerColumnWidths(html)
    expect(out).toContain('<td width="24" class="mobile-spacer" style="font-size:0">')
    // As demais celulas ficam intactas.
    expect(out).toContain('<td width="238">')
    expect(out).toContain("<td>Texto do produto aqui</td>")
  })

  it("nao mexe em mobile-spacer que JA tem width", () => {
    const html = '<td width="32" class="mobile-spacer">&nbsp;</td>'
    expect(fixSpacerColumnWidths(html)).toBe(html)
  })

  it("casa a classe entre outras classes e em qualquer ordem de atributos", () => {
    const html =
      '<td style="font-size:0" class="hide-desktop mobile-spacer col">&nbsp;</td>'
    const out = fixSpacerColumnWidths(html)
    expect(out).toContain(
      '<td width="24" style="font-size:0" class="hide-desktop mobile-spacer col">',
    )
  })

  it("nao casa classe parcial (ex: mobile-spacer-lg) nem outras celulas", () => {
    const html =
      '<td class="mobile-spacer-lg">&nbsp;</td><td class="content">X</td>'
    expect(fixSpacerColumnWidths(html)).toBe(html)
  })

  it("corrige todas as ocorrencias do documento", () => {
    const row =
      '<td class="mobile-spacer">&nbsp;</td>'
    const html = `<tr>${row}</tr><tr>${row}</tr><tr>${row}</tr>`
    const out = fixSpacerColumnWidths(html)
    expect(out.match(/width="24"/g)?.length).toBe(3)
  })
})

describe("DEFAULT_HTML_SYSTEM_PROMPT — no_orphan_spacer_div", () => {
  it("proibe explicitamente <div> como filho direto de <table>", () => {
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("direct child of <table>")
    expect(DEFAULT_HTML_SYSTEM_PROMPT).toContain("foster-parent")
  })
})
