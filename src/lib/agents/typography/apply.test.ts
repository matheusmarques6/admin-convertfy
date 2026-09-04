import { describe, it, expect } from "vitest"
import { applyTypographyOps, injectSecondaryFontLink, setProp } from "./apply"
import { extractTypographyInventory } from "./inventory"
import type { SegundaFonte } from "./rules"

const HTML = `<!DOCTYPE html><html><head><style>body{font-family:Arial;}</style></head><body>
<table><tr><td style="background:#FFFFFF;">
  <div style="font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:56px;font-weight:400;color:#1F1F1F;">INNOVA BAY VS OTHERS</div>
  <a href="https://loja.com/x" style="font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:30px;font-weight:900;">SHOP NOW</a>
  <p style="font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:14px;">Unsubscribe</p>
</td></tr></table>
</body></html>`

const PLAYFAIR: SegundaFonte = {
  familia: "Playfair Display",
  onde: "destaque",
  classe: "serif",
  fallback: "Georgia, 'Times New Roman', serif",
}

describe("setProp", () => {
  it("substitui a propriedade existente, preservando o resto", () => {
    expect(setProp("font-size:20px;font-weight:400;color:#000", "font-weight", "900")).toBe(
      "font-size:20px;font-weight:900;color:#000",
    )
  })
  it("acrescenta quando a propriedade não existe", () => {
    expect(setProp("font-size:20px", "letter-spacing", "0.06em")).toBe(
      "font-size:20px;letter-spacing:0.06em",
    )
  })
})

describe("applyTypographyOps", () => {
  it("troca peso e caixa só no item endereçado", () => {
    const r = applyTypographyOps(HTML, [{ item: 0, peso: 900, caixa: "alta", motivo: "x" }], null)
    expect(r.aplicadas).toBe(1)
    const inv = extractTypographyInventory(r.html)
    expect(inv[0]).toMatchObject({ weight: 900, uppercase: true, sizePx: 56 })
    // Os outros itens ficam byte a byte iguais.
    expect(inv[1]).toMatchObject({ weight: 900, sizePx: 30, uppercase: false })
    expect(inv[2]).toMatchObject({ sizePx: 14 })
  })

  it("troca a família pela secundária, com o substituto declarado", () => {
    const r = applyTypographyOps(HTML, [{ item: 0, fonte: "secundaria", motivo: "x" }], PLAYFAIR)
    expect(r.familiasTrocadas).toBe(1)
    expect(r.html).toContain("font-family:'Playfair Display',Georgia, 'Times New Roman', serif")
    expect(r.html).toContain("INNOVA BAY VS OTHERS")
  })

  it("sem segunda fonte, a op de família não muda a família", () => {
    const r = applyTypographyOps(HTML, [{ item: 0, fonte: "secundaria", peso: 700, motivo: "x" }], null)
    expect(r.familiasTrocadas).toBe(0)
    expect(extractTypographyInventory(r.html)[0].family.startsWith("Montserrat")).toBe(true)
    expect(extractTypographyInventory(r.html)[0].weight).toBe(700)
  })

  it("não toca no <style> do head nem no texto, links e estrutura", () => {
    const r = applyTypographyOps(
      HTML,
      [
        { item: 0, peso: 900, motivo: "x" },
        { item: 2, tracking: "0.08em", motivo: "y" },
      ],
      null,
    )
    expect(r.html).toContain("<style>body{font-family:Arial;}</style>")
    expect(r.html).toContain('href="https://loja.com/x"')
    expect((r.html.match(/<table/g) ?? []).length).toBe((HTML.match(/<table/g) ?? []).length)
    expect(r.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).toBe(
      HTML.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "),
    )
  })

  it("várias ops não deslocam os índices umas das outras", () => {
    const r = applyTypographyOps(
      HTML,
      [
        { item: 0, fonte: "secundaria", peso: 700, motivo: "a" },
        { item: 1, caixa: "alta", tracking: "0.06em", motivo: "b" },
        { item: 2, peso: 400, motivo: "c" },
      ],
      PLAYFAIR,
    )
    expect(r.aplicadas).toBe(3)
    const inv = extractTypographyInventory(r.html)
    expect(inv[0].family.startsWith("'Playfair Display'")).toBe(true)
    expect(inv[0].weight).toBe(700)
    expect(inv[1]).toMatchObject({ uppercase: true, tracking: "0.06em" })
    expect(inv[1].family.startsWith("Montserrat")).toBe(true)
    expect(inv[2].weight).toBe(400)
  })

  it("lista vazia devolve o documento intacto", () => {
    expect(applyTypographyOps(HTML, [], PLAYFAIR).html).toBe(HTML)
  })
})

