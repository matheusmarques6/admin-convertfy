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
import {
  isInsufficientCreditsMessage,
  OpenRouterHttpError,
  OpenRouterMidStreamError,
  parseOpenRouterBody,
  withOpenRouterRetry,
} from "../openrouter-invoke"

const log = logger.child("ArchitectLLM")

// Teto de invoke dos agentes do architect. Dimensionado quando o Montador
// gerava o HTML completo (Opus 4.8, ~9 blocos): 60s era curto e 180s ainda
// derrubava lojas grandes pro fallback. Desde CM-2 a montagem é por código e
// quem pode demorar aqui é o Curador; o valor foi MANTIDO porque o cron de
// dispatch limita o tick assumindo este teto — um lote lento (~240s) sempre
// fecha dentro do maxDuration=300s do route (ver TICK_BUDGET_MS em
// email-dispatch-queue.service.ts). Ajustável sem deploy via env.
const INVOKE_TIMEOUT_MS = Number(process.env.ARCHITECT_INVOKE_TIMEOUT_MS ?? 240_000)

export interface AgentInvokeConfig {
  model: string
  temperature: number
  max_tokens: number
  system_prompt: string
  user_template: string
  /**
   * Esforço de raciocínio para modelos de reasoning (GPT-5.x). Omitido →
   * `medium` (o ajuste do Curador). O `max_tokens` desses modelos cobre
   * pensamento + resposta: agente com orçamento curto e tarefa mecânica
   * (encurtador) pede `low`, senão o modelo gasta tudo pensando e a
   * resposta volta vazia (run copy_fit 5d7396b5, 02/09).
   */
  reasoning?: { effort: "low" | "medium" | "high" }
}

/**
 * Interpola vars no SYSTEM prompt por substituição LITERAL (story CM-3).
 *
 * Não usa `renderImageTemplate` de propósito: aquele renderer substitui
 * qualquer `{{ALGO}}` e resolve var desconhecida para string vazia, o que
 * apagaria notação legítima dos prompts. Auditoria de 30/jul: o
 * `DEFAULT_BLUEPRINT_SYSTEM` cita "as tags {{TAG}} do HTML" duas vezes, e o
 * prompt do hero citava `{{HERO_IMAGE}}` — foi exatamente esse o bug
 * corrigido na story CM-1.
 *
 * Aqui só as chaves passadas são trocadas; todo o resto fica byte a byte.
 */
export function interpolateSystem(
  systemPrompt: string,
  vars?: Record<string, string>,
): string {
  if (!vars) return systemPrompt
  let out = systemPrompt
  for (const [key, value] of Object.entries(vars)) {
    // Replacement por FUNÇÃO: com string, `$&`/`$1`/`$'` no valor seriam
    // interpretados como referências ao match e corromperiam o conteúdo. O
    // catálogo carrega texto livre de cadastro (nome de variante com "R$",
    // descrição com "$&"), então isso não é hipotético.
    out = out.replaceAll(`{{${key}}}`, () => value)
  }
  return out
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
  /**
   * Custo real em USD do OpenRouter (`usage.cost`) quando o modelo roteou por
   * lá; 0 no caminho Anthropic-direto (sem accounting do OpenRouter → o custo
   * cai na estimativa por token em resolveCostCents).
   */
  costUsd: number
  /**
   * Por que o modelo parou: `"stop"`/`"end_turn"` é o normal; `"length"`/
   * `"max_tokens"` diz que o orçamento acabou — com `raw` vazio, foi o
   * raciocínio que consumiu tudo. Ausente quando o provider não informa.
   */
  finishReason?: string
  /** Tokens de raciocínio cobrados como saída, quando o provider reporta. */
  reasoningTokens?: number
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
  /**
   * Vars do SYSTEM prompt, substituídas LITERALMENTE (ver
   * `interpolateSystem`). Usado pelo Curador para embutir o catálogo da
   * biblioteca no prefixo cacheável.
   */
  systemVars?: Record<string, string>,
): Promise<InvokeResult> {
  const userMessage = renderImageTemplate(config.user_template, vars)
  const resolved: AgentInvokeConfig = systemVars
    ? { ...config, system_prompt: interpolateSystem(config.system_prompt, systemVars) }
    : config
  return resolved.model.includes("/")
    ? invokeViaOpenRouter(resolved, userMessage)
    : invokeViaAnthropic(resolved, userMessage)
}

/**
 * Modelos de reasoning (GPT-5.x) geram "thinking tokens" cobrados como output;
 * o comportamento deles é regulado por `reasoning.effort`, não por
 * `temperature` (que o OpenRouter dropa sem erro pra esses modelos). Detecta
 * pra o invoke omitir a temperatura e travar o effort.
 */
function isReasoningModel(model: string): boolean {
  return /gpt-5/i.test(model)
}

