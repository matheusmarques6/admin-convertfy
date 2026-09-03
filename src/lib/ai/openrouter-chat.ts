/**
 * Chat multi-turn STREAMING com tools via OpenRouter — o motor da
 * ConvertIA. Complementa o openrouter-invoke.ts dos agentes de email
 * (que é single-turn, sem tools e non-streaming) sem tocá-lo: aqui o
 * contrato é o de um chat com function-calling OpenAI-compatible.
 *
 * O streaming acumula `delta.tool_calls[i].function.arguments` em
 * fragmentos (é assim que o OpenRouter entrega) e devolve as chamadas
 * completas quando finish_reason === "tool_calls". Texto flui pelo
 * onDelta conforme chega.
 *
 * Erros reusam as classes nomeadas do openrouter-invoke
 * (OpenRouterHttpError etc.) pra manter o mesmo vocabulário de retry.
 */

import {
  OpenRouterEmptyBodyError,
  OpenRouterHttpError,
  OpenRouterMidStreamError,
} from "@/lib/agents/openrouter-invoke"
import { logger } from "@/lib/logger"

const log = logger.child("OpenRouterChat")

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

// ── Tipos do contrato OpenAI-compatible ────────────────────────────

export interface ChatToolDef {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ChatToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

/** Parte multimodal do turno do usuário (imagens via data URL). */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ChatContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string }

export interface ChatStreamResult {
  text: string
  toolCalls: ChatToolCall[]
  finishReason: string | null
  tokensInput: number
  tokensOutput: number
  costUsd: number
}

interface StreamChatInput {
  model: string
  messages: ChatMessage[]
  tools?: ChatToolDef[]
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  signal?: AbortSignal
  /** Texto incremental da resposta (não dispara para tool_calls). */
  onDelta?: (text: string) => void
}

/**
 * Uma chamada streaming ao OpenRouter. O chamador decide o loop de
 * tools (executa e re-chama com os tool results anexados).
 */
export async function streamOpenRouterChat(input: StreamChatInput): Promise<ChatStreamResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada")

  const controller = new AbortController()
  const timeoutMs = input.timeoutMs ?? 120_000
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  input.signal?.addEventListener("abort", onAbort)

  const started = Date.now()
  try {
    const resp = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://admin.convertfy.com.br",
        // ByteString: só ASCII neste header
        "X-Title": "Convertfy ConvertIA",
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        ...(input.tools && input.tools.length > 0 ? { tools: input.tools } : {}),
        max_tokens: input.maxTokens ?? 4096,
        temperature: input.temperature ?? 0.4,
        stream: true,
        // Uso (tokens/custo) no frame final do stream
        usage: { include: true },
      }),
      signal: controller.signal,
    })

    if (!resp.ok) {
      const snippet = (await resp.text().catch(() => "")).slice(0, 300)
      throw new OpenRouterHttpError({ status: resp.status, snippet })
    }
    if (!resp.body) {
      throw new OpenRouterEmptyBodyError({ status: resp.status, ms: Date.now() - started })
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let text = ""
    let finishReason: string | null = null
    let tokensInput = 0
    let tokensOutput = 0
    let costUsd = 0
    // tool_calls chegam fragmentados por índice
    const toolAcc = new Map<number, { id: string; name: string; args: string }>()

    const handleFrame = (payload: string) => {
      let json: {
        choices?: Array<{
          delta?: {
            content?: string | null
            tool_calls?: Array<{
              index: number
              id?: string
              function?: { name?: string; arguments?: string }
            }>
          }
          finish_reason?: string | null
          error?: { message?: string; metadata?: { error_type?: string } }
        }>
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
        error?: { message?: string; metadata?: { error_type?: string } }
      }
      try {
        json = JSON.parse(payload)
      } catch {
        return // frame parcial/keep-alive — ignora
      }
      if (json.error) {
        throw new OpenRouterMidStreamError({
          errorType: json.error.metadata?.error_type ?? "midstream_error",
          status: 200,
          ms: Date.now() - started,
          snippet: (json.error.message ?? "").slice(0, 200),
        })
      }
      const choice = json.choices?.[0]
      if (choice?.error) {
        throw new OpenRouterMidStreamError({
          errorType: choice.error.metadata?.error_type ?? "midstream_error",
          status: 200,
          ms: Date.now() - started,
          snippet: (choice.error.message ?? "").slice(0, 200),
        })
      }
      if (choice?.delta?.content) {
        text += choice.delta.content
        input.onDelta?.(choice.delta.content)
      }
      for (const tc of choice?.delta?.tool_calls ?? []) {
        const acc = toolAcc.get(tc.index) ?? { id: "", name: "", args: "" }
        if (tc.id) acc.id = tc.id
        if (tc.function?.name) acc.name += tc.function.name
        if (tc.function?.arguments) acc.args += tc.function.arguments
        toolAcc.set(tc.index, acc)
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason
      if (json.usage) {
        tokensInput = json.usage.prompt_tokens ?? tokensInput
        tokensOutput = json.usage.completion_tokens ?? tokensOutput
        costUsd = json.usage.cost ?? costUsd
      }
    }

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === "[DONE]") continue
        handleFrame(payload)
      }
    }
    // frame final que pode ter ficado no buffer
    const tail = buffer.trim()
    if (tail.startsWith("data:")) {
      const payload = tail.slice(5).trim()
      if (payload && payload !== "[DONE]") handleFrame(payload)
    }

    const toolCalls: ChatToolCall[] = [...toolAcc.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, acc]) => ({
        id: acc.id || `call_${Math.random().toString(36).slice(2, 10)}`,
        type: "function" as const,
        function: { name: acc.name, arguments: acc.args || "{}" },
      }))
      .filter((tc) => tc.function.name)

    if (!text && toolCalls.length === 0 && !finishReason) {
      throw new OpenRouterEmptyBodyError({ status: 200, ms: Date.now() - started })
    }

    log.debug("stream ok", {
      model: input.model,
      ms: Date.now() - started,
      text_len: text.length,
      tool_calls: toolCalls.length,
      finish: finishReason,
    })

    return { text, toolCalls, finishReason, tokensInput, tokensOutput, costUsd }
  } finally {
    clearTimeout(timer)
    input.signal?.removeEventListener("abort", onAbort)
  }
}
