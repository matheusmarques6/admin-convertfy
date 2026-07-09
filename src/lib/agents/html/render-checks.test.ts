import { describe, expect, it } from "vitest"

import { computeRenderChecks } from "./render-checks"
import { DEFAULT_REFERENCE_SKELETON } from "./default-reference"

const OK_EMAIL = `<!DOCTYPE html><html lang="pt-BR"><body>
<table role="presentation"><tr><td>
<img src="https://img/x.jpg" alt="Produto X">
<a href="https://loja.com/produto">Comprar</a>
<a href="[unsubscribe_link]">Unsubscribe</a>
</td></tr></table></body></html>`

describe("computeRenderChecks", () => {
  it("email bem formado → sem issues", () => {
    expect(computeRenderChecks(OK_EMAIL)).toEqual([])
  })

  it("html vazio → sem issues (nada a validar)", () => {
    expect(computeRenderChecks("")).toEqual([])
    expect(computeRenderChecks("   ")).toEqual([])
  })

  it("sem unsubscribe → issue compliance/medium", () => {
    const html = OK_EMAIL.replace(
      '<a href="[unsubscribe_link]">Unsubscribe</a>',
      "",
    )
    const issues = computeRenderChecks(html)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe("compliance")
    expect(issues[0].severity).toBe("medium")
  })

  it("aceita variantes de unsubscribe: Liquid, Mailchimp e texto pt", () => {
    for (const tag of [
      "{% unsubscribe %}",
      "*|UNSUB|*",
      '<a href="#u">Descadastre-se</a>',
    ]) {
      const html = OK_EMAIL.replace(
        '<a href="[unsubscribe_link]">Unsubscribe</a>',
        tag,
      )
      expect(
        computeRenderChecks(html).filter((i) => i.type === "compliance"),
      ).toEqual([])
    }
  })

  it('href="#" placeholder → issue links_quebrados com contagem', () => {
    const html = OK_EMAIL.replace(
      'href="https://loja.com/produto"',
      'href="#"',
    ).replace("</td>", '<a href="#">Outro</a></td>')
    const issues = computeRenderChecks(html)
    const link = issues.find((i) => i.type === "links_quebrados")
    expect(link).toBeDefined()
    expect(link?.message).toContain("2")
    expect(link?.severity).toBe("low")
  })

  it("img sem alt (ou alt vazio) → issue alt_text_faltando", () => {
    const html = OK_EMAIL.replace(
      '<img src="https://img/x.jpg" alt="Produto X">',
      '<img src="https://img/x.jpg"><img src="https://img/y.jpg" alt="">',
    )
    const issues = computeRenderChecks(html)
    const alt = issues.find((i) => i.type === "alt_text_faltando")
    expect(alt).toBeDefined()
    expect(alt?.message).toContain("2")
  })

  it("layout div-only (sem table role=presentation) → issue html_invalido", () => {
    const html = `<!DOCTYPE html><html><body><div>oi</div>
      <a href="[unsubscribe_link]">unsubscribe</a></body></html>`
    const issues = computeRenderChecks(html)
    expect(issues.map((i) => i.type)).toContain("html_invalido")
  })

  it("esqueleto default de referência passa limpo (dogfooding)", () => {
    // O próprio DEFAULT_REFERENCE_SKELETON deve ser um email válido pelos
    // critérios daqui — tem unsubscribe, tabelas e nenhum href="#".
    // ({{CTA_URL}} é placeholder do repaint, não href="#".)
    expect(computeRenderChecks(DEFAULT_REFERENCE_SKELETON)).toEqual([])
  })
})