describe("ops do humano (família livre e tamanho)", () => {
  it("escreve a família pedida com a cadeia de substituto derivada do nome", () => {
    const r = applyTypographyOps(
      HTML,
      [{ item: 0, familia: "Playfair Display", motivo: "humano" }],
      null,
    )
    expect(r.familiasTrocadas).toBe(1)
    expect(r.html).toContain("font-family:'Playfair Display',Georgia,'Times New Roman',serif")
    // Serifada → substituto serifado; sans continuaria em Arial.
    const sans = applyTypographyOps(HTML, [{ item: 0, familia: "Sora", motivo: "x" }], null)
    expect(sans.html).toContain("font-family:Sora,Arial,Helvetica,sans-serif")
  })

  it("família livre vence a secundária no mesmo item", () => {
    const r = applyTypographyOps(
      HTML,
      [{ item: 0, fonte: "secundaria", familia: "Sora", motivo: "x" }],
      PLAYFAIR,
    )
    expect(r.html).toContain("font-family:Sora,")
    expect(r.html).not.toContain("font-family:'Playfair Display'")
  })

  it("recusa nome que escaparia do atributo style — o furo de injeção", () => {
    const venenos = [
      'Arial";x="',
      "Arial;color:red",
      "Arial}<script>",
      "url(javascript:alert(1))",
      "expression(alert(1))",
      "  ",
    ]
    for (const familia of venenos) {
      const r = applyTypographyOps(HTML, [{ item: 0, familia, motivo: "x" }], null)
      expect(r.familiasTrocadas, familia).toBe(0)
      expect(r.html, familia).toBe(HTML)
    }
  })

  it("nome recusado NÃO cai na secundária do agente — a op some inteira", () => {
    const r = applyTypographyOps(
      HTML,
      [{ item: 0, fonte: "secundaria", familia: 'Arial";x="', motivo: "x" }],
      PLAYFAIR,
    )
    expect(r.html).toBe(HTML)
  })

  it("aceita os nomes reais da biblioteca", () => {
    for (const familia of ["Sora", "Playfair Display", "Source Serif 4", "IBM Plex Sans"]) {
      const r = applyTypographyOps(HTML, [{ item: 0, familia, motivo: "x" }], null)
      expect(r.familiasTrocadas, familia).toBe(1)
    }
  })

  it("escreve font-size em px sem tocar no resto da declaração", () => {
    const r = applyTypographyOps(HTML, [{ item: 2, tamanho_px: 18, motivo: "x" }], null)
    const inv = extractTypographyInventory(r.html)
    expect(inv[2].sizePx).toBe(18)
    expect(inv[0].sizePx).toBe(56)
    expect(inv[1].sizePx).toBe(30)
  })

  it("não muda a contagem de declarações nem o texto do documento", () => {
    const r = applyTypographyOps(
      HTML,
      [
        { item: 0, familia: "Sora", tamanho_px: 40, motivo: "x" },
        { item: 2, peso: 600, motivo: "y" },
      ],
      null,
    )
    expect(extractTypographyInventory(r.html)).toHaveLength(
      extractTypographyInventory(HTML).length,
    )
    const texto = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
    expect(texto(r.html)).toBe(texto(HTML))
  })
})

describe("injectSecondaryFontLink", () => {
  it("declara a webfont fora do Outlook e é idempotente", () => {
    const uma = injectSecondaryFontLink(HTML, PLAYFAIR, [400, 700])
    expect(uma).toContain("fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700")
    expect(uma).toContain("<!--[if !mso]><!-->")
    expect(injectSecondaryFontLink(uma, PLAYFAIR, [400, 700])).toBe(uma)
  })

  it("sem segunda fonte não mexe no documento", () => {
    expect(injectSecondaryFontLink(HTML, null, [400])).toBe(HTML)
  })
})
