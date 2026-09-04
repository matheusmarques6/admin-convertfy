import { describe, it, expect } from "vitest"
import { checarInvariantesDeTipografia } from "./guards"
import { applyTypographyOps } from "./apply"

const HTML = `<!DOCTYPE html><html><head></head><body>
<table><tr><td style="background:#FFFFFF;">
  <div style="font-family:Montserrat,Arial;font-size:56px;font-weight:400;">TÍTULO</div>
  <p style="font-family:Montserrat,Arial;font-size:14px;">corpo</p>
</td></tr></table>
</body></html>`

describe("checarInvariantesDeTipografia", () => {
  it("aprova o que o apply faz — só valores de estilo mudam", () => {
    const r = applyTypographyOps(
      HTML,
      [{ item: 0, peso: 900, tamanho_px: 48, motivo: "x" }],
      null,
    )
    expect(checarInvariantesDeTipografia(HTML, r.html)).toEqual({
      ok: true,
      violacao: null,
    })
  })

  it("reprova documento que perdeu uma tabela", () => {
    const semTabela = HTML.replace("<table>", "").replace("</table>", "")
    expect(checarInvariantesDeTipografia(HTML, semTabela).violacao).toBe(
      "table_count_changed_by_typography",
    )
  })

  it("reprova documento que perdeu uma declaração de fonte", () => {
    const semFonte = HTML.replace("font-family:Montserrat,Arial;font-size:14px;", "font-size:14px;")
    expect(checarInvariantesDeTipografia(HTML, semFonte).violacao).toBe(
      "font_declaration_count_changed",
    )
  })

  it("reprova declaração a MAIS — inventar endereço desalinha as ops", () => {
    const aMais = HTML.replace(
      '<p style="font-family:Montserrat,Arial;font-size:14px;">corpo</p>',
      '<p style="font-family:Montserrat,Arial;font-size:14px;">corpo</p><span style="font-family:Sora;">extra</span>',
    )
    expect(checarInvariantesDeTipografia(HTML, aMais).violacao).toBe(
      "font_declaration_count_changed",
    )
  })

  it("aceita a contagem de entrada já calculada, sem varrer de novo", () => {
    const r = applyTypographyOps(HTML, [{ item: 1, peso: 600, motivo: "x" }], null)
    expect(checarInvariantesDeTipografia(HTML, r.html, 2).ok).toBe(true)
    // Contagem errada de propósito: o guard confia no número recebido.
    expect(checarInvariantesDeTipografia(HTML, r.html, 3).violacao).toBe(
      "font_declaration_count_changed",
    )
  })
})
