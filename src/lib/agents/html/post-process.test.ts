import { describe, it, expect } from "vitest"

import {
  postProcessFullDocument,
  collapseRunawaySpacers,
  stripUnresolvedPlaceholders,
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
