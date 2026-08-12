import { describe, it, expect } from "vitest"

import {
  stripAgentProtocolBlocks,
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

  // Caso REAL (Luxe Lift, 12/08): o rodapé saiu com seis retângulos com
  // borda e nada dentro, mais a pílula vazia do logo. O token sumia e a
  // casca ficava. Fixture copiada da reference que gerou o email.
  it("rodapé sem links configurados não deixa botão oco", () => {
    const html =
      '<tr><td width="50%" style="padding:0 7px 14px 0;">' +
      '<a href="{{FOOTER_LINK_1_URL}}" style="display:block; border:1.5px solid #000000; padding:16px 10px;">{{FOOTER_LINK_1_LABEL}}</a>' +
      "</td></tr>"
    const out = stripUnresolvedPlaceholders(html)
    expect(out).not.toContain("<a")
    expect(out).not.toContain("border:1.5px")
    // A célula fica — só o botão sai. Mexer na linha é outro risco.
    expect(out).toContain('<td width="50%"')
  })

  it("pílula do logo vazia sai; a que virou <img> fica", () => {
    const pill = '<span style="border:1px solid #000; border-radius:8px;">'
    expect(stripUnresolvedPlaceholders(`${pill}{{LOGO}}</span>`)).toBe("")
    const withImg = `${pill}<img src="https://cdn/logo.png" alt="">{{LOGO}}</span>`
    expect(stripUnresolvedPlaceholders(withImg)).toContain("<img")
  })

  it("token no meio de frase não leva o elemento junto", () => {
    const html = "<span>Use o código {{COUPON_CODE}} na compra</span>"
    expect(stripUnresolvedPlaceholders(html)).toBe(
      "<span>Use o código  na compra</span>",
    )
  })

  // `&nbsp;` é spacer deliberado, não casca oca — se contasse como vazio, a
  // poda comeria espaçamento que o template pede de propósito.
  it("spacer com &nbsp; sobrevive à poda", () => {
    const html = '<td>{{X_TITLE}}</td><span style="border:1px solid">&nbsp;</span>'
    expect(stripUnresolvedPlaceholders(html)).toContain("&nbsp;")
  })

  it("merge tag do provedor não é tocada", () => {
    const html = '<a href="[unsubscribe_link]">Unsubscribe</a> {{X_TITLE}}'
    const out = stripUnresolvedPlaceholders(html)
    expect(out).toContain("[unsubscribe_link]")
    expect(out).toContain("Unsubscribe")
  })

  it("casca aninhada sai inteira, não só a de dentro", () => {
    const html = '<a href="#" style="border:1px solid"><span>{{CTA_LABEL}}</span></a>'
    expect(stripUnresolvedPlaceholders(html)).toBe("")
  })

  it("sem placeholder pendente, documento passa intacto", () => {
    const html = '<a href="#" style="border:1px solid"></a><p>ok</p>'
    expect(stripUnresolvedPlaceholders(html)).toBe(html)
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

describe("stripAgentProtocolBlocks", () => {
  it("tira o relatório da hero e o JSON de dentro", () => {
    const html = `<td>oi</td><CFY_HERO_REPORT>{"imagem":"aplicada"}</CFY_HERO_REPORT>`
    const out = stripAgentProtocolBlocks(html)
    expect(out).toBe("<td>oi</td>")
    expect(out).not.toContain("imagem")
  })

  it("tira tags de protocolo órfãs", () => {
    expect(stripAgentProtocolBlocks("<CFY_HERO_OUTPUT><td>x</td>")).toBe(
      "<td>x</td>",
    )
  })

  it("não toca em HTML normal nem em merge tags do ESP", () => {
    const html = '<td>[unsubscribe_link] {{ nome }} <a href="#">ok</a></td>'
    expect(stripAgentProtocolBlocks(html)).toBe(html)
  })

  it("não confunde comentário cfy:block com wrapper de protocolo", () => {
    const html = "<!-- cfy:block:0:hero:start --><tr></tr>"
    expect(stripAgentProtocolBlocks(html)).toBe(html)
  })
})
