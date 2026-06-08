/**
 * Blueprint Generator (Epic AE — Component Assembler, passo A).
 *
 * Expande a estrutura geral (outline) no blueprint DETALHADO por
 * (loja × email), adaptado ao nicho/posicionamento/produtos. Persiste em
 * `store_email_blueprints`. Fallback seguro para `DEFAULT_BLUEPRINTS` se o
 * LLM falhar ou retornar JSON inválido — nunca derruba o onboarding.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { EmailOutlineTemplate } from "@/types/email-generation"

import { DEFAULT_BLUEPRINTS } from "../email-blueprint"
import { computeCostCents, logGenerationRun } from "../callbacks/telemetry.callback"
import {
  invokeAgent,
  loadActiveAgentConfig,
  extractJson,
  type AgentInvokeConfig,
} from "./llm-invoke"

const log = logger.child("BlueprintGenerator")

// Os 19 block_types canônicos. Espelha o CHECK de email_blocks /
// email_component_variants e BLOCK_TYPE_OPTIONS (email-blueprints/types.ts).
export const ALLOWED_BLOCK_TYPES = new Set<string>([
  "hero",
  "text",
  "coupon",
  "products",
  "footer",
  "image",
  "cta",
  "divider",
  "spacer",
  "social",
  "header",
  "headline",
  "features",
  "social_proof",
  "testimonials",
  "urgency",
  "comparison",
  "story",
  "letter",
])

const IMAGE_BLOCKS = new Set(["hero", "image"])

export interface GeneratedBlock {
  type: string
  label: string
  purpose: string
  needs_image: boolean
}

export interface GeneratedBlueprint {
  objective: string
  messaging: string
  subject_hint: string | null
  blocks: GeneratedBlock[]
}

const DEFAULT_MODEL = "claude-sonnet-4-6"

// Fallback usado apenas se email_agent_configs não tiver row ativa para
// agent_type='blueprint' (a migration 20260708b semeia a versão canônica).
const DEFAULT_BLUEPRINT_SYSTEM = `Você é o arquiteto de estrutura de emails. Você recebe o HTML JÁ MONTADO de um email (a forma final) e a estrutura geral (outline). Sua tarefa: LER o HTML e extrair o BLUEPRINT DETALHADO — a lista ordenada de blocos que o HTML contém, cada um com tipo técnico, label, propósito e needs_image. A estrutura deve REFLETIR o HTML (mesma ordem e seções); não invente blocos ausentes. Mapeie cada seção do HTML para o tipo técnico mais adequado (ex.: seção de reviews → testimonials; cupom → coupon). hero/image têm needs_image=true. Use SOMENTE os tipos permitidos. Retorne APENAS JSON: {"objective","messaging","subject_hint","blocks":[{"type","label","purpose","needs_image"}]}.`

const DEFAULT_BLUEPRINT_USER = `LOJA: {{brand_name}} — NICHO: {{nicho}} — POSICIONAMENTO: {{posicionamento}}
PERSONA: {{persona}} — TOM DE VOZ: {{tom_voz}}
FLOW: {{flow_type}} — EMAIL #{{email_number}}
OUTLINE: {{outline_objective}} | {{outline_guidance}}
TIPOS PERMITIDOS: {{allowed_block_types}}

HTML MONTADO (extraia a estrutura DELE):
{{reference_html}}

Extraia o blueprint detalhado que reflete este HTML. Responda apenas o JSON.`

// ── Parsing + fallback (puro, testável) ────────────────────────────

function asString(v: unknown): string {
  return typeof v === "string" ? v : ""
}

/** Normaliza um bloco cru do LLM, descartando tipos inválidos. */
function normalizeBlock(raw: unknown): GeneratedBlock | null {
  if (!raw || typeof raw !== "object") return null
  const b = raw as Record<string, unknown>
  const type = typeof b.type === "string" ? b.type.trim() : ""
  if (!ALLOWED_BLOCK_TYPES.has(type)) return null
  return {
    type,
    label: typeof b.label === "string" && b.label.trim() ? b.label : type,
    purpose: asString(b.purpose),
    needs_image: b.needs_image === true || IMAGE_BLOCKS.has(type),
  }
}

/** Extrai e valida o blueprint do output do LLM. Retorna null se inválido. */
export function parseBlueprintOutput(raw: string): GeneratedBlueprint | null {
  try {
    const json = JSON.parse(extractJson(raw)) as Record<string, unknown>
    if (!json || typeof json !== "object") return null
    const blocksRaw = Array.isArray(json.blocks) ? json.blocks : []
    const blocks = blocksRaw
      .map(normalizeBlock)
      .filter((b): b is GeneratedBlock => b !== null)
    if (blocks.length === 0) return null
    return {
      objective: asString(json.objective),
      messaging: asString(json.messaging),
      subject_hint:
        typeof json.subject_hint === "string" ? json.subject_hint : null,
      blocks,
    }
  } catch {
    return null
  }
}

