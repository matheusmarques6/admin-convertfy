import { describe, it, expect } from "vitest"

import {
  postProcessFullDocument,
  collapseRunawaySpacers,
  stripUnresolvedPlaceholders,
  stripCfyBlockMarkers,
  stripNbspIndentation,
  HtmlTruncatedError,
} from "./post-process"

describe("postProcessFullDocument", () => {
  it("remove fences, extrai o doctype e força o lang", () => {
    const raw = '```html\n<!DOCTYPE html><html lang="en"><body>oi</body></html>\n```'
    const out = postProcessFullDocument(raw, "pt-BR")
    expect(out.startsWith("<!DOCTYPE html>")).toBe(true)
    expect(out).toContain('lang="pt-BR"')
    expect(out).not.toContain("```")
  })

  it("lança HtmlTruncatedError com o raw quando falta </html>", () => {
    const raw = "<!DOCTYPE html><html><body>cortado no meio"
    try {
      postProcessFullDocument(raw)
      expect.unreachable("deveria lançar")
    } catch (err) {
      expect(err).toBeInstanceOf(HtmlTruncatedError)
      expect((err as HtmlTruncatedError).raw).toBe(raw)
      expect((err as HtmlTruncatedError).name).toBe("HtmlTruncatedError")
    }
  })

  it("limpa placeholders MAIÚSCULOS não resolvidos e preserva merge tags", () => {
    const raw =
      "<!DOCTYPE html><html><body>{{HEADLINE}} {{ unsubscribe }} {% if %}</body></html>"
    const out = postProcessFullDocument(raw)
    expect(out).not.toContain("{{HEADLINE}}")
    expect(out).toContain("{{ unsubscribe }}")
    expect(out).toContain("{% if %}")
  })
})

describe("collapseRunawaySpacers", () => {
  it("colapsa runs longos de nbsp pra 3", () => {
    const spam = "&nbsp;".repeat(50)
    expect(collapseRunawaySpacers(`<div>${spam}</div>`)).toBe(
      "<div>&nbsp;&nbsp;&nbsp;</div>",
    )
  })
  it("não toca runs curtos", () => {
    const short = "&nbsp;&nbsp;&nbsp;"
    expect(collapseRunawaySpacers(`<div>${short}</div>`)).toBe(
      `<div>${short}</div>`,
    )
  })
})

describe("stripUnresolvedPlaceholders", () => {
  it("remove tokens de conteúdo, mantém texto ao redor", () => {
    expect(stripUnresolvedPlaceholders("a {{X_TITLE}} b")).toBe("a  b")
  })
})

describe("collapseRunawaySpacers — regressão do U+00A0", () => {
  it("NÃO colapsa indentação normal de 12+ espaços (caso Luxe Lift)", () => {
    const html = "<tr>\n            <td>What you left behind</td>\n</tr>"
    expect(collapseRunawaySpacers(html)).toBe(html)
  })
  it("colapsa 12+ U+00A0 crus", () => {
    const spam = " ".repeat(20)
    expect(collapseRunawaySpacers(`<div>${spam}</div>`)).toBe(
      "<div>&nbsp;&nbsp;&nbsp;</div>",
    )
  })
})

describe("stripCfyBlockMarkers", () => {
  it("remove os marcadores do Montador e nada mais", () => {
    const html = [
      "<!-- cfy:block:0:hero:start -->",
      "<table><tr><td>hero</td></tr></table>",
      "<!-- cfy:block:0:hero:end -->",
      "<!-- comentario legitimo -->",
    ].join("\n")
    const out = stripCfyBlockMarkers(html)
    expect(out).not.toContain("cfy:block")
    expect(out).toContain("<!-- comentario legitimo -->")
    expect(out).toContain("<td>hero</td>")
  })
})

describe("stripNbspIndentation", () => {
  it("remove &nbsp; de início de linha, preserva no meio do texto", () => {
    const html = "<td>\n&nbsp;&nbsp;&nbsp;What you left behind\n</td><span>a&nbsp;b</span>"
    const out = stripNbspIndentation(html)
    expect(out).toContain("\nWhat you left behind")
    expect(out).toContain("a&nbsp;b")
  })
  it("remove também após indentação de espaços", () => {
    const html = "<tr>\n   &nbsp;&nbsp;&nbsp;<table>x</table>\n</tr>"
    expect(stripNbspIndentation(html)).toContain("\n   <table>x</table>")
  })
})
