/**
 * Views por bloco do QA (F5 — arquitetura por views): extração pelos
 * marcadores cfy:block + fallback por content quando os marcadores já
 * foram strippados (resume).
 */
import { describe, it, expect } from "vitest"
import { buildQaBlockViews, viewsFromBlocksFallback } from "./qa-views"

const DOC = [
  "<!DOCTYPE html><html><body>",
  "<!-- cfy:block:0:header:start -->",
  '<table><tr><td><img src="https://cdn/logo.png"></td></tr></table>',
  "<!-- cfy:block:0:header:end -->",
  "<!-- cfy:block:1:hero:start -->",
  '<table><tr><td><h1>Você esqueceu algo</h1><a href="https://loja.com/cart">Finalizar compra</a><img src="https://cdn/hero.png"></td></tr></table>',
  "<!-- cfy:block:1:hero:end -->",
  "<!-- cfy:block:2:beneficios:start -->",
  '<table><tr><td><h2>Por que amar</h2><a href="#">saiba mais</a><img src=""></td></tr></table>',
  "<!-- cfy:block:2:beneficios:end -->",
  "</body></html>",
].join("\n")

const BLOCKS = [
  { id: "b-hero", position: 1, block_type: "hero" },
  { id: "b-benef", position: 2, block_type: "beneficios" },
]

describe("buildQaBlockViews", () => {
  it("extrai texto visível, hrefs e imagens por região, amarrando block_id por tipo", () => {
    const views = buildQaBlockViews(DOC, BLOCKS)
    expect(views).toHaveLength(3)

    // header: estrutural, sem bloco correspondente → block_id null
    expect(views[0]).toMatchObject({ indice: 0, tipo: "header", block_id: null, imagens: 1 })

    const hero = views[1]
    expect(hero.block_id).toBe("b-hero")
    expect(hero.texto_visivel).toContain("Você esqueceu algo")
    expect(hero.texto_visivel).toContain("Finalizar compra")
    expect(hero.cta_hrefs).toEqual(["https://loja.com/cart"])
    expect(hero.imagens).toBe(1)

    const benef = views[2]
    expect(benef.block_id).toBe("b-benef")
    expect(benef.cta_hrefs).toEqual(["#"])
    // <img src=""> não conta como imagem colocada
    expect(benef.imagens).toBe(0)
  })

  it("HTML sem marcadores (pós-strip) → [] (caller usa o fallback)", () => {
    expect(buildQaBlockViews("<html><body><table></table></body></html>", BLOCKS)).toEqual([])
  })
})

describe("viewsFromBlocksFallback", () => {
  it("deriva views do content quando os marcadores já foram removidos", () => {
    const views = viewsFromBlocksFallback([
      {
        id: "b2",
        position: 2,
        block_type: "beneficios",
        content: { titulo: "Por que amar", vazio: "" },
      },
      { id: "b1", position: 1, block_type: "hero", content: { headline: "Oi" } },
    ])
    // ordenado por position
    expect(views[0].block_id).toBe("b1")
    expect(views[0].texto_visivel).toBe("Oi")
    expect(views[1].texto_visivel).toBe("Por que amar")
    expect(views[1].cta_hrefs).toEqual([])
  })
})
