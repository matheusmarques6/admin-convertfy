/**
 * Invocação compartilhada via OpenRouter (OpenAI-compatible chat/completions).
 *
 * Usado pelos agentes que rodam com SDK Anthropic direto (html.chain, qa.chain)
 * para rotear pelo OpenRouter quando o model id está no formato "vendor/model"
 * (ex.: "anthropic/claude-sonnet-4.6"). Centraliza headers + parsing pra não
 * duplicar a lógica (e pra não repetir o bug do travessão no header X-Title).
 *
 * Parse defensivo + retry (https://openrouter.ai/docs/api/reference/errors-and-debugging):
 *
 * O OpenRouter pode entregar erros DEPOIS de commitar o `200 OK` (mid-stream:
 * provider disconnect/timeout). Em request non-streaming isso vira corpo
 * vazio, frame SSE com `finish_reason:"error"`, ou texto não-JSON. Quem chama
 * `resp.json()` direto recebe `SyntaxError: Unexpected end of JSON input` e
 * 0/0 tokens. Aqui lemos o body como texto, classificamos a falha em erros
 * nomeados (com `retryable`), e damos 1 retry com backoff nas transitórias.
 */

import { logger } from "@/lib/logger"

const log = logger.child("OpenRouterInvoke")

/** True se o model deve ser roteado pelo OpenRouter (id "vendor/model"). */
export function isOpenRouterModel(model: string): boolean {
  return model.includes("/")
}

/** Detecta erro de crédito esgotado (402 / "insufficient credits") do provedor. */
export function isInsufficientCreditsMessage(msg: string): boolean {
  return /insufficient credits|credit balance.*too low|purchase credits|add more.*credit|\b402\b/i.test(
    msg,
  )
}

// ── Erros nomeados ─────────────────────────────────────────────────────
//
// Todos carregam `retryable` pra que `withOpenRouterRetry` decida sem
// inspecionar mensagens. Mensagem é construída pra ser diagnóstica
// (entra direto no `email_generation_runs.error_message`).

/** Corpo vazio do OpenRouter (200 OK, 0 bytes) — sempre transitório. */
export class OpenRouterEmptyBodyError extends Error {
  readonly retryable = true
  readonly status: number
  readonly ms: number
  constructor(ctx: { status: number; ms: number }) {
    super(`OpenRouter empty body (status=${ctx.status}, ${ctx.ms}ms)`)
    this.name = "OpenRouterEmptyBodyError"
    this.status = ctx.status
    this.ms = ctx.ms
  }
}

/**
 * Erro entregue in-band pelo OpenRouter depois do `200 OK` (mid-stream)
 * ou corpo não-JSON. `errorType` reflete `metadata.error_type` quando
 * presente; "non_json_body" quando o body veio em texto inesperado.
 *
 * Tipos transitórios (`retryable=true`):
 *   - "provider_timeout"  — provider parou de responder mid-generation
 *   - "provider_error"    — provider crashou / outro erro upstream
 *   - "non_json_body"     — body chegou em texto/HTML, não-JSON
 *   - "midstream_error"   — finish_reason:"error" sem error_type específico
 *
 * Outros (`retryable=false`):
 *   - "moderation"        — output cortado por política, retry inútil
 *   - tudo o que vier com metadata indicando classe não-transitória
 */
export class OpenRouterMidStreamError extends Error {
  readonly retryable: boolean
  readonly errorType: string
  readonly status: number
  readonly ms: number
  readonly snippet: string
  constructor(ctx: {
    errorType: string
    status: number
    ms: number
    snippet: string
    retryable?: boolean
  }) {
    const retryable = ctx.retryable ?? isMidStreamRetryable(ctx.errorType)
    super(
      `OpenRouter mid-stream: ${ctx.errorType} (status=${ctx.status}, ${ctx.ms}ms) — ${ctx.snippet}`,
    )
    this.name = "OpenRouterMidStreamError"
    this.retryable = retryable
    this.errorType = ctx.errorType
    this.status = ctx.status
    this.ms = ctx.ms
    this.snippet = ctx.snippet
  }
}

