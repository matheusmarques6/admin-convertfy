import { describe, expect, it } from "vitest"

import {
  baseDaLoja,
  extrairFrete,
  extrairTroca,
  montarInsumos,
  normalizarPoliticas,
  politicasParaPrompt,
  urlsDePolitica,
} from "./politicas"

describe("urlsDePolitica / baseDaLoja", () => {
  it("monta as URLs do padrão Shopify a partir da URL da loja, com ou sem protocolo", () => {
    expect(baseDaLoja("heroboxers.com/")).toBe("https://heroboxers.com")
    expect(baseDaLoja("https://www.luxeliftshop.com/collections/all")).toBe("https://www.luxeliftshop.com")
    expect(urlsDePolitica("heroboxers.com")?.troca[0]).toBe("https://heroboxers.com/policies/refund-policy")
    expect(urlsDePolitica("heroboxers.com")?.frete[0]).toBe("https://heroboxers.com/policies/shipping-policy")
  })
  it("URL inválida devolve null", () => {
    expect(baseDaLoja("")).toBeNull()
    expect(baseDaLoja("localhost")).toBeNull()
    expect(urlsDePolitica("not a url")).toBeNull()
  })
})

describe("extrairTroca — pt/en/pl com âncora", () => {
  const URL = "https://x.com/policies/refund-policy"
  it("pt: dias perto de 'troca'", () => {
    const r = extrairTroca("Você pode solicitar a troca ou devolução em até 30 dias após o recebimento.", URL)
    expect(r).toMatchObject({ dias: 30, url: URL })
    expect(r?.texto).toContain("30 dias")
  })
  it("en: days perto de 'return'", () => {
    expect(extrairTroca("We have a 14-day return policy, which means you have 14 days after receiving your item.", URL)?.dias).toBe(14)
  })
  it("pl: dni perto de 'zwrot'", () => {
    expect(extrairTroca("Masz 30 dni na zwrot towaru bez podania przyczyny.", URL)?.dias).toBe(30)
  })
  // "30 dias" numa página que não fala de troca é prazo de entrega.
  it("dias sem âncora de troca não vira prazo de troca", () => {
    expect(extrairTroca("Entregamos em até 30 dias em todo o país.", URL)).toBeNull()
  })
  it("âncora sem número devolve texto sem dias", () => {
    const r = extrairTroca("Our return policy is simple: contact support to start an exchange.", URL)
    expect(r?.dias).toBeNull()
    expect(r?.texto).toContain("return policy")
  })
})

describe("extrairFrete", () => {
  const URL = "https://x.com/policies/shipping-policy"
  it("frete grátis com condição e prazo", () => {
    const r = extrairFrete("Frete grátis em compras acima de R$ 199. Prazo de entrega: 5 a 10 dias úteis.", URL)
    expect(r).toMatchObject({ gratis: true, gratis_condicao: "R$ 199", prazo: "5 a 10 dias úteis", url: URL })
  })
  it("en: free shipping over $50, 3-5 business days", () => {
    const r = extrairFrete("Free shipping on orders over $50. Orders ship within 3-5 business days.", URL)
    expect(r?.gratis).toBe(true)
    expect(r?.gratis_condicao).toBe("$50")
    expect(r?.prazo).toBe("3-5 business days")
  })
  it("sem sinal de frete devolve null", () => {
    expect(extrairFrete("Sobre nós: uma marca de cuecas.", URL)).toBeNull()
  })
})

describe("montarInsumos / politicasParaPrompt / normalizarPoliticas", () => {
  const p = normalizarPoliticas({
    troca: { dias: 30, texto: "30 dias", url: "https://x.com/policies/refund-policy" },
    frete: { gratis: true, gratis_condicao: "R$ 199", prazo: "5 a 10 dias úteis", texto: "", url: "https://x.com/policies/shipping-policy" },
    capturado_em: "2026-09-14T10:00:00Z",
    fonte: "pagina_publica",
    erros: [],
  })!
  it("insumos vêm com a URL entre parênteses — a régua do Seletor", () => {
    const ins = montarInsumos(p)
    expect(ins).toHaveLength(2)
    for (const i of ins) expect(i).toMatch(/\(https:\/\/x\.com\/policies\/.+\)$/)
    expect(ins[0]).toContain("30 dias")
    expect(ins[1]).toContain("frete grátis acima de R$ 199")
  })
  it("o bloco do prompt declara que é lido da página, não verificado", () => {
    expect(politicasParaPrompt(p)).toContain("NÃO verificado pelo time")
    expect(politicasParaPrompt(null)).toContain("nenhuma página")
  })
  it("normalizar: entrada sem url é descartada; lixo vira null", () => {
    expect(normalizarPoliticas({ troca: { dias: 30 } })).toBeNull()
    expect(normalizarPoliticas("x")).toBeNull()
    expect(normalizarPoliticas({ erros: [{ url: "https://x.com/policies/refund-policy", status: 404, motivo: "HTTP 404" }] })?.erros[0].status).toBe(404)
  })
})

// S2 (19/09): o pré-passo do Seletor lê as páginas quando falta troca OU
// frete, no máximo uma vez por dia — pelo carimbo do JSONB CRU.
describe("precisaCapturarPoliticas / coberturaDasPoliticas", async () => {
  const { precisaCapturarPoliticas, coberturaDasPoliticas } = await import("./politicas")
  const agora = new Date("2026-09-19T12:00:00Z")
  it("sem nada gravado: captura", () => {
    expect(precisaCapturarPoliticas(null, agora)).toBe(true)
  })
  it("troca E frete cobertos: não captura", () => {
    const p = { troca: { dias: 30, url: "https://x/policies/refund-policy" }, frete: { gratis: true, url: "https://x/policies/shipping-policy" }, capturado_em: "2026-01-01T00:00:00Z", fonte: "pagina_publica", erros: [] }
    expect(precisaCapturarPoliticas(p, agora)).toBe(false)
    expect(coberturaDasPoliticas(p as never)).toEqual(["troca", "frete"])
  })
  it("captura de HOJE que nada achou (normaliza para null) NÃO é relida", () => {
    const p = { troca: null, frete: null, capturado_em: "2026-09-19T08:00:00Z", fonte: "pagina_publica", erros: [] }
    expect(precisaCapturarPoliticas(p, agora)).toBe(false)
  })
  it("captura de ontem só com troca: relê", () => {
    const p = { troca: { dias: 30, url: "https://x/policies/refund-policy" }, frete: null, capturado_em: "2026-09-18T08:00:00Z", fonte: "pagina_publica", erros: [] }
    expect(precisaCapturarPoliticas(p, agora)).toBe(true)
  })
  it("carimbo ilegível conta como nunca capturado", () => {
    expect(precisaCapturarPoliticas({ troca: null, frete: null, capturado_em: "ontem", erros: [] }, agora)).toBe(true)
  })
})
