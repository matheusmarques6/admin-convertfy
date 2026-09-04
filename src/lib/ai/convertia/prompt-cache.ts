/**
 * Cache de prompt da ConvertIA — módulo PURO (sem I/O), testado.
 *
 * O Anthropic cacheia o PREFIXO do request até cada `cache_control`
 * (ordem interna: tools → system → messages). Dois marcadores bastam:
 *
 *   1. no ÚLTIMO bloco do system — cobre tools + system inteiro. É o
 *      pedaço que não muda entre rodadas do mesmo turno nem entre
 *      turnos da mesma conversa (dossiê da loja, guidance, skills);
 *   2. no ÚLTIMO turno do usuário com texto — cobre o histórico. Nas
 *      rodadas seguintes do loop de tools (assistant/tool anexados
 *      DEPOIS dele) o prefixo até ali vem do cache; no turno seguinte
 *      o marcador anda pra frente e o cache anterior serve de base
 *      (a API procura o maior prefixo já cacheado).
 *
 * O system pode vir em DOIS blocos: o estável (marcado) e o dinâmico
 * (data de hoje, "o que já foi consultado", modo profundo) — o segundo
 * fica FORA do marcador de propósito, senão qualquer mudança nele
 * invalidaria o cache de tudo que vem antes.
 *
 * Só para `anthropic/*` (mesma régua do llm-invoke dos agentes): outros
 * provedores ignoram o campo e alguns rejeitam content em array no
 * system. Prefixo abaixo do mínimo do modelo (1024–4096 tokens) é
 * ignorado silenciosamente pela API — marcar é sempre seguro.
 */

import type { ChatContentPart, ChatMessage, ChatTextPart } from "@/lib/ai/openrouter-chat"

const EPHEMERAL = { type: "ephemeral" as const }

export function supportsPromptCache(model: string): boolean {
  return /^anthropic\//i.test(model)
}

function textParts(content: string | ChatTextPart[]): ChatTextPart[] {
  if (typeof content === "string") return [{ type: "text", text: content }]
  return content.map((p) => ({ type: "text", text: p.text }))
}

/**
 * Devolve uma CÓPIA das mensagens com os marcadores de cache. Nunca
 * muta o array original (o loop reusa o mesmo array entre rodadas).
 * Em modelo sem suporte devolve o array como está.
 */
export function applyPromptCache(model: string, messages: ChatMessage[]): ChatMessage[] {
  if (!supportsPromptCache(model)) return messages
  const out: ChatMessage[] = messages.map((m) => ({ ...m }))

  // 1) system: último bloco marcado
  const sysIdx = out.findIndex((m) => m.role === "system")
  if (sysIdx >= 0) {
    const sys = out[sysIdx] as Extract<ChatMessage, { role: "system" }>
    const parts = textParts(sys.content).filter((p) => p.text.trim().length > 0)
    if (parts.length > 0) {
      parts[parts.length - 1] = { ...parts[parts.length - 1], cache_control: EPHEMERAL }
      out[sysIdx] = { role: "system", content: parts }
    }
  }

  // 2) último turno do usuário com texto
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i]
    if (m.role !== "user") continue
    if (typeof m.content === "string") {
      if (!m.content.trim()) continue
      out[i] = {
        role: "user",
        content: [{ type: "text", text: m.content, cache_control: EPHEMERAL }],
      }
      break
    }
    const parts: ChatContentPart[] = m.content.map((p) => ({ ...p }))
    let lastText = -1
    for (let j = parts.length - 1; j >= 0; j--) {
      if (parts[j].type === "text") {
        lastText = j
        break
      }
    }
    if (lastText < 0) continue
    parts[lastText] = { ...(parts[lastText] as ChatTextPart), cache_control: EPHEMERAL }
    out[i] = { role: "user", content: parts }
    break
  }

  return out
}

export interface CacheUsage {
  promptTokens: number | null
  completionTokens: number | null
  cost: number | null
  cachedTokens: number
  cacheWriteTokens: number
}

/**
 * Lê o `usage` do frame final do OpenRouter. O campo de cache muda de
 * nome conforme o provedor/normalização:
 *   - `prompt_tokens_details.cached_tokens` (OpenAI-compatible, é o
 *     que o OpenRouter normaliza para Anthropic também);
 *   - `cache_read_input_tokens` / `cache_creation_input_tokens`
 *     (formato Anthropic cru, quando o provedor devolve sem normalizar);
 *   - `prompt_tokens_details.cache_write_tokens` (OpenRouter, quando
 *     expõe a gravação).
 * Nunca lança: telemetria é conforto, não contrato.
 */
export function parseCacheUsage(usage: Record<string, unknown> | null | undefined): CacheUsage {
  const u = usage ?? {}
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null
  const details = (u.prompt_tokens_details ?? {}) as Record<string, unknown>
  const cached =
    num(details.cached_tokens) ?? num(u.cache_read_input_tokens) ?? 0
  const write =
    num(details.cache_write_tokens) ??
    num(details.cache_creation_tokens) ??
    num(u.cache_creation_input_tokens) ??
    0
  return {
    promptTokens: num(u.prompt_tokens),
    completionTokens: num(u.completion_tokens),
    cost: num(u.cost),
    cachedTokens: cached,
    cacheWriteTokens: write,
  }
}
