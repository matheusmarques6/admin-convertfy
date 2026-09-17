import { describe, expect, it } from "vitest"

import {
  CACHE_PREFIX_MARKER as M,
  TETO_DE_MARCAS_NO_USER,
  aceitaPrefill,
  blocosDeCache,
  modeloComCacheDePrompt,
  semMarcadores,
  systemContentComCache,
  userContentComCache,
} from "./cache-de-prompt"

const cache = { type: "ephemeral" as const }

describe("blocosDeCache", () => {
  it("sem marcador: o texto inteiro é UM bloco cacheável", () => {
    expect(blocosDeCache("base").blocos).toEqual([{ type: "text", text: "base", cache_control: cache }])
  })

  it("N marcadores = N+1 blocos, cache_control em todos menos o último — vault, loja, e-mail, cauda", () => {
    const r = blocosDeCache(`vault${M}loja${M}email${M}cauda`)
    expect(r.blocos).toEqual([
      { type: "text", text: "vault", cache_control: cache },
      { type: "text", text: "loja", cache_control: cache },
      { type: "text", text: "email", cache_control: cache },
      { type: "text", text: "cauda" },
    ])
    expect(r.marcasExcedentes).toBe(0)
  })

  it("segmento vazio ou só espaço é fundido no vizinho — bloco vazio dá 400 na API", () => {
    expect(blocosDeCache(`${M}a${M}${M}b${M}`).blocos).toEqual([
      { type: "text", text: "a", cache_control: cache },
      { type: "text", text: "b" },
    ])
    // Quebra de linha entre marcadores vira parte do bloco anterior.
    expect(blocosDeCache(`a${M}\n\n${M}b`).blocos).toEqual([
      { type: "text", text: "a\n\n", cache_control: cache },
      { type: "text", text: "b" },
    ])
    // Cauda vazia: o último bloco real deixa de ser cacheável (é o último).
    expect(blocosDeCache(`a${M}b${M}   `).blocos).toEqual([
      { type: "text", text: "a", cache_control: cache },
      { type: "text", text: "b   " },
    ])
  })

  it("acima do teto as PRIMEIRAS marcas se fundem — a mais tardia cobre o prefixo inteiro", () => {
    expect(TETO_DE_MARCAS_NO_USER).toBe(3)
    const r = blocosDeCache(`a${M}b${M}c${M}d${M}e`)
    expect(r.marcasExcedentes).toBe(1)
    expect(r.blocos.map((b) => b.text)).toEqual(["ab", "c", "d", "e"])
    expect(r.blocos.slice(0, 3).every((b) => b.cache_control)).toBe(true)
    expect(r.blocos[3].cache_control).toBeUndefined()
  })

  it("o marcador nunca sobra no texto de nenhum bloco", () => {
    const r = blocosDeCache(`a${M}b${M}c`)
    expect(r.blocos.some((b) => b.text.includes(M))).toBe(false)
  })

  it("texto vazio devolve lista vazia", () => {
    expect(blocosDeCache("").blocos).toEqual([])
  })
})

describe("userContentComCache / systemContentComCache", () => {
  it("inativo: string sem marcador", () => {
    expect(userContentComCache(`a${M}b`, { ativo: false })).toBe("ab")
    expect(systemContentComCache("sys", { ativo: false })).toBe("sys")
  })
  it("ativo: blocos", () => {
    expect(userContentComCache(`a${M}b`, { ativo: true })).toEqual([
      { type: "text", text: "a", cache_control: cache },
      { type: "text", text: "b" },
    ])
    expect(systemContentComCache("sys", { ativo: true })).toEqual([
      { type: "text", text: "sys", cache_control: cache },
    ])
  })
})

describe("semMarcadores / modeloComCacheDePrompt", () => {
  it("remove todas as ocorrências", () => {
    expect(semMarcadores(`${M}a${M}b${M}`)).toBe("ab")
    expect(semMarcadores("ab")).toBe("ab")
  })
  it("slug Anthropic com ou sem til; outros provedores não", () => {
    expect(modeloComCacheDePrompt("~anthropic/claude-fable-latest")).toBe(true)
    expect(modeloComCacheDePrompt("anthropic/claude-sonnet-4.6")).toBe(true)
    expect(modeloComCacheDePrompt("moonshotai/kimi-k3")).toBe(false)
  })
})

describe("aceitaPrefill — a família 4.6+ responde 400 a mensagem assistant final", () => {
  it("recusa Sonnet/Opus 4.6+, Sonnet/Opus 5, Fable e Mythos (com ou sem til)", () => {
    for (const m of [
      "anthropic/claude-sonnet-4.6",
      "anthropic/claude-opus-4.8",
      "anthropic/claude-sonnet-5",
      "anthropic/claude-opus-5",
      "~anthropic/claude-fable-latest",
      "anthropic/claude-fable-5.1",
      "claude-sonnet-4-6",
      "claude-mythos-5-1",
    ]) {
      expect(aceitaPrefill(m), m).toBe(false)
    }
  })
  it("aceita os modelos anteriores da Anthropic; outro provedor nunca", () => {
    expect(aceitaPrefill("anthropic/claude-haiku-4.5")).toBe(true)
    expect(aceitaPrefill("anthropic/claude-sonnet-4.5")).toBe(true)
    expect(aceitaPrefill("claude-haiku-4-5-20251001")).toBe(true)
    expect(aceitaPrefill("moonshotai/kimi-k3")).toBe(false)
    expect(aceitaPrefill("openai/gpt-5.4")).toBe(false)
  })
})