/** Fallback determinístico a partir dos DEFAULT_BLUEPRINTS in-code. */
export function blueprintFromDefault(
  flowType: string,
  emailNumber: number,
): GeneratedBlueprint | null {
  const def = DEFAULT_BLUEPRINTS[flowType]?.[emailNumber]
  if (!def) return null
  return {
    objective: def.objective,
    messaging: def.messaging,
    subject_hint: def.subject_hint ?? null,
    blocks: def.blocks.map((b) => ({
      type: b.type,
      label: b.label,
      purpose: b.purpose,
      needs_image: b.needs_image === true || IMAGE_BLOCKS.has(b.type),
    })),
  }
}

// ── Orquestração (I/O) ─────────────────────────────────────────────

export interface GenerateBlueprintInput {
  storeId: string
  flowType: string
  emailNumber: number
  batchId: string
  triggeredBy?: string
  brandName: string
  nicho: string
  posicionamento: string
  persona: string
  tomVoz: string
  topProductNames: string[]
  outline: EmailOutlineTemplate | null
  // HTML montado pelo Montador — o blueprint é extraído dele.
  referenceHtml: string
}

export interface GenerateBlueprintResult {
  blueprint: GeneratedBlueprint
  source: "ai" | "manual"
  model: string | null
}

/**
 * Gera (ou recupera por fallback) o blueprint da loja e faz upsert em
 * `store_email_blueprints`. Sempre retorna um blueprint utilizável.
 */
export async function generateStoreBlueprint(
  input: GenerateBlueprintInput,
): Promise<GenerateBlueprintResult> {
  const cfgRow = await loadActiveAgentConfig("blueprint")
  const config: AgentInvokeConfig = cfgRow
    ? {
        model: cfgRow.model,
        temperature: cfgRow.temperature,
        max_tokens: cfgRow.max_tokens,
        system_prompt: cfgRow.system_prompt,
        user_template: cfgRow.user_template,
      }
    : {
        model: DEFAULT_MODEL,
        temperature: 0.4,
        max_tokens: 2048,
        system_prompt: DEFAULT_BLUEPRINT_SYSTEM,
        user_template: DEFAULT_BLUEPRINT_USER,
      }

  const vars: Record<string, string> = {
    brand_name: input.brandName,
    nicho: input.nicho,
    posicionamento: input.posicionamento,
    persona: input.persona,
    tom_voz: input.tomVoz,
    top_products: input.topProductNames.join(", "),
    flow_type: input.flowType,
    email_number: String(input.emailNumber),
    outline_objective: input.outline?.objective ?? "",
    outline_guidance: input.outline?.guidance ?? "",
    suggested_blocks: (input.outline?.suggested_blocks ?? []).join(", "),
    allowed_block_types: Array.from(ALLOWED_BLOCK_TYPES).join(", "),
    reference_html: input.referenceHtml,
  }

  const t0 = Date.now()
  let blueprint: GeneratedBlueprint | null = null
  let source: "ai" | "manual" = "ai"
  let model: string | null = config.model
  let tokensInput = 0
  let tokensOutput = 0
  let rawOutput = ""

  try {
    const res = await invokeAgent(config, vars)
    rawOutput = res.raw
    tokensInput = res.tokensInput
    tokensOutput = res.tokensOutput
    blueprint = parseBlueprintOutput(res.raw)
  } catch (err) {
    log.error("blueprint.invoke_failed", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Fallback: DEFAULT_BLUEPRINTS in-code.
  if (!blueprint) {
    blueprint = blueprintFromDefault(input.flowType, input.emailNumber)
    source = "manual"
    model = null
  }

  // Último recurso: blueprint mínimo (nunca falha o pipeline).
  if (!blueprint) {
    blueprint = {
      objective: input.outline?.objective ?? "",
      messaging: "",
      subject_hint: null,
      blocks: [
        { type: "hero", label: "Hero", purpose: "", needs_image: true },
        { type: "text", label: "Texto", purpose: "", needs_image: false },
        { type: "footer", label: "Rodapé", purpose: "", needs_image: false },
      ],
    }
    source = "manual"
    model = null
  }

  await upsertStoreBlueprint(input, blueprint, source, model)

  await logGenerationRun({
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "blueprint",
    agentConfigId: cfgRow?.id,
    status: source === "ai" ? "success" : "skipped",
    model: model ?? "fallback",
    inputVars: vars,
    rawOutput: rawOutput.slice(0, 4000),
    parsedOutput: { blocks: blueprint.blocks.length, source },
    tokensInput,
    tokensOutput,
    costCents: model ? computeCostCents(model, tokensInput, tokensOutput) : 0,
    durationMs: Date.now() - t0,
  })

  return { blueprint, source, model }
}

async function upsertStoreBlueprint(
  input: GenerateBlueprintInput,
  blueprint: GeneratedBlueprint,
  source: "ai" | "manual",
  model: string | null,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from("store_email_blueprints").upsert(
    {
      store_id: input.storeId,
      flow_type: input.flowType,
      email_number: input.emailNumber,
      objective: blueprint.objective,
      messaging: blueprint.messaging,
      subject_hint: blueprint.subject_hint,
      blocks: blueprint.blocks,
      source,
      model,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id,flow_type,email_number" },
  )
  if (error) {
    log.error("blueprint.upsert_failed", {
      storeId: input.storeId,
      error: error.message,
    })
  }
}
