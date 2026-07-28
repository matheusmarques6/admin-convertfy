/**
 * dom-locator — endereçamento por AST com posição de origem.
 *
 * Os casos aqui são os que a heurística de regex ERRAVA em produção
 * (Luxe Lift, 28/07): tabela aninhada (regex contava <tr> demais →
 * row_not_removable ou linha errada removida) e branch MSO (tag duplicada
 * em conditional comment).
 */
import { describe, it, expect } from "vitest"
import {
  locateAllSlots,
  locateSlots,
  enclosingRow,
  visibleTextOf,
  applySplices,
} from "./dom-locator"

// Card de review: <tr> externa → <table> interna → <tr> interna com o slot.
// É a forma real dos componentes da biblioteca (e o caso que quebrava).
const NESTED = [
  "<table>",
  '  <tr id="outer-1">',
  "    <td>",
  "      <table>",
  '        <tr id="inner-1"><td>{{REVIEW_1_TEXT}}</td></tr>',
  '        <tr id="inner-2"><td>{{REVIEW_1_NAME}}</td></tr>',
  "      </table>",
  "    </td>",
  "  </tr>",
  '  <tr id="outer-2"><td>{{FOOTER_LINE}}</td></tr>',
  "</table>",
].join("\n")

describe("locateAllSlots — <tr> envolvente vem da ÁRVORE, não de regex", () => {
  it("tabela aninhada: cada slot aponta pra SUA linha interna", () => {
    const slots = locateAllSlots(NESTED)
    expect(slots.map((s) => s.tag)).toEqual([
      "REVIEW_1_TEXT",
      "REVIEW_1_NAME",
      "FOOTER_LINE",
    ])

    const text = slots[0]
    expect(text.row).not.toBeNull()
    // A linha localizada é a INTERNA (inner-1) — não a externa que a
    // heurística de regex pegava.
    const rowHtml = NESTED.slice(text.row!.start, text.row!.end)
    expect(rowHtml).toContain('id="inner-1"')
    expect(rowHtml).not.toContain('id="outer-1"')
    // E a célula é o <td> exato do slot.
    expect(NESTED.slice(text.cell!.start, text.cell!.end)).toBe(
      "<td>{{REVIEW_1_TEXT}}</td>",
    )
  })

  it("slots irmãos não compartilham linha (remoção de um não leva o outro)", () => {
    const slots = locateAllSlots(NESTED)
    const [t, n] = slots
    expect(t.row!.start).not.toBe(n.row!.start)
  })

  it("slot da linha externa resolve pra linha externa", () => {
    const footer = locateAllSlots(NESTED).find((s) => s.tag === "FOOTER_LINE")!
    expect(NESTED.slice(footer.row!.start, footer.row!.end)).toContain(
      'id="outer-2"',
    )
  })
})

describe("conditional comments do Outlook", () => {
  const MSO = [
    "<table>",
    "  <!--[if mso]>",
    "  <tr><td>{{CTA_LABEL}}</td></tr>",
    "  <![endif]-->",
    "  <tr><td>{{CTA_LABEL}}</td></tr>",
    "</table>",
  ].join("\n")

  it("marca o token dentro do comentário e NÃO inventa linha pra ele", () => {
    const slots = locateAllSlots(MSO)
    expect(slots).toHaveLength(2)
    const inMso = slots.find((s) => s.inMsoComment)!
    expect(inMso.row).toBeNull() // remoção será recusada, não adivinhada
    const real = slots.find((s) => !s.inMsoComment)!
    expect(real.row).not.toBeNull()
  })

  it("locateSlots elege a ocorrência REAL como âncora, não a do MSO", () => {
    const map = locateSlots(MSO, ["CTA_LABEL"])
    expect(map.get("CTA_LABEL")!.inMsoComment).toBe(false)
  })
})

describe("enclosingRow", () => {
  it("offset fora de tabela → null (sem chute)", () => {
    const html = "<div>{{SOLTO}}</div>"
    expect(enclosingRow(html, html.indexOf("{{SOLTO}}"))).toBeNull()
  })
})

describe("visibleTextOf", () => {
  it("extrai o texto que o cliente de email mostra", () => {
    const html = '<td><h1>Olá</h1><!-- nota --><span>&nbsp;mundo</span></td>'
    expect(visibleTextOf(html, { start: 0, end: html.length })).toBe("Olá mundo")
  })
})

describe("applySplices — edições por offset, de trás pra frente", () => {
  const DOC = "AAA[um]BBB[dois]CCC"

  it("aplica múltiplas edições sem invalidar offsets", () => {
    const r = applySplices(DOC, [
      { start: 3, end: 7, replacement: "X" }, // [um]
      { start: 10, end: 16, replacement: "Y" }, // [dois]
    ])
    expect(r.applied).toBe(2)
    expect(r.html).toBe("AAAXBBBYCCC")
    expect(r.rejected).toEqual([])
  })

  it("edições sobrepostas: a da direita vence, a outra é rejeitada", () => {
    const r = applySplices(DOC, [
      { start: 3, end: 12, replacement: "X" },
      { start: 10, end: 16, replacement: "Y" },
    ])
    expect(r.applied).toBe(1)
    expect(r.rejected).toHaveLength(1)
    expect(r.html).toContain("Y")
  })

  it("range inválido é rejeitado sem corromper o documento", () => {
    const r = applySplices(DOC, [
      { start: 5, end: 3, replacement: "X" },
      { start: 0, end: 999, replacement: "Y" },
    ])
    expect(r.applied).toBe(0)
    expect(r.html).toBe(DOC)
    expect(r.rejected).toHaveLength(2)
  })
})
