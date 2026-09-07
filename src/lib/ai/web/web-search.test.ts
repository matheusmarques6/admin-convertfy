import { describe, expect, it } from "vitest"
import { escolherProvedor, normalizarResultados } from "./web-search"

describe("escolherProvedor", () => {
  it("respeita a ordem de preferência", () => {
    expect(escolherProvedor({ TAVILY_API_KEY: "a", BRAVE_SEARCH_API_KEY: "b", SERPER_API_KEY: "c" } as unknown as NodeJS.ProcessEnv)).toBe("tavily")
    expect(escolherProvedor({ BRAVE_SEARCH_API_KEY: "b", SERPER_API_KEY: "c" } as unknown as NodeJS.ProcessEnv)).toBe("brave")
    expect(escolherProvedor({ SERPER_API_KEY: "c" } as unknown as NodeJS.ProcessEnv)).toBe("serper")
  })

  it("chave em branco não conta como configurada", () => {
    // Variável criada e deixada vazia é o erro de deploy mais comum, e
    // escolher esse provedor faria toda busca falhar com 401 em vez de
    // dizer "não configurado".
    expect(escolherProvedor({ TAVILY_API_KEY: "   " } as unknown as NodeJS.ProcessEnv)).toBeNull()
    expect(escolherProvedor({} as unknown as NodeJS.ProcessEnv)).toBeNull()
  })
})

describe("normalizarResultados", () => {
  it("Tavily: results[] com content", () => {
    const r = normalizarResultados(
      "tavily",
      { results: [{ title: "Welcome flow", url: "https://a.com/x", content: "  texto  extraído ", published_date: "2026-01-02" }] },
      5,
    )
    expect(r).toEqual([
      { titulo: "Welcome flow", url: "https://a.com/x", trecho: "texto extraído", publicadoEm: "2026-01-02" },
    ])
  })

  it("Brave: web.results[] com description", () => {
    const r = normalizarResultados("brave", { web: { results: [{ title: "T", url: "https://b.com", description: "desc" }] } }, 5)
    expect(r[0]).toMatchObject({ titulo: "T", url: "https://b.com", trecho: "desc" })
  })

  it("Serper: organic[] com link e snippet", () => {
    // O campo da URL muda de nome (`link`, não `url`): ler só `url`
    // devolveria zero resultado com a resposta cheia.
    const r = normalizarResultados("serper", { organic: [{ title: "T", link: "https://c.com", snippet: "snip" }] }, 5)
    expect(r[0]).toMatchObject({ titulo: "T", url: "https://c.com", trecho: "snip" })
  })

  it("descarta item sem URL e respeita o limite", () => {
    const muitos = Array.from({ length: 20 }, (_, i) => ({ title: `t${i}`, url: `https://x.com/${i}` }))
    const r = normalizarResultados("tavily", { results: [{ title: "sem url" }, ...muitos] }, 3)
    expect(r).toHaveLength(3)
    expect(r.every((x) => x.url.startsWith("https://"))).toBe(true)
  })

  it("resposta em formato inesperado vira lista vazia, não exceção", () => {
    expect(normalizarResultados("tavily", null, 5)).toEqual([])
    expect(normalizarResultados("brave", { web: "nada" }, 5)).toEqual([])
    expect(normalizarResultados("serper", { organic: {} }, 5)).toEqual([])
  })

  it("sem título usa a URL — o modelo precisa de um rótulo para citar", () => {
    const r = normalizarResultados("tavily", { results: [{ url: "https://d.com/p" }] }, 5)
    expect(r[0].titulo).toBe("https://d.com/p")
  })
})
