/**
 * Cliente Anthropic da Central de Campanhas.
 *
 * Fetch direto na Messages API (sem SDK — padrão do repo, ver
 * crm-ai-action.service.ts). Dois modos:
 *
 * - callAnthropicJson: structured outputs (output_config.format json_schema)
 *   pra chamadas SEM web search — JSON garantido pela API.
 * - callAnthropicWithWebSearch: tool server-side de web search; JSON
 *   instruído no prompt + parse manual (citations é incompatível com
 *   structured outputs). Trata stop_reason "pause_turn" reenviando o
 *   content do assistant pra retomar a busca.
 *
 * Telemetria fica a cargo do caller (campaign_ai_runs).
 */

import { logger } from "@/lib/logger"

const log = logger.child("CampaignCentralAnthropic")

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"
const MAX_PAUSE_TURN_RETRIES = 3

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

function requireApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error("ANTHROPIC_API_KEY nao configurada")
  return key
}

function extractText(data: AnthropicMessageResponse): string {
  return (data.content || [])
    .filter((c) => c.type === "text" || c.text)
    .map((c) => c.text || "")
    .join("")
}

/**
 * Chamada com structured outputs — a API garante JSON conforme o schema.
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
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": requireApiKey(),
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature ?? 0.7,
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
  const apiKey = requireApiKey()
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
