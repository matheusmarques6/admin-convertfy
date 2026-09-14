import { describe, expect, it } from "vitest"

import { aplicarPaletaPorCodigo } from "./paleta-por-codigo"

const ROLES = { text: "#111111", accent: "#034326", surface: "#F2F2F2", surface_strong: "#E3E3E3", bg: "#FFFFFF", button_bg: "#034326", button_text: "#FFFFFF" }

const DOC = `<html><body><table width="600">
<!-- cfy:block:0:hero:start --><tr><td width="600" bgcolor="#FFFFFF" style="background-color:#FFFFFF"><h1 style="color:#D00000">Oi</h1></td></tr><!-- cfy:block:0:hero:end -->
<!-- cfy:block:1:body:start --><tr><td width="600" bgcolor="#B1B3B6" style="background-color:#B1B3B6"><p style="color:#111111">Texto</p></td></tr><!-- cfy:block:1:body:end -->
</table></body></html>`

describe("aplicarPaletaPorCodigo — o fallback sem o agente", () => {
  it("cor saturada fora da paleta vai para o papel; fundo estranho vai para o fundo da loja", () => {
    const r = aplicarPaletaPorCodigo(DOC, ROLES, ["#FFFFFF", "#F2F2F2", "#E3E3E3", "#034326"])
    expect(r.recolors.map((x) => x.de)).toContain("#D00000")
    expect(r.faixas_corrigidas).toEqual([{ bloco: 1, de: "#B1B3B6", para: "#E3E3E3" }])
    expect(r.html).not.toContain("#D00000")
    expect(r.html).not.toContain("#B1B3B6")
    expect(r.ocorrencias).toBeGreaterThan(0)
  })

  it("peça já conforme não muda nada", () => {
    const limpo = DOC.replace(/#D00000/g, "#034326").replace(/#B1B3B6/g, "#F2F2F2")
    const r = aplicarPaletaPorCodigo(limpo, ROLES, ["#FFFFFF", "#F2F2F2", "#E3E3E3", "#034326"])
    expect(r.html).toBe(limpo)
    expect(r.ocorrencias).toBe(0)
  })

  it("sem lista de aceitas, nenhum fundo é acusado de estranho", () => {
    const r = aplicarPaletaPorCodigo(DOC, ROLES, [])
    expect(r.faixas_corrigidas).toEqual([])
  })
})
