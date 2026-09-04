import { describe, expect, it } from "vitest"
import { applyPromptCache, parseCacheUsage, supportsPromptCache } from "./prompt-cache"
import type { ChatMessage } from "@/lib/ai/openrouter-chat"

describe("supportsPromptCache", () => {
  it("só anthropic/*", () => {
    expect(supportsPromptCache("anthropic/claude-opus-4.8")).toBe(true)
    expect(supportsPromptCache("openai/gpt-5.4")).toBe(false)
    expect(supportsPromptCache("moonshotai/kimi-k3")).toBe(false)
  })
})

describe("applyPromptCache", () => {
  const base: ChatMessage[] = [
    { role: "system", content: "regras" },
    { role: "user", content: "oi" },
    { role: "assistant", content: "olá" },
    { role: "user", content: "e agora?" },
  ]

  it("devolve o array intacto em modelo sem suporte", () => {
    const out = applyPromptCache("openai/gpt-5.4", base)
    expect(out).toBe(base)
  })

  it("marca o system e o último turno do usuário, sem mutar o original", () => {
    const out = applyPromptCache("anthropic/claude-opus-4.8", base)
    expect(base[0].content).toBe("regras")
    expect(base[3].content).toBe("e agora?")
    expect(out[0]).toEqual({
      role: "system",
      content: [{ type: "text", text: "regras", cache_control: { type: "ephemeral" } }],
    })
    // o primeiro turno do usuário NÃO é marcado
    expect(out[1]).toEqual({ role: "user", content: "oi" })
    expect(out[3]).toEqual({
      role: "user",
      content: [{ type: "text", text: "e agora?", cache_control: { type: "ephemeral" } }],
    })
  })

  it("system em dois blocos: só o ÚLTIMO recebe o marcador", () => {
    const msgs: ChatMessage[] = [
      {
        role: "system",
        content: [
          { type: "text", text: "estável" },
          { type: "text", text: "dinâmico" },
        ],
      },
      { role: "user", content: "x" },
    ]
    const out = applyPromptCache("anthropic/claude-sonnet-5", msgs)
    const sys = out[0] as Extract<ChatMessage, { role: "system" }>
    expect(Array.isArray(sys.content)).toBe(true)
    const parts = sys.content as Array<{ text: string; cache_control?: unknown }>
    expect(parts[0].cache_control).toBeUndefined()
    expect(parts[1].cache_control).toEqual({ type: "ephemeral" })
  })

  it("descarta bloco vazio do system", () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: [{ type: "text", text: "a" }, { type: "text", text: "  " }] },
      { role: "user", content: "x" },
    ]
    const out = applyPromptCache("anthropic/claude-sonnet-5", msgs)
    const parts = (out[0] as { content: Array<{ text: string; cache_control?: unknown }> }).content
    expect(parts).toHaveLength(1)
    expect(parts[0].cache_control).toEqual({ type: "ephemeral" })
  })

  it("turno multimodal: marca a última parte de texto e preserva a imagem", () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: "s" },
      {
        role: "user",
        content: [
          { type: "text", text: "veja" },
          { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
        ],
      },
    ]
    const out = applyPromptCache("anthropic/claude-opus-5", msgs)
    const parts = (out[1] as { content: Array<Record<string, unknown>> }).content
    expect(parts[0]).toEqual({ type: "text", text: "veja", cache_control: { type: "ephemeral" } })
    expect(parts[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AAA" } })
  })

  it("o marcador do usuário fica no turno ATUAL mesmo com tool results depois", () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: "s" },
      { role: "user", content: "faz" },
      { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "{}" } }] },
      { role: "tool", content: "resultado", tool_call_id: "c1" },
    ]
    const out = applyPromptCache("anthropic/claude-opus-5", msgs)
    expect(out[1]).toEqual({
      role: "user",
      content: [{ type: "text", text: "faz", cache_control: { type: "ephemeral" } }],
    })
    expect(out[3]).toEqual(msgs[3])
  })
})

describe("parseCacheUsage", () => {
  it("lê o formato normalizado do OpenRouter", () => {
    const u = parseCacheUsage({
      prompt_tokens: 12000,
      completion_tokens: 300,
      cost: 0.012,
      prompt_tokens_details: { cached_tokens: 9000, cache_write_tokens: 500 },
    })
    expect(u).toEqual({
      promptTokens: 12000,
      completionTokens: 300,
      cost: 0.012,
      cachedTokens: 9000,
      cacheWriteTokens: 500,
    })
  })

  it("lê o formato Anthropic cru", () => {
    const u = parseCacheUsage({
      prompt_tokens: 100,
      cache_read_input_tokens: 80,
      cache_creation_input_tokens: 20,
    })
    expect(u.cachedTokens).toBe(80)
    expect(u.cacheWriteTokens).toBe(20)
  })

  it("nunca lança com usage ausente ou lixo", () => {
    expect(parseCacheUsage(null)).toEqual({
      promptTokens: null,
      completionTokens: null,
      cost: null,
      cachedTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(parseCacheUsage({ prompt_tokens: "x", prompt_tokens_details: "nope" }).cachedTokens).toBe(0)
  })
})
