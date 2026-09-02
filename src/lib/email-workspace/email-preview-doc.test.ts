import { describe, it, expect } from "vitest"
import {
  buildEmailPreviewDoc,
  neutralizeMobileMediaQueries,
} from "./email-preview-doc"

describe("buildEmailPreviewDoc", () => {
  it("<tr> entra direto no tbody da tabela de 600", () => {
    const doc = buildEmailPreviewDoc("<tr><td>linha</td></tr>")
    expect(doc).toContain('width="600"')
    expect(doc).toContain("width:600px;min-width:600px;max-width:600px")
    expect(doc).toContain("<tbody><tr><td>linha</td></tr></tbody>")
  })

  it("<table> e outro conteúdo são embrulhados em <tr><td>", () => {
    expect(buildEmailPreviewDoc("<table><tr><td>a</td></tr></table>")).toContain(
      '<tbody><tr><td style="padding:0"><table><tr><td>a</td></tr></table></td></tr></tbody>',
    )
    expect(buildEmailPreviewDoc("<div>a</div>")).toContain(
      '<tr><td style="padding:0"><div>a</div></td></tr>',
    )
  })

  it("documento completo vai como está (sem segundo embrulho)", () => {
    const html = "<!DOCTYPE html><html><body><table width=\"600\"></table></body></html>"
    expect(buildEmailPreviewDoc(html)).toBe(html)
  })

  it("sem HTML mostra o placeholder dentro da tabela", () => {
    const doc = buildEmailPreviewDoc("")
    expect(doc).toContain("Sem HTML para renderizar")
    expect(doc).toContain('width="600"')
  })

  it("largura configurável", () => {
    expect(buildEmailPreviewDoc("<tr></tr>", { width: 640 })).toContain('width="640"')
  })
})

describe("neutralizeMobileMediaQueries", () => {
  it("max-width no prelúdio vira 0px; o corpo da regra não muda", () => {
    const css =
      "<style>@media only screen and (max-width: 620px) { .col { max-width:100% !important; } }</style>"
    const out = neutralizeMobileMediaQueries(css)
    expect(out).toContain("@media only screen and (max-width:0px) {")
    expect(out).toContain(".col { max-width:100% !important; }")
  })
  it("media query sem max-width fica intacta", () => {
    const css = "@media (prefers-color-scheme: dark) { body { background:#000 } }"
    expect(neutralizeMobileMediaQueries(css)).toBe(css)
  })
  it("documento completo do preview também é neutralizado", () => {
    const html =
      "<!DOCTYPE html><html><head><style>@media (max-width:600px){.a{display:none}}</style></head><body></body></html>"
    expect(buildEmailPreviewDoc(html)).toContain("(max-width:0px)")
  })
})
