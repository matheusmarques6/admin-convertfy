import { describe, it, expect } from "vitest"
import { aplicarEdicaoTipografica } from "./edit"
import { extractTypographyInventory } from "./inventory"
import { LINK_ATTR } from "./webfont"

const HTML = `<!DOCTYPE html><html><head><style>
  body { font-family: Montserrat, Arial, sans-serif; }
</style></head><body>
<table><tr><td>
  <div style="font-family:Montserrat,Arial;font-size:56px;font-weight:900;">TÍTULO</div>
  <a href="https://loja.com" style="font-family:Montserrat,Arial;font-size:15px;font-weight:700;">SHOP NOW</a>
  <p style="font-family:Montserrat,Arial;font-size:14px;font-weight:400;">corpo do email</p>
</td></tr></table>
</body></html>`

describe("aplicarEdicaoTipografica", () => {
  it("troca a família da peça no head e no corpo", () => {
    const r = aplicarEdicaoTipografica({
      html: HTML,
      familias: [{ de: "Montserrat", para: "Sora" }],
    })
    expect(r.invarianteViolado).toBeNull()
    expect(r.familiasTrocadas).toBe(4) // 1 no head + 3 no corpo
    expect(r.html).not.toContain("font-family:Montserrat")
  })

  it("aplica op por item e devolve o aviso sem descartar", () => {
    const r = aplicarEdicaoTipografica({
      html: HTML,
      ops: [{ item: 2, familia: "Lora", motivo: "quero serifada no CTA" }],
    })
    expect(r.aplicadas).toBe(1)
    expect(r.avisos.some((a) => a.motivo.includes("16px"))).toBe(true)
    expect(r.descartadas).toHaveLength(0)
  })

  it("recusa a op cujo índice já não aponta para o mesmo elemento", () => {
    const r = aplicarEdicaoTipografica({
      html: HTML,
      ops: [
        { item: 0, peso: 700, motivo: "x", esperado: { family: "Montserrat", sizePx: 56 } },
        { item: 1, peso: 600, motivo: "y", esperado: { family: "Montserrat", sizePx: 30 } },
      ],
    })
    expect(r.aplicadas).toBe(1)
    expect(r.desatualizados).toHaveLength(1)
    expect(r.desatualizados[0]).toMatchObject({ item: 1, atual: { sizePx: 15 } })
  })

  it("`esperado` parcial compara só o que foi mandado", () => {
    const r = aplicarEdicaoTipografica({
      html: HTML,
      ops: [{ item: 0, peso: 700, motivo: "x", esperado: { tag: "div" } }],
    })
    expect(r.desatualizados).toHaveLength(0)
    expect(r.aplicadas).toBe(1)
  })

  it("declara a webfont da família nova e não redeclara a da montagem", () => {
    const r = aplicarEdicaoTipografica({
      html: HTML,
      ops: [{ item: 0, familia: "Sora", motivo: "x" }],
      webfontsDaMontagem: ["Montserrat"],
    })
    expect(r.html).toContain(`${LINK_ATTR} href="https://fonts.googleapis.com/css2?family=Sora`)
    expect(r.html.match(new RegExp(LINK_ATTR, "g"))).toHaveLength(1)
  })

  it("o aviso do par olha para a fonte da PEÇA, não para a da marca", () => {
    const semTroca = aplicarEdicaoTipografica({
      html: HTML,
      ops: [{ item: 0, familia: "Sora", motivo: "x" }],
      fonteDeTitulo: "Montserrat",
    })
    expect(semTroca.avisos.some((a) => a.motivo.includes("substituto"))).toBe(true)

    const comSerifada = aplicarEdicaoTipografica({
      html: HTML,
      ops: [{ item: 0, familia: "Sora", motivo: "x" }],
      fonteDeTitulo: "Playfair Display",
    })
    expect(comSerifada.avisos.some((a) => a.motivo.includes("substituto"))).toBe(false)
  })

  it("não muda o texto, os links nem a contagem de declarações", () => {
    const r = aplicarEdicaoTipografica({
      html: HTML,
      familias: [{ de: "Montserrat", para: "Sora" }],
      ops: [{ item: 0, peso: 700, tamanho_px: 48, caixa: "alta", motivo: "x" }],
    })
    // Mesma normalização do guard do refinador: o conteúdo de <style> não é
    // texto do email (e é justamente lá que a troca de família mexe).
    const texto = (h: string) =>
      h
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    expect(texto(r.html)).toBe(texto(HTML))
    expect(r.html).toContain('href="https://loja.com"')
    expect(extractTypographyInventory(r.html)).toHaveLength(
      extractTypographyInventory(HTML).length,
    )
  })

  it("sem nada a fazer, devolve o documento como estava", () => {
    const r = aplicarEdicaoTipografica({ html: HTML })
    expect(r.html).toBe(HTML)
    expect(r.aplicadas).toBe(0)
    expect(r.invarianteViolado).toBeNull()
  })
})
