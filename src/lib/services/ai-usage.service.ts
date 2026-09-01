/**
 * AI Usage Observability — registro central de TODO uso de IA que não
 * passa pelas tabelas de telemetria existentes (email_generation_runs,
 * campaign_ai_runs, crm_ai_action_runs).
 *
 * Call-sites instrumentados gravam em `ai_usage_events` via
 * recordAiUsage() (fire-and-forget: telemetria NUNCA derruba a feature).
 *
 * O dashboard /admin/ai-usage lê a view `ai_usage_unified`, que une as
 * 4 fontes num formato canônico.
 */

// Importa de `admin` (nao `server`): server.ts puxa next/headers, que
// quebra o build quando esta cadeia chega numa pagina fora do app router
// (ai.service.ts e' re-exportado por services/index.ts).
import { createAdminClient } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"

const log = logger.child("AiUsage")

/** Features rastreadas em ai_usage_events (call-sites fora dos pipelines). */
export type AiUsageFeature =
  | "ai_chat"
  | "ritual_chat"
  | "ritual_process"
  | "capture_brand"
  | "process_briefing"
  | "regenerate_objections"
  | "acompanhamento_message"
  | "dashboard_insights"
  | "ai_generate_subjects"
  | "ai_generate_ad_copy"
  | "briefing_generation"
  | "convertia"

export type AiProvider = "anthropic" | "openrouter" | "openai"

/**
 * Pricing por milhão de tokens (USD). Tabela ÚNICA do projeto — superset
 * das tabelas locais de anthropic-client.ts e crm-ai-action.service.ts.
 * Modelos ausentes caem no default (sonnet pricing).
 */
const PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-opus-4-8": { input: 15.0, output: 75.0 },
  "anthropic/claude-opus-4.8": { input: 15.0, output: 75.0 },
  "anthropic/claude-sonnet-4.6": { input: 3.0, output: 15.0 },
  // Moonshot (ConvertIA)
  "moonshotai/kimi-k3": { input: 0.6, output: 2.5 },
  // Google (ConvertIA)
  "google/gemini-2.5-pro": { input: 1.25, output: 10.0 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "claude-haiku-3-5": { input: 0.8, output: 4.0 },
  // OpenAI (direto ou via OpenRouter)
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-5-1": { input: 1.25, output: 10.0 },
  "gpt-5-4": { input: 3.75, output: 30.0 },
  "openai/gpt-5.1": { input: 1.25, output: 10.0 },
  "openai/gpt-5.3-chat": { input: 2.5, output: 20.0 },
  "openai/gpt-5.4": { input: 3.75, output: 30.0 },
  "openai/gpt-5.4-image-2": { input: 5.0, output: 40.0 },
  // Google
  // Nano Banana 2 (google/gemini-3.1-flash-image) — modelo de imagem
  // padrão desde jul/2026. Preço de referência do tier Flash Image; o
  // custo REAL do OpenRouter (usage.cost) tem precedência quando vem.
  "gemini-3-1-flash-image": { input: 0.3, output: 30.0 },
  "google/gemini-3.1-flash-image": { input: 0.3, output: 30.0 },
  "gemini-3-5-flash": { input: 0.075, output: 0.3 },
  "google/gemini-3.5-flash": { input: 0.075, output: 0.3 },
}

const DEFAULT_PRICING = { input: 3.0, output: 15.0 }

/** Custo em centavos de USD (frações preservadas — NUMERIC no DB). */
export function computeAiCostCents(
  model: string | null | undefined,
  tokensInput: number,
  tokensOutput: number,
): number {
  const p = (model && PRICING[model]) || DEFAULT_PRICING
  const usd =
    (tokensInput / 1_000_000) * p.input + (tokensOutput / 1_000_000) * p.output
  return Math.round(usd * 100 * 10000) / 10000
}

export interface RecordAiUsageParams {
  feature: AiUsageFeature
  model: string | null
  provider: AiProvider
  status?: "success" | "error"
  tokensInput?: number
  tokensOutput?: number
  durationMs?: number
  userId?: string | null
  orgId?: string | null
  storeId?: string | null
  context?: Record<string, unknown> | null
  errorMessage?: string | null
}

/**
 * Grava um evento de uso de IA. Fire-and-forget: erros são logados e
 * engolidos — telemetria nunca pode quebrar a feature que a chama.
 */
export async function recordAiUsage(params: RecordAiUsageParams): Promise<void> {
  try {
    const admin = createAdminClient()
    const tokensInput = params.tokensInput ?? 0
    const tokensOutput = params.tokensOutput ?? 0
    const { error } = await admin.from("ai_usage_events").insert({
      feature: params.feature,
      model: params.model,
      provider: params.provider,
      status: params.status ?? "success",
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      cost_cents: computeAiCostCents(params.model, tokensInput, tokensOutput),
      duration_ms: params.durationMs ?? 0,
      user_id: params.userId ?? null,
      org_id: params.orgId ?? null,
      store_id: params.storeId ?? null,
      context: params.context ?? null,
      error_message: params.errorMessage ?? null,
    })
    if (error) {
      log.warn("ai_usage.insert_failed", { feature: params.feature, error: error.message })
    }
  } catch (err) {
    log.warn("ai_usage.record_failed", {
      feature: params.feature,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
