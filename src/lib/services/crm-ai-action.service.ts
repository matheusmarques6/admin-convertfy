/**
 * AI Action service — executa um AI Action versionado (Anthropic API).
 *
 * Cada AI Action tem:
 * - system_prompt + user_prompt_template (com {{var}} placeholders)
 * - output_schema (JSON Schema simples) que valida o output
 * - model + max_tokens + temperature
 *
 * Executor:
 * 1. Renderiza prompts com input_vars
 * 2. Chama Anthropic Messages API
 * 3. Parse JSON do output
 * 4. Valida vs output_schema
 * 5. Persiste em crm_ai_action_runs (audit + telemetria)
 *
 * Nao usa @anthropic-ai/sdk (nao instalado) — usa fetch direto.
 *
 * Docs: https://docs.anthropic.com/en/api/messages
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("CrmAiAction")

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"

interface RunAiActionParams {
  ai_action_id: string
  input_vars: Record<string, unknown>
  automation_run_id?: string
}

export interface AiActionRunResult {
  run_id: string
  status: "completed" | "failed" | "invalid_output"
  parsed_output: Record<string, unknown> | null
  raw_output: string | null
  error_message: string | null
  tokens_input: number
  tokens_output: number
  cost_cents: number
  duration_ms: number
}

function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
    const key = expr.trim()
    const value = vars[key]
    return value == null ? "" : String(value)
  })
}

/**
 * Validador simples de JSON Schema. Suporta:
 * - type: object/string/number/boolean/array
 * - required: string[]
 * - properties: { [key]: { type, enum?, minimum?, maximum? } }
 *
 * Retorna { valid, errors }.
 */
