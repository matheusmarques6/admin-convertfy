/**
 * CONSTÂNCIA DA VIEW — invariante central da arquitetura.
 *
 * A região que o agente ENXERGA tem que ser exatamente a região que o
 * código EDITA. Antes, a view era fatiada por uma regex (`buildExceptionSlots`)
 * e a edição resolvida por outra heurística (`enclosingRow` do Integrador):
 * em tabela aninhada as duas divergiam — o agente julgava o card de review
 * e o código removia a seção inteira em volta. Estes testes travam a
 * invariante contra regressão.
 */
import { describe, it, expect } from "vitest"
import { buildExceptionSlots } from "./copy-merge"
import { applyOps } from "./apply-patches"
import { locateSlots } from "./dom-locator"

/** Estrutura real de um componente da biblioteca: tabela dentro de tabela. */
const DOC = [
  "<!DOCTYPE html><html><body>",
  '<table role="presentation">',
  '  <tr id="section-reviews">',
  "    <td>",
  '      <table role="presentation">',
  '        <tr id="card-1"><td>{{REVIEW_1_TEXT}}</td></tr>',
  '        <tr id="card-2"><td>{{REVIEW_2_TEXT}}</td></tr>',
  "      </table>",
  "    </td>",
  "  </tr>",
  '  <tr id="section-cta"><td>{{CTA_LABEL}}</td></tr>',
  "</table>",
  "</body></html>",
].join("\n")

describe("view do agente == região editada pelo código", () => {
  it("tabela aninhada: a linha vista é a linha removida (e só ela)", () => {
    const [slot] = buildExceptionSlots(DOC, ["REVIEW_1_TEXT"])
    // O agente vê o card, não a seção inteira.
    expect(slot.row_html).toContain('id="card-1"')
    expect(slot.row_html).not.toContain('id="card-2"')
    expect(slot.row_html).not.toContain('id="section-reviews"')

    const res = applyOps(DOC, [{ action: "remove_row", tag: "REVIEW_1_TEXT" }], {
      allowHero: true,
    })
    expect(res.applied).toBe(1)
    // O que sumiu do documento é EXATAMENTE o que estava na view.
    expect(res.html).not.toContain("{{REVIEW_1_TEXT}}")
    expect(res.html).not.toContain('id="card-1"')
    // E o irmão + a seção em volta continuam de pé.
    expect(res.html).toContain('id="card-2"')
    expect(res.html).toContain("{{REVIEW_2_TEXT}}")
    expect(res.html).toContain('id="section-reviews"')
    expect(res.html).toContain("{{CTA_LABEL}}")
  })

  it("a view sai do MESMO localizador que a edição usa (mesmos offsets)", () => {
    const tags = ["REVIEW_1_TEXT", "REVIEW_2_TEXT", "CTA_LABEL"]
    const views = buildExceptionSlots(DOC, tags)
    const located = locateSlots(DOC, tags)
    for (const v of views) {
      const row = located.get(v.tag)!.row!
      expect(v.row_html).toBe(DOC.slice(row.start, row.end))
    }
  })

  it("remover um slot não afeta a região vista dos outros", () => {
    const before = buildExceptionSlots(DOC, ["REVIEW_2_TEXT", "CTA_LABEL"])
    const after = applyOps(
      DOC,
      [{ action: "remove_row", tag: "REVIEW_1_TEXT" }],
      { allowHero: true },
    ).html
    const recomputed = buildExceptionSlots(after, ["REVIEW_2_TEXT", "CTA_LABEL"])
    expect(recomputed.map((s) => s.row_html)).toEqual(
      before.map((s) => s.row_html),
    )
  })
})

describe("constância sob conditional comments do Outlook", () => {
  const MSO = [
    "<table>",
    "  <!--[if mso]><tr><td>{{CTA_LABEL}}</td></tr><![endif]-->",
    '  <tr id="real"><td>{{CTA_LABEL}}</td></tr>',
    "</table>",
  ].join("\n")

  it("a view aponta pra linha REAL, e a remoção acerta a mesma linha", () => {
    const [slot] = buildExceptionSlots(MSO, ["CTA_LABEL"])
    expect(slot.row_html).toContain('id="real"')

    const res = applyOps(MSO, [{ action: "remove_row", tag: "CTA_LABEL" }], {
      allowHero: true,
    })
    expect(res.applied).toBe(1)
    expect(res.html).not.toContain('id="real"')
    // O branch MSO é preservado byte a byte (o parser nunca o reescreve).
    expect(res.html).toContain("<!--[if mso]>")
    expect(res.html).toContain("<![endif]-->")
  })
})

describe("slot fora de tabela", () => {
  it("view cai pra célula/vizinhança e a remoção é RECUSADA (sem chute)", () => {
    const html = "<html><body><div>{{SOLTO}}</div></body></html>"
    const [slot] = buildExceptionSlots(html, ["SOLTO"])
    expect(slot.row_html).toContain("{{SOLTO}}")

    const res = applyOps(html, [{ action: "remove_row", tag: "SOLTO" }], {
      allowHero: true,
    })
    expect(res.applied).toBe(0)
    expect(res.skipped[0].reason).toBe("row_not_removable")
    expect(res.html).toBe(html) // documento intacto
  })
})
