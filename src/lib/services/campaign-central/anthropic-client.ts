/**
 * Cliente LLM da Central de Campanhas com cascata de provedores:
 *   1. OpenRouter (se OPENROUTER_API_KEY) — formato OpenAI-compatible
 *   2. Anthropic direta (se ANTHROPIC_API_KEY) — fallback
 *
 * Duas funções públicas:
 * - callAnthropicJson: JSON instruído no prompt + parse manual
 *   (structured outputs via API Anthropic / response_format via OR).
 * - callAnthropicWithWebSearch: tool web search nativa do Anthropic OR
 *   `:online` suffix do OpenRouter (que ativa Exa por trás).
 *
 * Telemetria fica a cargo do caller (campaign_ai_runs).
 */

import { logger } from "@/lib/logger"

const log = logger.child("CampaignCentralLLM")

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const MAX_PAUSE_TURN_RETRIES = 3

function useOpenRouter(): boolean {
  return !!process.env.OPENROUTER_API_KEY
}

/**
 * Normaliza model slug pra OpenRouter (vendor/model). Aceita:
 *   - "anthropic/claude-sonnet-4.6"  → mantém
 *   - "claude-sonnet-4-6"            → "anthropic/claude-sonnet-4.6"
 *   - "claude-opus-4-7"              → "anthropic/claude-opus-4.7"
 *   - "claude-haiku-4-5-20251001"    → "anthropic/claude-haiku-4.5"
 */
function toOpenRouterModel(model: string, online = false): string {
  let slug = model
  if (!slug.includes("/")) {
    // claude-sonnet-4-6 → claude-sonnet-4.6
    const cleaned = slug.replace(/(\d+)-(\d+)(?:-\d{4,8})?$/, "$1.$2")
    slug = `anthropic/${cleaned}`
  }
  return online ? `${slug}:online` : slug
}

export interface AnthropicCallResult {
  rawText: string
  parsed: unknown | null
  parseError: string | null
  tokensInput: number
  tokensOutput: number
  costCents: number
  durationMs: number
}

interface AnthropicMessageResponse {
  content?: Array<{ type?: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
  stop_reason?: string
  error?: { message?: string }
}

/** Pricing por milhão de tokens (mesma tabela de crm-ai-action.service.ts). */
export function computeCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const pricing: Record<string, { input: number; output: number }> = {
    "claude-opus-4-8": { input: 15.0, output: 75.0 },
    "claude-opus-4-7": { input: 15.0, output: 75.0 },
    "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
    "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  }
  const p = pricing[model] || { input: 3.0, output: 15.0 }
  const usd = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
  return Math.round(usd * 100)
}

/** Aceita JSON puro, cercado por ```json ... ``` ou com texto em volta. */
export function tryParseJson(raw: string): { parsed: unknown | null; error: string | null } {
  const candidates: string[] = []
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) candidates.push(fenced[1].trim())
  candidates.push(raw.trim())
  // Fallback: extrai do primeiro '{' ao último '}'
  const first = raw.indexOf("{")
  const last = raw.lastIndexOf("}")
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1))

  for (const c of candidates) {
    if (!c) continue
    try {
      return { parsed: JSON.parse(c), error: null }
    } catch {
      // tenta o próximo candidato
    }
  }
  return { parsed: null, error: "JSON parse falhou em todos os candidatos" }
}

function requireAnthropicKey(): string {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error("ANTHROPIC_API_KEY nao configurada")
  return key
}

function requireOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error("OPENROUTER_API_KEY nao configurada")
  return key
}

function extractText(data: AnthropicMessageResponse): string {
  return (data.content || [])
    .filter((c) => c.type === "text" || c.text)
    .map((c) => c.text || "")
    .join("")
}

interface OpenRouterChatResponse {
  choices?: Array<{
    message?: { content?: string }
    finish_reason?: string
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string }
}

async function callOpenRouterJson(params: {
  model: string
  system: string
  user: string
  maxTokens: number
  temperature: number
  online?: boolean
}): Promise<{ rawText: string; tokensIn: number; tokensOut: number }> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireOpenRouterKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://admin.convertfy.com.br",
      "X-Title": "Convertfy Campaign Central",
    },
    body: JSON.stringify({
      model: toOpenRouterModel(params.model, params.online),
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      response_format: { type: "json_object" },
    }),
  })

  const data = (await res.json()) as OpenRouterChatResponse
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `OpenRouter HTTP ${res.status}`)
  }
  return {
    rawText: (data.choices?.[0]?.message?.content ?? "").trim(),
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
  }
}

/**
 * Chamada JSON via OpenRouter (preferência) ou Anthropic direta (fallback).
 *
 * OpenRouter: usa response_format json_object + JSON instruído no prompt.
 * Anthropic: usa output_config.format json_schema (structured outputs).
 */
