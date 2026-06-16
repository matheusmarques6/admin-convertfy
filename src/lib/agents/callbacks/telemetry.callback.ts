/**
 * Telemetry callback — persiste cada step da geração no banco.
 *
 * Tabela: `email_generation_runs`
 * Colunas: store_id, flow_id, email_id, triggered_by, batch_id,
 *          agent, agent_config_id, status, model, input_vars,
 *          rendered_prompt, raw_output, parsed_output,
 *          tokens_input, tokens_output, cost_cents, duration_ms,
 *          error_message, error_stack
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { GenerationRunAgent, GenerationRunStatus } from "@/types/email-generation"

const log = logger.child("GenTelemetry")

export interface LogGenerationRunParams {
  storeId: string
  flowId?: string
  emailId?: string
  triggeredBy?: string
  batchId: string
  agent: GenerationRunAgent
  agentConfigId?: string
  status: GenerationRunStatus
  model?: string
  inputVars?: Record<string, unknown>
  renderedPrompt?: string
  rawOutput?: string
  parsedOutput?: Record<string, unknown>
  tokensInput?: number
  tokensOutput?: number
  costCents?: number
  durationMs?: number
  errorMessage?: string
  errorStack?: string
}

/**
 * Calcula custo em centavos (USD * 100) baseado nos pricing publicos.
 */
export function computeCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const pricing: Record<string, { input: number; output: number }> = {
    "claude-opus-4-8": { input: 15.0, output: 75.0 },
    "anthropic/claude-opus-4.8": { input: 15.0, output: 75.0 },
    "claude-opus-4-7": { input: 15.0, output: 75.0 },
    "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
    "claude-sonnet-4-5-20250514": { input: 3.0, output: 15.0 },
    "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
    // GPT-5.4 (Montador via OpenRouter). Reasoning model: tokens_output já
    // inclui os "thinking tokens" reportados pelo OpenRouter, então
    // tokens_output * output cobre o custo de reasoning. Preço base de tabela
    // (input <272K). Se a fatura real divergir, alinhar aqui.
    "openai/gpt-5.4": { input: 2.5, output: 15.0 },
  }
  const p = pricing[model] || { input: 3.0, output: 15.0 }
  const usd = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
  return Math.round(usd * 100)
}

/**
 * Persiste um run de geração no banco. Retorna o run_id.
 */
export async function logGenerationRun(params: LogGenerationRunParams): Promise<string> {
  const admin = createAdminClient()

  const insert = {
    store_id: params.storeId,
    flow_id: params.flowId ?? null,
    email_id: params.emailId ?? null,
    triggered_by: params.triggeredBy ?? null,
    batch_id: params.batchId,
    agent: params.agent,
    agent_config_id: params.agentConfigId ?? null,
    status: params.status,
    model: params.model ?? null,
    input_vars: params.inputVars ?? null,
    rendered_prompt: params.renderedPrompt ?? null,
    raw_output: params.rawOutput ?? null,
    parsed_output: params.parsedOutput ?? null,
    tokens_input: params.tokensInput ?? 0,
    tokens_output: params.tokensOutput ?? 0,
    cost_cents: params.costCents ?? 0,
    duration_ms: params.durationMs ?? 0,
    error_message: params.errorMessage ?? null,
    error_stack: params.errorStack ?? null,
    retry_count: 0,
  }

  const { data, error } = await admin
    .from("email_generation_runs")
    .insert(insert)
    .select("id")
    .single()

  if (error) {
    log.error("telemetry.insert_failed", {
      agent: params.agent,
      emailId: params.emailId,
      error: error.message,
    })
    // Não lance erro — telemetria não deve bloquear a geração
    return ""
  }

  return (data?.id as string) ?? ""
}

/**
 * Atualiza um run existente (ex: muda status de running pra success/error).
 */
export async function updateGenerationRun(
  runId: string,
  update: Partial<LogGenerationRunParams> & { status: GenerationRunStatus },
): Promise<void> {
  if (!runId) return

  const admin = createAdminClient()
  const { error } = await admin
    .from("email_generation_runs")
    .update({
      status: update.status,
      raw_output: update.rawOutput ?? undefined,
      parsed_output: update.parsedOutput ?? undefined,
      tokens_input: update.tokensInput ?? undefined,
      tokens_output: update.tokensOutput ?? undefined,
      cost_cents: update.costCents ?? undefined,
      duration_ms: update.durationMs ?? undefined,
      error_message: update.errorMessage ?? undefined,
      error_stack: update.errorStack ?? undefined,
    })
    .eq("id", runId)

  if (error) {
    log.error("telemetry.update_failed", { runId, error: error.message })
  }
}