/** Erro HTTP do OpenRouter (status != 2xx). */
export class OpenRouterHttpError extends Error {
  readonly retryable: boolean
  readonly status: number
  readonly snippet: string
  constructor(ctx: { status: number; snippet: string }) {
    // 5xx + 408 (request timeout) + 429 (rate limit) → transitórios.
    // 402 (sem crédito), 4xx em geral → permanentes.
    const retryable =
      ctx.status >= 500 || ctx.status === 408 || ctx.status === 429
    super(`OpenRouter HTTP ${ctx.status}: ${ctx.snippet}`)
    this.name = "OpenRouterHttpError"
    this.retryable = retryable
    this.status = ctx.status
    this.snippet = ctx.snippet
  }
}

function isMidStreamRetryable(errorType: string): boolean {
  return /provider_timeout|provider_error|provider_disconnect|non_json_body|midstream_error|timeout|disconnect/i.test(
    errorType,
  )
}

// ── Parse do body (puro, testável) ─────────────────────────────────────

/** Resultado normalizado do body, igual ao formato non-streaming. */
export interface ParsedBody {
  text: string
  tokensInput: number
  tokensOutput: number
  /**
   * Custo REAL em USD reportado pelo OpenRouter (`usage.cost`). 0 quando
   * ausente (provider sem accounting / erro). Preferir isto ao cálculo por
   * token — é o valor exato que o OpenRouter cobra (igual ao image.chain).
   */
  costUsd: number
}

/**
 * Classifica e parseia o body do OpenRouter (lido como texto), suportando
 * JSON normal e o caso SSE non-streaming que aparece em mid-stream errors.
 *
 * Lança erro nomeado em vez de devolver `text:""` silencioso — o caller
 * precisa saber a diferença entre "resposta vazia legítima" (nunca acontece
 * na prática com max_tokens > 0) e "OpenRouter abortou no meio".
 */
export function parseOpenRouterBody(
  body: string,
  ctx: { status: number; ms: number },
): ParsedBody {
  if (body.trim() === "") {
    throw new OpenRouterEmptyBodyError(ctx)
  }

  // Detecta SSE: alguma linha começa com "data:" ou ":". Aparece quando o
  // OpenRouter cai no caminho de streaming pra entregar o erro in-band.
  const looksLikeSse = /^(\s*:|\s*data:)/m.test(body)
  if (looksLikeSse) {
    return parseSseBody(body, ctx)
  }

  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    throw new OpenRouterMidStreamError({
      errorType: "non_json_body",
      status: ctx.status,
      ms: ctx.ms,
      snippet: body.slice(0, 200),
    })
  }

  // Top-level error: OpenRouter pode entregar { error: { ... } } com 200 OK
  // quando a falha vem antes do primeiro token (raro, mas documentado).
  const topErr = (data as { error?: { message?: string; metadata?: { raw?: string; error_type?: string } } }).error
  if (topErr) {
    const errorType =
      topErr.metadata?.error_type ?? "midstream_error"
    throw new OpenRouterMidStreamError({
      errorType,
      status: ctx.status,
      ms: ctx.ms,
      snippet: (topErr.message ?? topErr.metadata?.raw ?? "").slice(0, 200),
    })
  }

  const typed = data as {
    choices?: Array<{
      message?: { content?: string }
      finish_reason?: string
    }>
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  }

  // Caso non-streaming clássico com finish_reason:"error" no choice.
  const errChoice = typed.choices?.find((c) => c.finish_reason === "error")
  if (errChoice) {
    throw new OpenRouterMidStreamError({
      errorType: "midstream_error",
      status: ctx.status,
      ms: ctx.ms,
      snippet: (errChoice.message?.content ?? "").slice(0, 200),
    })
  }

  const text = (typed.choices?.[0]?.message?.content ?? "").trim()
  return {
    text,
    tokensInput: typed.usage?.prompt_tokens ?? 0,
    tokensOutput: typed.usage?.completion_tokens ?? 0,
    costUsd: typed.usage?.cost ?? 0,
  }
}

/**
 * Parseia body em formato SSE (linhas "data: {...}" intercaladas com
 * comentários ":..."). Comentários (incluindo o keep-alive
 * ": OPENROUTER PROCESSING") são ignorados conforme a SSE spec.
 */
