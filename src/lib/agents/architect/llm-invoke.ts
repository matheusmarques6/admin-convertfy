/**
 * Camada de invocação compartilhada dos agentes do Component Assembler.
 *
 * Espelha o padrão de `chains/html.chain.ts`: SDK Anthropic direto (sem
 * LangChain, para não colidir com a sintaxe `{{var}}`), user_template
 * renderizado por `renderImageTemplate`, config carregada de
 * `email_agent_configs` com fallback hardcoded por serviço.
 */

import Anthropic from "@anthropic-ai/sdk"

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { AgentType, EmailAgentConfig } from "@/types/email-generation"

import { renderImageTemplate } from "../image/template-renderer"
import { isInsufficientCreditsMessage } from "../openrouter-invoke"

const log = logger.child("ArchitectLLM")

// O Montador gera o HTML completo (Opus 4.8, ~9 blocos) — 60s era curto e
// dava timeout, derrubando pro fallback. 180s dá folga (cabe no maxDuration
// 300s do route, já que Montador+Blueprint rodam antes da fase 2 em background).
const INVOKE_TIMEOUT_MS = 180_000

export interface AgentInvokeConfig {
  model: string
  temperature: number
  max_tokens: number
  system_prompt: string
  user_template: string
}

/** Carrega a config ativa de um agent_type (ou null se ausente). */
export async function loadActiveAgentConfig(
  agentType: AgentType,
): Promise<EmailAgentConfig | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("email_agent_configs")
    .select("*")
    .eq("agent_type", agentType)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    log.error("config.load_failed", { agentType, error: error.message })
    return null
  }
  return (data as EmailAgentConfig | null) ?? null
}

export interface InvokeResult {
  raw: string
  tokensInput: number
  tokensOutput: number
}

/**
 * Renderiza o user_template com as vars e invoca o modelo configurado.
 *
 * Roteamento por id do modelo:
 *   - id com "/" (ex.: "anthropic/claude-opus-4.8") → OpenRouter (OpenAI-compatible)
 *   - id sem "/" (ex.: "claude-sonnet-4-6")        → SDK Anthropic direto
 */
export async function invokeAgent(
  config: AgentInvokeConfig,
  vars: Record<string, string>,
): Promise<InvokeResult> {
  const userMessage = renderImageTemplate(config.user_template, vars)
  return config.model.includes("/")
    ? invokeViaOpenRouter(config, userMessage)
    : invokeViaAnthropic(config, userMessage)
}

/**
 * Modelos de reasoning (GPT-5.x) geram "thinking tokens" cobrados como output
 * e NÃO aceitam `temperature`. Detecta pra o invoke omitir temperatura e
 * travar reasoning.effort.
 */
function isReasoningModel(model: string): boolean {
  return /gpt-5/i.test(model)
}

/**
 * Opus 4.7/4.8 e reasoning models (GPT-5.x) não aceitam `temperature` (direto
 * ou via OpenRouter). Cobre os dois formatos de id: `claude-opus-4-8` e
 * `anthropic/claude-opus-4.8`.
 */
function modelSupportsTemperature(model: string): boolean {
  return !/opus-4[.-](7|8)/i.test(model) && !isReasoningModel(model)
}

/** Invoca via SDK Anthropic (Messages API), com prompt caching no system. */
async function invokeViaAnthropic(
  config: AgentInvokeConfig,
  userMessage: string,
): Promise<InvokeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nao configurada")

  const supportsTemperature = modelSupportsTemperature(config.model)

  // Prompt caching: marca o system (fixo entre lojas do mesmo batch) como
  // cacheável. A API só cacheia ACIMA do mínimo do modelo (2048 tokens p/
  // Sonnet 4.x, 4096 p/ Opus 4.x); abaixo disso ela IGNORA silenciosamente,
  // sem erro — então marcar é sempre seguro. Com os prompts atuais (~1k
  // tokens) fica inativo no Sonnet 4.6; ativa sozinho se eles crescerem.
  const system = [
    {
      type: "text" as const,
      text: config.system_prompt,
      cache_control: { type: "ephemeral" as const },
    },
  ]

  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: INVOKE_TIMEOUT_MS })
  const baseReq = {
    model: config.model,
    max_tokens: config.max_tokens,
    system,
    messages: [{ role: "user" as const, content: userMessage }],
  }

  const res = await client.messages.create(
    supportsTemperature
      ? { ...baseReq, temperature: config.temperature }
      : baseReq,
  )

  const raw = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim()

  const usage = res.usage as typeof res.usage & {
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
  if (usage.cache_read_input_tokens || usage.cache_creation_input_tokens) {
    log.info("prompt_cache", {
      model: config.model,
      read: usage.cache_read_input_tokens ?? 0,
      created: usage.cache_creation_input_tokens ?? 0,
    })
  }

  return {
    raw,
    tokensInput: res.usage.input_tokens,
    tokensOutput: res.usage.output_tokens,
  }
}

/** Invoca via OpenRouter (OpenAI-compatible chat/completions). */
async function invokeViaOpenRouter(
  config: AgentInvokeConfig,
  userMessage: string,
): Promise<InvokeResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY nao configurada")

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), INVOKE_TIMEOUT_MS)
  try {
    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: config.max_tokens,
      messages: [
        { role: "system", content: config.system_prompt },
        { role: "user", content: userMessage },
      ],
    }
    if (modelSupportsTemperature(config.model)) {
      body.temperature = config.temperature
    }
    // Reasoning models (GPT-5.x): trava o esforço em 'low' pra o custo ser
    // previsível. Sem isso, os thinking tokens (cobrados como output) podem
    // anular a economia vs Opus. Subir pra 'medium'/'high' se a qualidade
    // da arquitetura exigir.
    if (isReasoningModel(config.model)) {
      body.reasoning = { effort: "low" }
    }

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://admin.convertfy.com.br",
        "X-Title": "Convertfy Admin - Architect",
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "")
      // Sem crédito → alerta CTO (deduplicado). Fire-and-forget.
      if (resp.status === 402 || isInsufficientCreditsMessage(errBody)) {
        void import("../generation-notify.service")
          .then((m) =>
            m.notifyCreditsExhausted({
              provider: "OpenRouter",
              detail: errBody.slice(0, 200),
            }),
          )
          .catch(() => {})
      }
      throw new Error(`OpenRouter HTTP ${resp.status}: ${errBody.slice(0, 200)}`)
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const raw = (data.choices?.[0]?.message?.content ?? "").trim()
    return {
      raw,
      tokensInput: data.usage?.prompt_tokens ?? 0,
      tokensOutput: data.usage?.completion_tokens ?? 0,
    }
  } catch (e) {
    if (ctrl.signal.aborted || (e as Error)?.name === "AbortError") {
      throw new Error("timeout")
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Extrai o primeiro bloco JSON (`{...}` ou `[...]`) de um texto, removendo
 * fences markdown e prosa ao redor. Robusto a respostas envoltas em texto.
 */
export function extractJson(raw: string): string {
  let s = raw
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim()
  const firstOpen = s.search(/[[{]/)
  if (firstOpen > 0) s = s.slice(firstOpen)
  const lastClose = Math.max(s.lastIndexOf("]"), s.lastIndexOf("}"))
  if (lastClose >= 0) s = s.slice(0, lastClose + 1)
  return s.trim()
}
