/**
 * Invocação compartilhada via OpenRouter (OpenAI-compatible chat/completions).
 *
 * Usado pelos agentes que rodam com SDK Anthropic direto (html.chain, qa.chain)
 * para rotear pelo OpenRouter quando o model id está no formato "vendor/model"
 * (ex.: "anthropic/claude-sonnet-4.6"). Centraliza headers + parsing pra não
 * duplicar a lógica (e pra não repetir o bug do travessão no header X-Title).
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
}

export interface OpenRouterInvokeResult {
  text: string
  tokensInput: number
  tokensOutput: number
}

export async function invokeOpenRouter(
  input: OpenRouterInvokeInput,
): Promise<OpenRouterInvokeResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY nao configurada")

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), input.timeoutMs ?? 120_000)
  const t0 = Date.now()
  try {
    const body: Record<string, unknown> = {
      model: input.model,
      max_tokens: input.maxTokens,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userMessage },
      ],
    }
    if (input.temperature != null) body.temperature = input.temperature

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
      throw new Error(`OpenRouter HTTP ${resp.status}: ${errBody.slice(0, 300)}`)
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const text = (data.choices?.[0]?.message?.content ?? "").trim()
    log.info("openrouter.ok", {
      model: input.model,
      ms: Date.now() - t0,
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
    })
    return {
      text,
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