function parseSseBody(body: string, ctx: { status: number; ms: number }): ParsedBody {
  const lines = body.split(/\r?\n/)
  const frames: unknown[] = []
  let lastErrorMsg = ""
  let usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined

  for (const raw of lines) {
    const line = raw.trimStart()
    if (line === "" || line.startsWith(":")) continue // comentário / keep-alive
    if (!line.startsWith("data:")) continue
    const payload = line.slice(5).trim()
    if (payload === "" || payload === "[DONE]") continue
    let frame: unknown
    try {
      frame = JSON.parse(payload)
    } catch {
      continue // frame parcial; ignora
    }
    frames.push(frame)

    const f = frame as {
      choices?: Array<{
        delta?: { content?: string }
        message?: { content?: string }
        finish_reason?: string
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
      error?: { message?: string; metadata?: { error_type?: string } }
    }

    if (f.usage) usage = f.usage
    if (f.error) {
      lastErrorMsg = f.error.message ?? ""
      throw new OpenRouterMidStreamError({
        errorType: f.error.metadata?.error_type ?? "midstream_error",
        status: ctx.status,
        ms: ctx.ms,
        snippet: lastErrorMsg.slice(0, 200),
      })
    }
    const errChoice = f.choices?.find((c) => c.finish_reason === "error")
    if (errChoice) {
      throw new OpenRouterMidStreamError({
        errorType: "midstream_error",
        status: ctx.status,
        ms: ctx.ms,
        snippet: (errChoice.message?.content ?? "").slice(0, 200),
      })
    }
  }

  // Não houve erro mas também não houve frame com conteúdo → trata como
  // mid-stream vazio (transitório).
  if (frames.length === 0) {
    throw new OpenRouterMidStreamError({
      errorType: "midstream_error",
      status: ctx.status,
      ms: ctx.ms,
      snippet: "SSE body without data frames",
    })
  }

  // Concatena content de delta (streaming) e/ou message (resposta final).
  const parts: string[] = []
  for (const frame of frames) {
    const f = frame as {
      choices?: Array<{
        delta?: { content?: string }
        message?: { content?: string }
      }>
    }
    for (const c of f.choices ?? []) {
      if (typeof c.delta?.content === "string") parts.push(c.delta.content)
      else if (typeof c.message?.content === "string") parts.push(c.message.content)
    }
  }
  const text = parts.join("").trim()
  if (text === "") {
    throw new OpenRouterMidStreamError({
      errorType: "midstream_error",
      status: ctx.status,
      ms: ctx.ms,
      snippet: "SSE body without textual content",
    })
  }
  return {
    text,
    tokensInput: usage?.prompt_tokens ?? 0,
    tokensOutput: usage?.completion_tokens ?? 0,
    costUsd: usage?.cost ?? 0,
  }
}

// ── Retry com backoff ──────────────────────────────────────────────────

export interface RetryOptions {
  /** Default: 1 retry (2 tentativas no total). */
  retries?: number
  /** Backoff `baseDelayMs * 2^attempt`. Default 1000ms. */
  baseDelayMs?: number
  /** Hook pra logar cada falha que vai virar retry. */
  onRetry?: (err: unknown, attempt: number) => void
  /** Sleeper injetável (testes). Default usa setTimeout real. */
  sleep?: (ms: number) => Promise<void>
}

/**
 * Re-executa `attempt(n)` em falha transitória (err.retryable === true).
 * Não re-tenta `"timeout"` cheio do AbortController nem erros sem flag.
 */
export async function withOpenRouterRetry<T>(
  attempt: (n: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 1
  const baseDelayMs = opts.baseDelayMs ?? 1000
  const sleep = opts.sleep ?? defaultSleep
  let lastErr: unknown
  for (let n = 0; n <= retries; n++) {
    try {
      return await attempt(n)
    } catch (err) {
      lastErr = err
      const retryable = (err as { retryable?: boolean }).retryable === true
      if (!retryable || n === retries) throw err
      opts.onRetry?.(err, n)
      await sleep(baseDelayMs * 2 ** n)
    }
  }
  throw lastErr
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Invocador ──────────────────────────────────────────────────────────

export interface OpenRouterInvokeInput {
  model: string
  systemPrompt: string
  userMessage: string
  maxTokens: number
  /** Omitido da request quando undefined (modelos que não aceitam sampling). */
  temperature?: number
  timeoutMs?: number
  /** Vai no header X-Title — APENAS ASCII (header é ByteString/Latin1). */
  title?: string
  /**
   * Controle de raciocínio (parâmetro unificado do OpenRouter). Modelos
   * reasoning (GLM) "pensam" minutos antes de emitir — steps mecânicos
   * (output JSON pequeno) passam {enabled:false} pra cortar a latência.
   * Omitido → default do modelo. Modelos sem suporte ignoram.
   */
  reasoning?: { enabled?: boolean; effort?: "low" | "medium" | "high" }
  /**
   * Imagens ANEXADAS à mensagem do usuário (story CM-8). Com a lista
   * não-vazia o `content` vira array multimodal — mesmo formato que o
   * `qa-vision.chain` já usa em produção. Quem busca a URL é o provider; o
   * modelo recebe a imagem resolvida, não um link para navegar. Exige
   * modelo com visão: sem isso o provider erra ou ignora o anexo.
   *
   * Vazio/ausente → o corpo da request é byte a byte o de sempre.
   */
  images?: string[]
}

/** Bloco de conteúdo multimodal aceito pelo OpenRouter. */
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

/**
 * Conteúdo da mensagem do usuário: string quando não há anexo (formato
 * histórico, preservado de propósito), array quando há.
 *
 * As imagens vêm ANTES do texto porque o texto se refere a elas ("o exemplo
 * anexado") — a ordem inversa faria a referência apontar para o vazio.
 */
export function userContent(
  userMessage: string,
  images?: string[],
): string | ContentPart[] {
  const urls = (images ?? []).filter((u) => u && u.trim())
  if (urls.length === 0) return userMessage
  return [
    ...urls.map((url) => ({
      type: "image_url" as const,
      image_url: { url },
    })),
    { type: "text" as const, text: userMessage },
  ]
}

export interface OpenRouterInvokeResult {
  text: string
  tokensInput: number
  tokensOutput: number
  /** Custo real em USD do OpenRouter (`usage.cost`); 0 quando ausente. */
  costUsd: number
}

export async function invokeOpenRouter(
  input: OpenRouterInvokeInput,
): Promise<OpenRouterInvokeResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY nao configurada")

  return withOpenRouterRetry(
    (attempt) => callOnce(input, apiKey, attempt),
    {
      onRetry: (err, n) =>
        log.warn("openrouter.retry", {
          model: input.model,
          attempt: n,
          errorName: (err as Error)?.name,
          errorType: (err as { errorType?: string })?.errorType,
          message: (err as Error)?.message,
        }),
    },
  )
}

async function callOnce(
  input: OpenRouterInvokeInput,
  apiKey: string,
  attempt: number,
): Promise<OpenRouterInvokeResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), input.timeoutMs ?? 120_000)
  const t0 = Date.now()
  try {
    const body: Record<string, unknown> = {
      model: input.model,
      max_tokens: input.maxTokens,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: userContent(input.userMessage, input.images) },
      ],
    }
    if (input.temperature != null) body.temperature = input.temperature
    if (input.reasoning) body.reasoning = input.reasoning

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://admin.convertfy.com.br",
        "X-Title": input.title ?? "Convertfy Admin",
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "")
      // Sem crédito → alerta CTO (deduplicado). Fire-and-forget, não bloqueia.
      if (resp.status === 402 || isInsufficientCreditsMessage(errBody)) {
        void import("./generation-notify.service")
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
        snippet: errBody.slice(0, 300),
      })
    }

    const rawText = await resp.text()
    const ms = Date.now() - t0
    const parsed = parseOpenRouterBody(rawText, { status: resp.status, ms })
    log.info("openrouter.ok", {
      model: input.model,
      attempt,
      ms,
      tokensIn: parsed.tokensInput,
      tokensOut: parsed.tokensOutput,
    })
    return parsed
  } catch (e) {
    if (ctrl.signal.aborted || (e as Error)?.name === "AbortError") {
      throw new Error("timeout")
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}