function validateOutput(
  output: unknown,
  schema: Record<string, unknown>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!schema || Object.keys(schema).length === 0) return { valid: true, errors }

  const expectedType = schema.type as string | undefined
  if (expectedType === "object") {
    if (!output || typeof output !== "object" || Array.isArray(output)) {
      errors.push("Output nao e object")
      return { valid: false, errors }
    }
    const obj = output as Record<string, unknown>
    const required = (schema.required as string[]) || []
    for (const key of required) {
      if (!(key in obj)) errors.push(`Campo obrigatorio ausente: ${key}`)
    }
    const properties = (schema.properties as Record<string, Record<string, unknown>>) || {}
    for (const [key, propSchema] of Object.entries(properties)) {
      if (!(key in obj)) continue
      const v = obj[key]
      const t = propSchema.type as string | undefined
      if (t === "string" && typeof v !== "string") errors.push(`${key} deve ser string`)
      else if (t === "number" && typeof v !== "number") errors.push(`${key} deve ser number`)
      else if (t === "boolean" && typeof v !== "boolean") errors.push(`${key} deve ser boolean`)
      else if (t === "array" && !Array.isArray(v)) errors.push(`${key} deve ser array`)
      if (propSchema.enum && Array.isArray(propSchema.enum) && !propSchema.enum.includes(v as never)) {
        errors.push(`${key} fora do enum permitido`)
      }
      if (typeof v === "number") {
        if (typeof propSchema.minimum === "number" && v < (propSchema.minimum as number))
          errors.push(`${key} abaixo do minimum`)
        if (typeof propSchema.maximum === "number" && v > (propSchema.maximum as number))
          errors.push(`${key} acima do maximum`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Calcula custo em centavos (USD * 100) baseado nos pricing publicos.
 * Atualiza conforme novos modelos.
 */
function computeCostCents(model: string, inputTokens: number, outputTokens: number): number {
  // Pricing per million tokens (Jan 2026):
  const pricing: Record<string, { input: number; output: number }> = {
    "claude-opus-4-7": { input: 15.0, output: 75.0 },
    "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
    "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  }
  const p = pricing[model] || { input: 1.0, output: 5.0 }
  const usd = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
  return Math.round(usd * 100)
}

export async function runAiAction(params: RunAiActionParams): Promise<AiActionRunResult> {
  const admin = createAdminClient()
  const t0 = Date.now()

  // Le AI Action
  const { data: action } = await admin
    .from("crm_ai_actions")
    .select("id, name, model, max_tokens, temperature, system_prompt, user_prompt_template, output_schema, is_active")
    .eq("id", params.ai_action_id)
    .single()

  if (!action || !action.is_active) {
    return makeFailedResult("", t0, "AI Action inativa ou nao encontrada", "")
  }

  const renderedPrompt = renderTemplate(action.user_prompt_template, params.input_vars)
  const systemPrompt = renderTemplate(action.system_prompt, params.input_vars)

  // Cria run pendente
  const { data: run } = await admin
    .from("crm_ai_action_runs")
    .insert({
      ai_action_id: action.id,
      automation_run_id: params.automation_run_id || null,
      input_vars: params.input_vars,
      rendered_prompt: renderedPrompt,
      status: "pending",
    })
    .select("id")
    .single()

  if (!run) return makeFailedResult("", t0, "Falha ao criar run", renderedPrompt)
  const runId = run.id

  // Chama Anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    await markRunFailed(admin, runId, "ANTHROPIC_API_KEY nao configurada", t0)
    return makeFailedResult(runId, t0, "ANTHROPIC_API_KEY nao configurada", renderedPrompt)
  }

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: action.model,
        max_tokens: action.max_tokens,
        temperature: action.temperature,
        system: systemPrompt,
        messages: [{ role: "user", content: renderedPrompt }],
      }),
    })

    const data = await res.json()
    if (!res.ok || data.error) {
      const msg = data.error?.message || `HTTP ${res.status}`
      await markRunFailed(admin, runId, msg, t0)
      return makeFailedResult(runId, t0, msg, renderedPrompt)
    }

    const rawOutput = (data.content || []).map((c: { text?: string }) => c.text || "").join("")
    const inputTokens = data.usage?.input_tokens || 0
    const outputTokens = data.usage?.output_tokens || 0
    const costCents = computeCostCents(action.model, inputTokens, outputTokens)

    // Tenta parsear JSON
    let parsed: Record<string, unknown> | null = null
    let parseError: string | null = null
    try {
      // Aceita JSON puro ou JSON dentro de ```json
      const cleaned = rawOutput
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim()
      parsed = JSON.parse(cleaned)
    } catch (e) {
      parseError = `JSON parse error: ${e instanceof Error ? e.message : "unknown"}`
    }

    const schema = (action.output_schema as Record<string, unknown>) || {}
    const validation = parsed ? validateOutput(parsed, schema) : { valid: false, errors: ["No JSON"] }

    const status = !parsed
      ? "invalid_output"
      : !validation.valid
        ? "invalid_output"
        : "completed"

    await admin
      .from("crm_ai_action_runs")
      .update({
        raw_output: rawOutput,
        parsed_output: parsed,
        status,
        error_message: parseError || (validation.errors.length > 0 ? validation.errors.join("; ") : null),
        tokens_input: inputTokens,
        tokens_output: outputTokens,
        cost_cents: costCents,
        duration_ms: Date.now() - t0,
      })
      .eq("id", runId)

    return {
      run_id: runId,
      status,
      parsed_output: parsed,
      raw_output: rawOutput,
      error_message: parseError || (validation.errors.length > 0 ? validation.errors.join("; ") : null),
      tokens_input: inputTokens,
      tokens_output: outputTokens,
      cost_cents: costCents,
      duration_ms: Date.now() - t0,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error"
    log.error("[AI] runAiAction error", err)
    await markRunFailed(admin, runId, msg, t0)
    return makeFailedResult(runId, t0, msg, renderedPrompt)
  }
}

async function markRunFailed(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  errorMessage: string,
  t0: number,
): Promise<void> {
  await admin
    .from("crm_ai_action_runs")
    .update({
      status: "failed",
      error_message: errorMessage,
      duration_ms: Date.now() - t0,
    })
    .eq("id", runId)
}

function makeFailedResult(
  runId: string,
  t0: number,
  errorMessage: string,
  _renderedPrompt: string,
): AiActionRunResult {
  return {
    run_id: runId,
    status: "failed",
    parsed_output: null,
    raw_output: null,
    error_message: errorMessage,
    tokens_input: 0,
    tokens_output: 0,
    cost_cents: 0,
    duration_ms: Date.now() - t0,
  }
}
