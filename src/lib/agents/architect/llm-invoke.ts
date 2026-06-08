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

const log = logger.child("ArchitectLLM")

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
 * Renderiza o user_template com as vars e invoca a Messages API.
 * Modelos opus-4-7/4-8 não aceitam `temperature` — omitido nesse caso.
 */
export async function invokeAgent(
  config: AgentInvokeConfig,
  vars: Record<string, string>,
): Promise<InvokeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nao configurada")

  const userMessage = renderImageTemplate(config.user_template, vars)
  const supportsTemperature = !/^claude-opus-4-(7|8)/.test(config.model)

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

  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 })
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
