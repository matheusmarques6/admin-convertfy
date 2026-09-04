/**
 * Config dos agentes de formatação da fase 2 — quem roda, com qual modelo,
 * e o que fazer quando a aba Agentes desligou o step.
 *
 * Morava privado no `phase2-runner.service.ts`. Saiu quando a tela do e-mail
 * ganhou o botão "Repensar tipografia": a rota precisa resolver a config do
 * MESMO jeito que o runner, e importar o runner inteiro numa rota carregaria
 * meio pipeline. Duplicar os defaults do outro lado seria pior — eles
 * divergiriam na primeira troca de modelo.
 *
 * Fica fora do runner só o que é do runner: teto de tempo por step
 * (`FMT_STEP_TIMEOUT`) e motivo de falha (`FMT_FAILURE_REASON`), que
 * dependem do orçamento da cadeia.
 */

import type { EmailAgentConfig } from "@/types/email-generation"
import type { FormatChainConfig } from "./format-invoke"

export type FormatAgent =
  | "hero_section"
  | "text_format"
  | "image_format"
  | "typography"
  | "color_format"

export const FMT_DEFAULTS: Record<
  FormatAgent,
  { temperature: number; maxTokens: number }
> = {
  hero_section: { temperature: 0.3, maxTokens: 16384 },
  text_format: { temperature: 0.3, maxTokens: 65536 },
  image_format: { temperature: 0.2, maxTokens: 8192 },
  color_format: { temperature: 0.3, maxTokens: 16384 },
  typography: { temperature: 0.2, maxTokens: 8192 },
}

// Kimi K3 via OpenRouter (migration 20261047 — swap do z-ai/glm-5.2).
export const FMT_DEFAULT_MODEL = "moonshotai/kimi-k3"

/**
 * Estado do toggle da aba Agentes para um step da cadeia.
 *
 * `row` é a linha MAIS RECENTE do agent_type (ativa quando existe ativa —
 * o select ordena por is_active desc). Três estados:
 *   - row == null            → nunca configurado → roda com defaults
 *   - row.is_active === true → roda com a config
 *   - row.is_active === false → DESLIGADO de propósito
 */
export function resolveAgentSwitch(row: EmailAgentConfig | null): {
  config: EmailAgentConfig | null
  disabled: boolean
} {
  if (!row) return { config: null, disabled: false }
  const active = (row as unknown as { is_active?: boolean }).is_active === true
  return { config: active ? row : null, disabled: !active }
}

export function toChainConfig(
  config: EmailAgentConfig | null,
  agent: FormatAgent,
): FormatChainConfig {
  return {
    model: config?.model || FMT_DEFAULT_MODEL,
    temperature: config?.temperature ?? FMT_DEFAULTS[agent].temperature,
    max_tokens: config?.max_tokens ?? FMT_DEFAULTS[agent].maxTokens,
    system_prompt: config?.system_prompt ?? "",
    user_template: config?.user_template ?? "",
  }
}
