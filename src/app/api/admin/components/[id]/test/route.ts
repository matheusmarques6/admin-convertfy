/**
 * Teste ad-hoc de uma variante da biblioteca (aba Componentes → "Testar com IA").
 *
 * POST: gera os campos do output_schema da variante a partir de um briefing
 * curto (+ contexto opcional de uma loja real), via agente `component_test`.
 * Não toca em emails reais. Com store_id, o run é registrado em
 * email_generation_runs (agent='component_test') para aparecer nos logs.
 */
import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  NotFoundError,
  ValidationError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { logger } from "@/lib/logger"
import type {
  ComponentOutputField,
  EmailComponentVariant,
} from "@/types/email-generation"
import {
  invokeAgent,
  loadActiveAgentConfig,
  extractJson,
  type AgentInvokeConfig,
} from "@/lib/agents/architect/llm-invoke"
import {
  computeCostCents,
  finishGenerationRun,
  startGenerationRun,
} from "@/lib/agents/callbacks/telemetry.callback"
import { COMPONENT_CATEGORIES } from "@/lib/agents/shared/component-categories"

const log = logger.child("ComponentTest")

export const dynamic = "force-dynamic"
export const maxDuration = 120

const bodySchema = z.object({
  briefing: z.string().min(3).max(2000),
  store_id: z.string().uuid().optional(),
})

const DEFAULT_CONFIG: AgentInvokeConfig = {
  model: "claude-sonnet-4-6",
  temperature: 0.7,
  max_tokens: 2048,
  system_prompt: `Você gera a copy de UM bloco de email de e-commerce para teste rápido de uma variante da biblioteca de componentes.

Regras:
- Gere EXATAMENTE um valor para cada campo do schema (use a key como chave).
- Respeite max_len de cada campo. Campos required nunca vazios.
- Siga a guidance de cada campo e as orientações de copy da variante.
- Escreva em português do Brasil, alinhado ao briefing.

Responda APENAS um objeto JSON {"key":"valor", ...}, sem markdown nem texto ao redor.`,
  user_template: `<variante>
- nome: {{variant_name}}
- seção: {{section}}
- quando usar: {{when_use}}
- orientações de copy: {{copy_guidance}}
</variante>

<schema>
{{output_schema_json}}
</schema>

<loja>
{{store_context}}
</loja>

<briefing_de_teste>
{{briefing}}
</briefing_de_teste>

Gere agora o JSON campo→valor para o schema acima.`,
}

/** Valida o JSON do LLM contra o output_schema; corta em max_len. */
function normalizeFields(
  raw: Record<string, unknown>,
  schema: ComponentOutputField[],
): { fields: Record<string, string>; missingRequired: string[] } {
  const fields: Record<string, string> = {}
  const missingRequired: string[] = []
  for (const f of schema) {
    let v = raw[f.key]
    if (v == null) v = ""
    let s = typeof v === "string" ? v : String(v)
    if (f.max_len > 0 && s.length > f.max_len) s = s.slice(0, f.max_len)
    if (f.required && !s.trim()) missingRequired.push(f.key)
    fields[f.key] = s
  }
  return { fields, missingRequired }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const parsed = bodySchema.parse(await request.json())

    const { data: variantRow, error: variantErr } = await admin
      .from("email_component_variants")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (variantErr) throw variantErr
    if (!variantRow) {
      throw new NotFoundError("Variante")
    }
    const variant = variantRow as EmailComponentVariant
    const schema = variant.output_schema ?? []
    if (schema.length === 0) {
      throw new ValidationError(
        "A variante não tem schema de output — adicione campos antes de testar.",
      )
    }

    // Contexto opcional de uma loja real (mesmas colunas do generate.service).
    let storeContext = "(sem loja — use apenas o briefing)"
    if (parsed.store_id) {
      const { data: storeRow } = await admin
        .from("client_stores")
        .select("store_name, niche, tone_description")
        .eq("id", parsed.store_id)
        .maybeSingle()
      if (storeRow) {
        const s = storeRow as Record<string, unknown>
        storeContext = [
          `- marca: ${(s.store_name as string) ?? ""}`,
          `- nicho: ${(s.niche as string) ?? ""}`,
          `- tom de voz: ${(s.tone_description as string) ?? ""}`,
        ].join("\n")
      }
    }

    const cfgRow = await loadActiveAgentConfig("component_test")
    const config: AgentInvokeConfig = cfgRow
      ? {
          model: cfgRow.model,
          temperature: cfgRow.temperature,
          max_tokens: cfgRow.max_tokens,
          system_prompt: cfgRow.system_prompt,
          user_template: cfgRow.user_template,
        }
      : DEFAULT_CONFIG

    const sectionLabel =
      COMPONENT_CATEGORIES.find((c) => c.key === variant.block_type)?.label ??
      variant.block_type

    const vars: Record<string, string> = {
      variant_name: variant.name,
      section: sectionLabel,
      when_use: variant.when_use ?? "",
      copy_guidance: variant.copy_guidance ?? "",
      output_schema_json: JSON.stringify(schema),
      store_context: storeContext,
      briefing: parsed.briefing,
    }

    // Telemetria só quando há loja (store_id é NOT NULL em email_generation_runs).
    let runId = ""
    if (parsed.store_id) {
      runId = await startGenerationRun({
        storeId: parsed.store_id,
        triggeredBy: user.id,
        batchId: "",
        agent: "component_test",
        agentConfigId: cfgRow?.id,
        model: config.model,
        inputVars: { variant_id: id, briefing: parsed.briefing },
      })
    }

    const t0 = Date.now()
    try {
      const res = await invokeAgent(config, vars)
      const durationMs = Date.now() - t0
      const costCents = computeCostCents(
        config.model,
        res.tokensInput,
        res.tokensOutput,
      )

      let rawJson: Record<string, unknown>
      try {
        rawJson = JSON.parse(extractJson(res.raw)) as Record<string, unknown>
      } catch {
        throw new Error("O modelo não devolveu JSON válido — tente de novo.")
      }
      const { fields, missingRequired } = normalizeFields(rawJson, schema)

      if (runId && parsed.store_id) {
        await finishGenerationRun(runId, {
          storeId: parsed.store_id,
          triggeredBy: user.id,
          batchId: "",
          agent: "component_test",
          agentConfigId: cfgRow?.id,
          status: "success",
          model: config.model,
          inputVars: { variant_id: id, briefing: parsed.briefing },
          rawOutput: res.raw.slice(0, 8000),
          parsedOutput: { fields_count: Object.keys(fields).length },
          tokensInput: res.tokensInput,
          tokensOutput: res.tokensOutput,
          costCents,
          durationMs,
        }).catch(() => {})
      }

      return successResponse(request, {
        fields,
        missing_required: missingRequired,
        model: config.model,
        tokens_input: res.tokensInput,
        tokens_output: res.tokensOutput,
        cost_cents: costCents,
        duration_ms: durationMs,
      })
    } catch (err) {
      if (runId && parsed.store_id) {
        await finishGenerationRun(runId, {
          storeId: parsed.store_id,
          triggeredBy: user.id,
          batchId: "",
          agent: "component_test",
          agentConfigId: cfgRow?.id,
          status: "error",
          model: config.model,
          errorMessage: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - t0,
        }).catch(() => {})
      }
      throw err
    }
  } catch (error) {
    log.error("component-test.post", error)
    return errorResponse(request, error, "component-test-post")
  }
}