/**
 * Não enviamos `temperature` pra Opus 4.7/4.8 nem pra reasoning models
 * (GPT-5.x): eles não a usam. Via OpenRouter ela é dropada silenciosamente
 * (sem erro); via SDK Anthropic direto pode ser rejeitada — então omitimos
 * nos dois caminhos. Cobre os ids `claude-opus-4-8` e `anthropic/claude-opus-4.8`.
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
    costUsd: 0, // Anthropic-direto não passa pelo accounting do OpenRouter.
    ...(res.stop_reason ? { finishReason: res.stop_reason } : {}),
  }
}

/**
 * Content do system para o OpenRouter.
 *
 * Modelos Anthropic suportam prompt caching, mas só quando o `cache_control`
 * viaja no content — e para isso o content precisa ser ARRAY, não string. É o
 * que torna o catálogo da biblioteca no system do Curador realmente cacheável
 * (story CM-3): ele é idêntico entre lojas, então da segunda invocação em
 * diante o prefixo vem do cache.
 *
 * Só para `anthropic/*`: os demais provedores ignoram o campo, e alguns
 * rejeitam content em array. Prefixo abaixo do mínimo do modelo (2048 tokens
 * no Sonnet 4.x) é ignorado silenciosamente pela API — marcar é sempre seguro.
 */
function systemContent(config: AgentInvokeConfig): unknown {
  if (!/^anthropic\//i.test(config.model)) return config.system_prompt
  return [
    {
      type: "text",
      text: config.system_prompt,
      cache_control: { type: "ephemeral" },
    },
  ]
}

/** Invoca via OpenRouter (OpenAI-compatible chat/completions). */
async function invokeViaOpenRouter(
  config: AgentInvokeConfig,
  userMessage: string,
): Promise<InvokeResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY nao configurada")

  return withOpenRouterRetry(
    (attempt) => callOnceArchitect(config, userMessage, apiKey, attempt),
    {
      onRetry: (err, n) =>
        log.warn("openrouter.retry", {
          model: config.model,
          attempt: n,
          errorName: (err as Error)?.name,
          errorType: (err as { errorType?: string })?.errorType,
          message: (err as Error)?.message,
        }),
    },
  )
}