export async function callAnthropicJson(params: {
  model: string
  system: string
  user: string
  maxTokens: number
  temperature?: number
  outputSchema: Record<string, unknown>
}): Promise<AnthropicCallResult> {
  const t0 = Date.now()
  const temperature = params.temperature ?? 0.7

  if (useOpenRouter()) {
    // Adiciona instrução de JSON conforme schema no system prompt — a API
    // OpenAI-compatible não tem structured outputs com schema livre.
    const systemWithSchema = `${params.system}\n\nOUTPUT JSON SCHEMA (follow strictly):\n${JSON.stringify(
      params.outputSchema,
    )}\n\nReturn ONLY a JSON object matching this schema. No markdown.`
    try {
      const { rawText, tokensIn, tokensOut } = await callOpenRouterJson({
        model: params.model,
        system: systemWithSchema,
        user: params.user,
        maxTokens: params.maxTokens,
        temperature,
      })
      const { parsed, error } = tryParseJson(rawText)
      return {
        rawText,
        parsed,
        parseError: error,
        tokensInput: tokensIn,
        tokensOutput: tokensOut,
        costCents: computeCostCents(params.model, tokensIn, tokensOut),
        durationMs: Date.now() - t0,
      }
    } catch (err) {
      log.warn("openrouter.json_failed", {
        error: err instanceof Error ? err.message : String(err),
      })
      // Sem Anthropic key, propaga o erro
      if (!process.env.ANTHROPIC_API_KEY) throw err
      // Senão cai pro Anthropic
    }
  }

  // Fallback: Anthropic direta
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": requireAnthropicKey(),
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens,
      temperature,
      system: params.system,
      messages: [{ role: "user", content: params.user }],
      output_config: { format: { type: "json_schema", schema: params.outputSchema } },
    }),
  })

  const data = (await res.json()) as AnthropicMessageResponse
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Anthropic HTTP ${res.status}`)
  }

  const rawText = extractText(data)
  const tokensInput = data.usage?.input_tokens || 0
  const tokensOutput = data.usage?.output_tokens || 0
  const { parsed, error } = tryParseJson(rawText)

  return {
    rawText,
    parsed,
    parseError: error,
    tokensInput,
    tokensOutput,
    costCents: computeCostCents(params.model, tokensInput, tokensOutput),
    durationMs: Date.now() - t0,
  }
}

/**
 * Chamada com web search (tool server-side). JSON instruído no prompt.
 * Reenvia em caso de pause_turn até MAX_PAUSE_TURN_RETRIES.
 */
export async function callAnthropicWithWebSearch(params: {
  model: string
  system: string
  user: string
  maxTokens: number
  temperature?: number
  maxSearches?: number
}): Promise<AnthropicCallResult> {
  const t0 = Date.now()
  const temperature = params.temperature ?? 0.7

  if (useOpenRouter()) {
    // :online suffix do OpenRouter ativa web search (via Exa internamente).
    // maxSearches não é configurável aqui — usa default do OpenRouter (5).
    try {
      const { rawText, tokensIn, tokensOut } = await callOpenRouterJson({
        model: params.model,
        system: params.system,
        user: params.user,
        maxTokens: params.maxTokens,
        temperature,
        online: true,
      })
      const { parsed, error } = tryParseJson(rawText)
      return {
        rawText,
        parsed,
        parseError: error,
        tokensInput: tokensIn,
        tokensOutput: tokensOut,
        costCents: computeCostCents(params.model, tokensIn, tokensOut),
        durationMs: Date.now() - t0,
      }
    } catch (err) {
      log.warn("openrouter.websearch_failed", {
        error: err instanceof Error ? err.message : String(err),
      })
      if (!process.env.ANTHROPIC_API_KEY) throw err
      // Senão cai pro Anthropic
    }
  }

  const apiKey = requireAnthropicKey()
  let totalIn = 0
  let totalOut = 0

  const messages: Array<{ role: string; content: unknown }> = [
    { role: "user", content: params.user },
  ]

  let data: AnthropicMessageResponse | null = null
  for (let attempt = 0; attempt <= MAX_PAUSE_TURN_RETRIES; attempt++) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature ?? 0.7,
        system: params.system,
        messages,
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: params.maxSearches ?? 5,
          },
        ],
      }),
    })

    data = (await res.json()) as AnthropicMessageResponse
    if (!res.ok || data.error) {
      throw new Error(data.error?.message || `Anthropic HTTP ${res.status}`)
    }

    totalIn += data.usage?.input_tokens || 0
    totalOut += data.usage?.output_tokens || 0

    if (data.stop_reason !== "pause_turn") break

    // pause_turn: o servidor pausou um turno longo de busca — reenviar o
    // content do assistant como está pra deixar o modelo continuar.
    log.info("websearch.pause_turn", { attempt })
    messages.push({ role: "assistant", content: data.content })
  }

  if (!data) throw new Error("Anthropic sem resposta")

  const rawText = extractText(data)
  const { parsed, error } = tryParseJson(rawText)

  return {
    rawText,
    parsed,
    parseError: error,
    tokensInput: totalIn,
    tokensOutput: totalOut,
    costCents: computeCostCents(params.model, totalIn, totalOut),
    durationMs: Date.now() - t0,
  }
}
