import { describe, it, expect } from "vitest"
import { extractTypographyInventory, renderInventoryForPrompt } from "./inventory"
import { aplicarGuards } from "./rules"
import { applyTypographyOps, injectSecondaryFontLink } from "./apply"
import type { TypographyDecision } from "./rules"
import { classifyFontFamily } from "../html/format-context"

/**
 * A cadeia inteira sem LLM, sobre o caso que motivou o agente: o Welcome 1 da
 * Innova saiu com uma família só, repetida em toda declaração, e o peso da
 * marca (900) espalhado — inclusive sobre fundo escuro.
 */
const INNOVA = `<!DOCTYPE html><html><head></head><body>
<!-- cfy:block:0:hero:start -->
<td style="background:#1F1F1F;">
  <div style="font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:50px;font-weight:900;color:#FFFFFF;">Welcome to Innova Bay</div>
  <td style="background:#F2F2F2;">
    <span style="font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;">BEMVINDO10</span>
  </td>
  <a href="#" style="font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:15px;font-weight:900;">SHOP NOW</a>
</td>
<!-- cfy:block:0:hero:end -->
<!-- cfy:block:2:body:start -->
<td style="background:#FFFFFF;">
  <div style="font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:56px;font-weight:900;">INNOVA BAY VS OTHERS</div>
  <p style="font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:14px;font-weight:400;">Unsubscribe</p>
</td>
<!-- cfy:block:2:body:end -->
</body></html>`

describe("cadeia do tipógrafo (Innova Welcome 1)", () => {
  const inventario = extractTypographyInventory(INNOVA)

  it("o inventário substitui o documento no prompt", () => {
    expect(inventario).toHaveLength(5)
    const txt = renderInventoryForPrompt(inventario)
    expect(txt).not.toContain("<td")
    expect(txt).not.toContain("<!DOCTYPE")
    // Bem menor que o documento: é o ponto de mandar inventário, não HTML.
    expect(txt.length).toBeLessThan(INNOVA.length)
  })

  it("a fonte principal da Innova é classificada como sans", () => {
    expect(classifyFontFamily("Montserrat")).toBe("sans")
    expect(classifyFontFamily("Playfair Display")).toBe("serif")
  })

  it("o par sans+sans é recusado inteiro, e a peça rompe por peso e caixa", () => {
    const decisao: TypographyDecision = {
      segunda_fonte: { familia: "Sora", onde: "destaque", classe: "sans", fallback: "Arial, Helvetica, sans-serif" },
      justificativa: "grotesca com personalidade",
      ops: [
        { item: 3, fonte: "secundaria", peso: 900, motivo: "maior título" },
        { item: 0, peso: 600, motivo: "headline desce um degrau" },
        { item: 2, caixa: "alta", tracking: "0.06em", motivo: "CTA" },
        { item: 1, caixa: "alta", tracking: "0.08em", motivo: "cupom" },
      ],
    }
    const g = aplicarGuards(decisao, inventario, { classePrincipal: "sans", pesoMarca: 900 })
    expect(g.segundaFonte).toBeNull()
    expect(g.segundaFonteRecusada).toContain("substituto")

    const r = applyTypographyOps(INNOVA, g.ops, g.segundaFonte)
    const depois = extractTypographyInventory(r.html)
    // Uma família só, como antes — a ruptura veio de peso e caixa.
    expect(new Set(depois.map((o) => o.family.split(",")[0]))).toEqual(new Set(["Montserrat"]))
    expect(depois[3].weight).toBe(900) // maior título mantém o peso da marca
    // Pedido 600; 700 já existe na peça (cupom) e fica a menos de 200 do
    // pedido — o guard colapsa no degrau existente, na direção pedida.
    expect(depois[0].weight).toBe(700)
    expect(depois[2]).toMatchObject({ uppercase: true, tracking: "0.06em" })
    expect(depois[1]).toMatchObject({ uppercase: true, tracking: "0.08em" })
  })

  it("com um par que sobrevive, a família entra só onde é permitido", () => {
    const decisao: TypographyDecision = {
      segunda_fonte: {
        familia: "Playfair Display",
        onde: "destaque",
        classe: "serif",
        fallback: "Georgia, 'Times New Roman', serif",
      },
      justificativa: "editorial",
      ops: [
        { item: 3, fonte: "secundaria", motivo: "maior título" },
        { item: 2, fonte: "secundaria", motivo: "CTA" },
        { item: 4, fonte: "secundaria", motivo: "rodapé" },
      ],
    }
    const g = aplicarGuards(decisao, inventario, { classePrincipal: "sans", pesoMarca: 900 })
    // CTA (15px e <a>) e rodapé (14px) ficam fora; sobra o maior título.
    expect(g.ops.filter((o) => o.fonte === "secundaria").map((o) => o.item)).toEqual([3])
    expect(g.descartadas.map((d) => d.motivo).join(" ")).toMatch(/rótulo de link|piso de 16px/)

    const r = applyTypographyOps(INNOVA, g.ops, g.segundaFonte)
    const comLink = injectSecondaryFontLink(r.html, g.segundaFonte, [900])
    const depois = extractTypographyInventory(comLink)
    expect(depois[3].family.startsWith("'Playfair Display'")).toBe(true)
    expect(depois[2].family.startsWith("Montserrat")).toBe(true)
    expect(comLink).toContain("fonts.googleapis.com/css2?family=Playfair+Display")
    // Estrutura e texto intactos.
    expect((comLink.match(/<td/g) ?? []).length).toBe((INNOVA.match(/<td/g) ?? []).length)
    expect(comLink).toContain("INNOVA BAY VS OTHERS")
    expect(comLink).toContain("Unsubscribe")
  })

  it("o peso sobre fundo escuro desce, e a escala da peça diz até onde", () => {
    const decisao: TypographyDecision = {
      segunda_fonte: null,
      justificativa: "",
      // Item 0 é a headline sobre #1F1F1F em 50px.
      ops: [{ item: 0, peso: 900, motivo: "título da hero" }],
    }
    const g = aplicarGuards(decisao, inventario, { classePrincipal: "sans", pesoMarca: null })
    // 900 no escuro pede um degrau abaixo (800); mas a peça já usa 700 e 900,
    // e 800 entre os dois é degrau desperdiçado — o colapso leva ao 700 que
    // existe, na direção pedida. Os dois motivos ficam na telemetria.
    expect(g.ops[0].peso).toBe(700)
    const motivos = g.descartadas.map((d) => d.motivo).join(" | ")
    expect(motivos).toContain("fundo escuro")
    expect(motivos).toContain("degrau desperdiçado")
  })
})
