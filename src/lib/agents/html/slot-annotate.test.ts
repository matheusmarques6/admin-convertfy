/**
 * Anotação de slots (Fase 2): endereço DECLARADO por atributo.
 * O ganho decisivo é o último bloco — o slot continua endereçável depois
 * que a copy substitui o token.
 */
import { describe, it, expect } from "vitest"
import {
  annotateSlots,
  stripSlotAttributes,
  readAnnotatedSlots,
} from "./slot-annotate"

const NESTED = [
  "<table>",
  "  <tr>",
  "    <td>",
  "      <table>",
  "        <tr><td>{{REVIEW_1_TEXT}}</td></tr>",
  "        <tr><td>{{REVIEW_2_TEXT}}</td></tr>",
  "      </table>",
  "    </td>",
  "  </tr>",
  "</table>",
].join("\n")

describe("annotateSlots", () => {
  it("declara slot na célula e linha na <tr> INTERNA de cada card", () => {
    const { html, annotated } = annotateSlots(NESTED)
    expect(annotated).toBeGreaterThan(0)
    expect(html).toContain('<td data-cfy-slot="REVIEW_1_TEXT">{{REVIEW_1_TEXT}}</td>')
    expect(html).toContain('<tr data-cfy-row="REVIEW_1_TEXT">')
    // Linhas distintas: a anotação não junta os dois cards.
    expect(html).toContain('<tr data-cfy-row="REVIEW_2_TEXT">')
  })

  it("célula com 2 slots recebe os dois nomes no mesmo atributo", () => {
    const html = "<table><tr><td>{{A}} — {{B}}</td></tr></table>"
    expect(annotateSlots(html).html).toContain('data-cfy-slot="A B"')
  })

  it("é idempotente (rodar 2x não duplica atributo)", () => {
    const once = annotateSlots(NESTED).html
    const twice = annotateSlots(once)
    expect(twice.annotated).toBe(0)
    expect(twice.html).toBe(once)
  })

  it("preserva atributos existentes e tags auto-fechadas", () => {
    const html = '<table><tr><td class="x"><img src="{{HERO_IMAGE}}"/></td></tr></table>'
    const out = annotateSlots(html).html
    expect(out).toContain('class="x"')
    expect(out).toContain("/>")
    expect(out).toMatch(/data-cfy-slot="HERO_IMAGE"/)
  })

  it("não anota slot dentro de conditional comment do Outlook", () => {
    const html = "<table><!--[if mso]><tr><td>{{X}}</td></tr><![endif]--></table>"
    const out = annotateSlots(html).html
    expect(out).toBe(html)
  })
})

describe("stripSlotAttributes", () => {
  it("remove os atributos internos na limpeza final", () => {
    const annotated = annotateSlots(NESTED).html
    const clean = stripSlotAttributes(annotated)
    expect(clean).not.toContain("data-cfy-slot")
    expect(clean).not.toContain("data-cfy-row")
    expect(clean).toBe(NESTED)
  })
})

describe("readAnnotatedSlots — endereço sobrevive à copy", () => {
  it("localiza o slot mesmo DEPOIS do token virar texto", () => {
    const annotated = annotateSlots(NESTED).html
    // Simula o merge: a copy substitui o token.
    const filled = annotated.replace("{{REVIEW_1_TEXT}}", "Produto excelente")
    expect(filled).not.toContain("{{REVIEW_1_TEXT}}")

    const slots = readAnnotatedSlots(filled)
    const s = slots.get("REVIEW_1_TEXT")!
    expect(s.cell).not.toBeNull()
    // A célula endereçada é a que contém a copy aplicada.
    expect(filled.slice(s.cell!.start, s.cell!.end)).toContain(
      "Produto excelente",
    )
    // E a linha continua sendo o card correto, não o vizinho.
    expect(filled.slice(s.row!.start, s.row!.end)).not.toContain(
      "{{REVIEW_2_TEXT}}",
    )
  })

  it("resolve o elemento completo com aninhamento (não para no 1º fechamento)", () => {
    const html = annotateSlots(
      "<table><tr><td><table><tr><td>{{A}}</td></tr></table></td></tr></table>",
    ).html
    const s = readAnnotatedSlots(html).get("A")!
    const rowHtml = html.slice(s.row!.start, s.row!.end)
    expect(rowHtml.startsWith("<tr")).toBe(true)
    expect(rowHtml.endsWith("</tr>")).toBe(true)
  })
})