async function callOnceArchitect(
  config: AgentInvokeConfig,
  userMessage: string,
  apiKey: string,
  attempt: number,
): Promise<InvokeResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), INVOKE_TIMEOUT_MS)
  const t0 = Date.now()
  try {
    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: config.max_tokens,
      messages: [
        { role: "system", content: systemContent(config) },
        { role: "user", content: userMessage },
      ],
    }
    if (modelSupportsTemperature(config.model)) {
      body.temperature = config.temperature
    }
    // Reasoning models (GPT-5.x): esforço da config ou 'medium' (≈50% do
    // max_tokens p/ reasoning) — mais qualidade de arquitetura que 'low'
    // (~20%), custo ainda bem abaixo do Opus. 'high'/'xhigh' encarecem mais.
    // O agente escolhe (`config.reasoning`): o encurtador roda em 'low'.
    if (isReasoningModel(config.model)) {
      body.reasoning = config.reasoning ?? { effort: "medium" }
    } else if (
      /kimi|glm/i.test(config.model) &&
      process.env.FORMAT_OPS_REASONING !== "on"
    ) {
      // Kimi K3 / GLM: reasoning always-on por default do modelo — sem este
      // corte o Curador queimava ~160s/27k tokens só pensando. O output aqui
      // é JSON de escolhas / HTML de montagem, não precisa de thinking.
      // FORMAT_OPS_REASONING=on re-liga sem deploy.
      body.reasoning = { enabled: false }
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
      throw new OpenRouterHttpError({
        status: resp.status,
        snippet: errBody.slice(0, 200),
      })
    }

    const rawBody = await resp.text()
    const ms = Date.now() - t0
    const parsed = parseOpenRouterBody(rawBody, { status: resp.status, ms })
    log.info("openrouter.ok", {
      model: config.model,
      attempt,
      ms,
      tokensIn: parsed.tokensInput,
      tokensOut: parsed.tokensOutput,
      finishReason: parsed.finishReason ?? null,
      reasoningTokens: parsed.reasoningTokens ?? null,
      // Resposta vazia com orçamento cheio: o sinal que faltou na run
      // 5d7396b5 — a telemetria só via "Unexpected end of JSON input".
      emptyText: parsed.text === "",
    })
    return {
      raw: parsed.text,
      tokensInput: parsed.tokensInput,
      tokensOutput: parsed.tokensOutput,
      costUsd: parsed.costUsd,
      ...(parsed.finishReason ? { finishReason: parsed.finishReason } : {}),
      ...(typeof parsed.reasoningTokens === "number"
        ? { reasoningTokens: parsed.reasoningTokens }
        : {}),
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


// ── Invocação COM ferramentas (consulta ao vault sob demanda, 02/09) ──────

/** Definição de ferramenta no formato OpenAI/OpenRouter (function calling). */
export interface ToolSpec {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ToolCallLog {
  ferramenta: string
  /** Argumento principal (pasta/caminho) — o que ele quis ver. */
  argumento: string
  /** Tamanho do que voltou para o modelo. */
  chars: number
  ms: number
  erro?: string
}

export interface InvokeWithToolsResult extends InvokeResult {
  consultas: ToolCallLog[]
  /** Chamadas ao modelo (1 = não usou ferramenta). */
  voltas: number
  /** O loop falhou e a resposta veio de uma chamada sem ferramentas. */
  fallback_sem_ferramentas: boolean
}

export interface InvokeWithToolsOptions {
  tools: ToolSpec[]
  executar: (nome: string, args: Record<string, unknown>) => Promise<string>
  /** Teto de execuções de ferramenta por run. Default 4. */
  maxCalls?: number
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: unknown
  tool_calls?: unknown
  tool_call_id?: string
}

interface OpenRouterToolTurn {
  text: string
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown>; argsRaw: string }>
  assistantMessage: ChatMessage
  tokensInput: number
  tokensOutput: number
  costUsd: number
  finishReason?: string
}

/**
 * Uma volta do chat/completions com `tools`. Erros HTTP/mid-stream seguem a
 * classificação do `openrouter-invoke` (retryable ou não).
 */
async function callOnceWithTools(
  config: AgentInvokeConfig,
  messages: ChatMessage[],
  tools: ToolSpec[],
  toolChoice: "auto" | "none",
  apiKey: string,
): Promise<OpenRouterToolTurn> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), INVOKE_TIMEOUT_MS)
  const t0 = Date.now()
  try {
    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: config.max_tokens,
      messages,
      tools,
      tool_choice: toolChoice,
    }
    if (modelSupportsTemperature(config.model)) body.temperature = config.temperature
    if (isReasoningModel(config.model)) body.reasoning = config.reasoning ?? { effort: "medium" }

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://admin.convertfy.com.br",
        "X-Title": "Convertfy Admin - Architect (tools)",
      },
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "")
      throw new OpenRouterHttpError({ status: resp.status, snippet: errBody.slice(0, 200) })
    }
    const rawBody = await resp.text()
    const ms = Date.now() - t0
    if (rawBody.trim() === "") {
      throw new OpenRouterMidStreamError({ errorType: "midstream_error", status: resp.status, ms, snippet: "empty body" })
    }
    let data: {
      error?: { message?: string; metadata?: { error_type?: string } }
      choices?: Array<{
        message?: {
          content?: string | null
          tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>
        }
        finish_reason?: string
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
    }
    try {
      data = JSON.parse(rawBody)
    } catch {
      throw new OpenRouterMidStreamError({ errorType: "non_json_body", status: resp.status, ms, snippet: rawBody.slice(0, 200) })
    }
    if (data.error) {
      throw new OpenRouterMidStreamError({
        errorType: data.error.metadata?.error_type ?? "midstream_error",
        status: resp.status,
        ms,
        snippet: (data.error.message ?? "").slice(0, 200),
      })
    }
    const choice = data.choices?.[0]
    const msg = choice?.message ?? {}
    const toolCalls = (msg.tool_calls ?? [])
      .filter((c) => c?.function?.name)
      .map((c, i) => {
        const argsRaw = c.function?.arguments ?? "{}"
        let args: Record<string, unknown> = {}
        try {
          const parsed = JSON.parse(argsRaw)
          if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>
        } catch {
          // argumento ilegível: a ferramenta recebe vazio e responde com erro legível
        }
        return { id: c.id ?? `call_${i}`, name: String(c.function?.name), args, argsRaw }
      })
    return {
      text: (typeof msg.content === "string" ? msg.content : "").trim(),
      toolCalls,
      assistantMessage: {
        role: "assistant",
        content: typeof msg.content === "string" ? msg.content : "",
        ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}),
      },
      tokensInput: data.usage?.prompt_tokens ?? 0,
      tokensOutput: data.usage?.completion_tokens ?? 0,
      costUsd: data.usage?.cost ?? 0,
      ...(choice?.finish_reason ? { finishReason: choice.finish_reason } : {}),
    }
  } catch (e) {
    if (ctrl.signal.aborted || (e as Error)?.name === "AbortError") throw new Error("timeout")
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Como `invokeAgent`, mas o modelo pode chamar ferramentas (function
 * calling) antes de responder — é o que deixa o Curador conferir uma nota
 * do Obsidian sob demanda. Só o caminho OpenRouter; id sem "/" cai no
 * `invokeAgent` comum, sem ferramentas.
 *
 * Loop: cada volta reenvia o histórico inteiro (o contexto é cobrado de
 * novo — por isso o teto de chamadas). Atingido o teto, a volta seguinte
 * vai com `tool_choice: "none"` e o modelo tem de responder. Tokens e custo
 * somam todas as voltas. Erro no loop é FAIL-OPEN: a resposta vem de uma
 * chamada normal sem ferramentas, marcada em `fallback_sem_ferramentas`.
 */
export async function invokeAgentWithTools(
  config: AgentInvokeConfig,
  vars: Record<string, string>,
  systemVars: Record<string, string> | undefined,
  opts: InvokeWithToolsOptions,
): Promise<InvokeWithToolsResult> {
  const semFerramentas = async (consultas: ToolCallLog[], voltas: number): Promise<InvokeWithToolsResult> => {
    const r = await invokeAgent(config, vars, systemVars)
    return { ...r, consultas, voltas: voltas + 1, fallback_sem_ferramentas: true }
  }
  if (!config.model.includes("/") || opts.tools.length === 0) {
    const r = await invokeAgent(config, vars, systemVars)
    return { ...r, consultas: [], voltas: 1, fallback_sem_ferramentas: false }
  }
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY nao configurada")

  const maxCalls = Math.max(0, opts.maxCalls ?? 4)
  const userMessage = renderImageTemplate(config.user_template, vars)
  const resolved: AgentInvokeConfig = systemVars
    ? { ...config, system_prompt: interpolateSystem(config.system_prompt, systemVars) }
    : config
  const messages: ChatMessage[] = [
    { role: "system", content: systemContent(resolved) },
    { role: "user", content: userMessage },
  ]
  const consultas: ToolCallLog[] = []
  let tokensInput = 0
  let tokensOutput = 0
  let costUsd = 0
  let voltas = 0
  let executadas = 0

  try {
    // Teto de voltas = chamadas permitidas + a volta final obrigatória; o
    // +1 cobre o caso em que uma volta devolve várias tool_calls de uma vez.
    for (let volta = 0; volta < maxCalls + 2; volta++) {
      const toolChoice: "auto" | "none" = executadas >= maxCalls ? "none" : "auto"
      const turn = await withOpenRouterRetry(
        () => callOnceWithTools(resolved, messages, opts.tools, toolChoice, apiKey),
        {
          onRetry: (err, n) =>
            log.warn("openrouter.tools.retry", {
              model: config.model,
              attempt: n,
              message: (err as Error)?.message,
            }),
        },
      )
      voltas++
      tokensInput += turn.tokensInput
      tokensOutput += turn.tokensOutput
      costUsd += turn.costUsd

      if (turn.toolCalls.length === 0 || toolChoice === "none") {
        log.info("openrouter.tools.done", {
          model: config.model,
          voltas,
          consultas: consultas.length,
          tokensIn: tokensInput,
          tokensOut: tokensOutput,
        })
        return {
          raw: turn.text,
          tokensInput,
          tokensOutput,
          costUsd,
          ...(turn.finishReason ? { finishReason: turn.finishReason } : {}),
          consultas,
          voltas,
          fallback_sem_ferramentas: false,
        }
      }

      messages.push(turn.assistantMessage)
      for (const call of turn.toolCalls) {
        const t0 = Date.now()
        let resultado: string
        let erro: string | undefined
        if (executadas >= maxCalls) {
          resultado = `(limite de ${maxCalls} consultas atingido — responda com o que já tem)`
          erro = "limite"
        } else {
          executadas++
          try {
            resultado = await opts.executar(call.name, call.args)
          } catch (e) {
            erro = e instanceof Error ? e.message : String(e)
            resultado = `erro ao consultar: ${erro}`
          }
        }
        const argumento = Object.values(call.args).find((v) => typeof v === "string") as string | undefined
        consultas.push({
          ferramenta: call.name,
          argumento: (argumento ?? call.argsRaw).slice(0, 200),
          chars: resultado.length,
          ms: Date.now() - t0,
          ...(erro ? { erro } : {}),
        })
        messages.push({ role: "tool", tool_call_id: call.id, content: resultado })
      }
    }
    // Saiu do for sem resposta final (só acontece com um modelo que insiste
    // em chamar ferramenta com tool_choice none) — fail-open.
    log.warn("openrouter.tools.sem_resposta_final", { model: config.model, voltas })
    return semFerramentas(consultas, voltas)
  } catch (err) {
    log.warn("openrouter.tools.failed", {
      model: config.model,
      voltas,
      consultas: consultas.length,
      error: err instanceof Error ? err.message : String(err),
    })
    return semFerramentas(consultas, voltas)
  }
}
