import { describe, it, expect } from "vitest"
import { annotateFontDeclarations, FONT_ATTR } from "./annotate"
import { extractTypographyInventory } from "./inventory"

const HTML = `<!DOCTYPE html><html><head><style>body{font-family:Arial;}</style></head><body>
<table><tr><td style="background:#FFFFFF;">
  <div style="font-family:Montserrat,Arial;font-size:56px;">TÍTULO</div>
  <a href="https://loja.com/x" style="font-family:Montserrat,Arial;font-size:30px;">SHOP NOW</a>
</td></tr></table>
</body></html>`

describe("annotateFontDeclarations", () => {
  it("anota cada declaração com o índice do inventário", () => {
    const out = annotateFontDeclarations(HTML)
    expect(out).toContain(`<div ${FONT_ATTR}="0"`)
    expect(out).toContain(`<a ${FONT_ATTR}="1"`)
  })

  it("não toca no <style> do head — ele nem entra no inventário", () => {
    const out = annotateFontDeclarations(HTML)
    expect(out).toContain("<head><style>body{font-family:Arial;}</style></head>")
  })

  it("os índices batem com os do inventário, um a um", () => {
    const inv = extractTypographyInventory(HTML)
    const out = annotateFontDeclarations(HTML)
    for (const oc of inv) {
      expect(out).toContain(`${FONT_ATTR}="${oc.index}"`)
    }
    expect(out.match(new RegExp(FONT_ATTR, "g"))).toHaveLength(inv.length)
  })

  it("não altera o texto nem a contagem de declarações", () => {
    const out = annotateFontDeclarations(HTML)
    const texto = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
    expect(texto(out)).toBe(texto(HTML))
    expect(extractTypographyInventory(out)).toHaveLength(
      extractTypographyInventory(HTML).length,
    )
  })

  it("declaração dentro de <style> NO CORPO não vira alvo de clique", () => {
    const comStyleNoCorpo = `<html><body><style>.x{font-family:Sora;}</style>
      <p style="font-family:Montserrat;">oi</p></body></html>`
    const out = annotateFontDeclarations(comStyleNoCorpo)
    // A do <style> continua no inventário (índice 0) e não é anotada.
    expect(extractTypographyInventory(comStyleNoCorpo)).toHaveLength(2)
    expect(out).not.toContain(`${FONT_ATTR}="0"`)
    expect(out).toContain(`<p ${FONT_ATTR}="1"`)
  })

  it("documento sem fonte declarada volta intacto", () => {
    const semFonte = "<html><body><p>oi</p></body></html>"
    expect(annotateFontDeclarations(semFonte)).toBe(semFonte)
  })
})
