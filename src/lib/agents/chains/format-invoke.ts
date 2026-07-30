/**
 * Invocação de modelo compartilhada pela cadeia de formatação
 * (hero_section / text_format / image_format / color_format).
 *
 * Mesmo roteamento dos chains antigos: model com "/" → OpenRouter (custo
 * real em usage.cost); sem "/" → SDK Anthropic direto (custo estimado por
 * token na telemetria). Cada chain define timeout/título próprios.
 */

import Anthropic from "@anthropic-ai/sdk"

import {
  invokeOpenRouter,
  isOpenRouterModel,
  isInsufficientCreditsMessage,
} from "../openrouter-invoke"

export interface FormatChainConfig {
  model: string
  temperature: number
  max_tokens: number
  system_prompt: string
  user_template: string
}

export interface FormatModelResult {
  text: string
  tokensInput: number
  tokensOutput: number
  /** Custo real em USD do OpenRouter (`usage.cost`); 0 no caminho Anthropic. */
  costUsd: number
}

export async function invokeFormatModel(params: {
  model: string
  systemPrompt: string
  userMessage: string
  maxTokens: number
  temperature: number
  timeoutMs: number
  title: string
  /** Controle de raciocínio (OpenRouter) — ver openrouter-invoke. */
  reasoning?: { enabled?: boolean; effort?: "low" | "medium" | "high" }
  /**
   * Imagens anexadas à mensagem (story CM-8). Só o caminho OpenRouter
   * suporta — ver a recusa explícita abaixo.
   */
  images?: string[]
}): Promise<FormatModelResult> {
  const {
    model,
    systemPrompt,
    userMessage,
    maxTokens,
    temperature,
    timeoutMs,
    title,
    reasoning,
    images,
  } = params

  if (isOpenRouterModel(model)) {
    const or = await invokeOpenRouter({
      model,
      systemPrompt,
      userMessage,
      maxTokens,
      temperature,
      timeoutMs,
      title,
      reasoning,
      images,
    })
    return {
      text: or.text,
      tokensInput: or.tokensInput,
      tokensOutput: or.tokensOutput,
      costUsd: or.costUsd,
    }
  }

  // Caminho Anthropic direto: recusa EXPLÍCITA em vez de descartar o anexo
  // em silêncio. Anexar imagem aqui exigiria baixar e converter para base64
  // (o SDK só aceita `source.data`), e a URL do exemplo pode ser signed —
  // download no meio da geração é latência e ponto de falha novos. Quem
  // precisa de visão declara um modelo do OpenRouter (ver HERO_VISION_MODEL).
  if (images && images.length > 0) {
    throw new Error(
      `modelo '${model}' e Anthropic-direto e nao aceita imagem anexada; declare um modelo do OpenRouter para o fallback visual`,
    )
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nao configurada")
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: timeoutMs })
  let resp: Anthropic.Message
  try {
    resp = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    })
  } catch (err) {
    // Sem crédito na Anthropic → alerta CTO (deduplicado), igual ao
    // caminho OpenRouter. Antes o 400 "credit balance is too low" morria
    // silencioso no fallback do step (caso do merge_verifier, 28/07).
    const msg = err instanceof Error ? err.message : String(err)
    if (isInsufficientCreditsMessage(msg)) {
      void import("../generation-notify.service")
        .then((m) =>
          m.notifyCreditsExhausted({
            provider: "Anthropic",
            detail: msg.slice(0, 200),
          }),
        )
        .catch(() => {})
    }
    throw err
  }
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
  return {
    text,
    tokensInput: resp.usage.input_tokens,
    tokensOutput: resp.usage.output_tokens,
    costUsd: 0, // Anthropic-direto: sem accounting do OpenRouter.
  }
}
