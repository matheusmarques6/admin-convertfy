/**
 * Component Assembler (Epic AE — passo B).
 *
 * Para cada bloco do blueprint gerado, pré-filtra variantes de
 * `email_component_variants` (deriver determinístico), o LLM escolhe a
 * final entre os finalistas, e os snippets são concatenados num HTML de
 * referência por (loja × email), persistido em `store_email_references`.
 * Esse HTML passa a ocupar o papel do reference_html (build-vars.ts).
 *
 * Degrade seguro: LLM falha → top-1 do pré-filtro; pool vazio → nenhum
 * reference é gravado e o consumidor cai no template global.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { EmailComponentVariant } from "@/types/email-generation"

import { computeCostCents, logGenerationRun } from "../callbacks/telemetry.callback"
import {
  buildMatchContext,
  prefilterCandidates,
  DEFAULT_TOP_K,
} from "./component-deriver"
import {
  invokeAgent,
  loadActiveAgentConfig,
  extractJson,
  type AgentInvokeConfig,
} from "./llm-invoke"
import type { GeneratedBlock } from "./blueprint-generator.service"

const log = logger.child("ComponentAssembler")

const DEFAULT_MODEL = "claude-sonnet-4-6"

const DEFAULT_ASSEMBLER_SYSTEM = `Você é o montador de referência visual de emails. Para cada bloco, recebe VARIANTES FINALISTAS (já pré-filtradas) e escolhe a que melhor combina com a loja/produto/marca, mantendo coerência visual entre os blocos. Escolha sempre um variant_id presente nos finalistas. Retorne APENAS um JSON array [{"block_index","variant_id"}].`

const DEFAULT_ASSEMBLER_USER = `LOJA: {{brand_name}} — NICHO: {{nicho}} — POSICIONAMENTO: {{posicionamento}} — MOOD: {{mood}}
BLOCOS: {{blocks_json}}
FINALISTAS POR BLOCO: {{candidates_json}}
Escolha a melhor variante de cada bloco. Responda apenas o JSON array.`

export interface AssemblerChoice {
  block_index: number
  variant_id: string
}

// ── Parsing + resolução (puro, testável) ───────────────────────────

/** Extrai o array de escolhas do output do LLM. Vazio se inválido. */
export function parseAssemblerOutput(raw: string): AssemblerChoice[] {
  try {
    const json = JSON.parse(extractJson(raw)) as unknown
    if (!Array.isArray(json)) return []
    return json
      .filter(
        (c): c is { block_index: number; variant_id: string } =>
          !!c &&
          typeof c === "object" &&
          typeof (c as Record<string, unknown>).block_index === "number" &&
          typeof (c as Record<string, unknown>).variant_id === "string",
      )
      .map((c) => ({ block_index: c.block_index, variant_id: c.variant_id }))
  } catch {
    return []
  }
}

/**
 * Aplica as escolhas do LLM sobre os finalistas de cada bloco, com
 * fallback determinístico para o top-1. Blocos sem candidato são pulados.
 */
export function resolveChoices(
  candidatesByBlock: EmailComponentVariant[][],
  llmChoices: AssemblerChoice[],
): EmailComponentVariant[] {
  const choiceMap = new Map(llmChoices.map((c) => [c.block_index, c.variant_id]))
  const out: EmailComponentVariant[] = []
  candidatesByBlock.forEach((finalists, i) => {
    if (finalists.length === 0) return // sem candidato → pula bloco
    const chosenId = choiceMap.get(i)
    const chosen = chosenId
      ? finalists.find((v) => v.id === chosenId)
      : undefined
    out.push(chosen ?? finalists[0]) // fallback top-1
  })
  return out
}

/** Concatena os snippets escolhidos num shell de referência 600px. */
export function assembleReferenceHtml(chosen: EmailComponentVariant[]): string {
  const body = chosen
    .map((v) => `  <!-- ${v.block_type}: ${v.name} -->\n  ${v.html.trim()}`)
    .join("\n")
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8" /></head>
<body style="margin:0">
<div style="max-width:600px;margin:0 auto">
${body}
</div>
</body>
</html>`
}

// ── Orquestração (I/O) ─────────────────────────────────────────────

export interface AssembleReferenceInput {
  storeId: string
  flowType: string
  emailNumber: number
  batchId: string
  triggeredBy?: string
  brandName: string
  nicho: string
  posicionamento: string
  tomVoz: string
  mood: string
  blocks: GeneratedBlock[]
}

export interface AssembleReferenceResult {
  html: string | null
  variantIds: string[]
}

/** Carrega as variantes ativas agrupadas por block_type. */
async function loadActiveVariantsByType(): Promise<
  Map<string, EmailComponentVariant[]>
> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("email_component_variants")
    .select("*")
    .eq("is_active", true)
  const byType = new Map<string, EmailComponentVariant[]>()
  if (error) {
    log.error("variants.load_failed", { error: error.message })
    return byType
  }
  for (const v of (data as EmailComponentVariant[] | null) ?? []) {
    const arr = byType.get(v.block_type) ?? []
    arr.push(v)
    byType.set(v.block_type, arr)
  }
  return byType
}

/**
 * Monta o reference HTML da loja a partir dos blocos do blueprint.
 * Retorna `html: null` quando não há nenhuma variante (consumidor cai no
 * template global).
 */
export async function assembleStoreReference(
  input: AssembleReferenceInput,
): Promise<AssembleReferenceResult> {
  const matchCtx = buildMatchContext({
    nicho: input.nicho,
    posicionamento: input.posicionamento,
    tom_voz: input.tomVoz,
  })

  const poolByType = await loadActiveVariantsByType()
  const candidatesByBlock: EmailComponentVariant[][] = input.blocks.map((b) =>
    prefilterCandidates(poolByType.get(b.type) ?? [], matchCtx, DEFAULT_TOP_K),
  )

  const hasAnyCandidate = candidatesByBlock.some((c) => c.length > 0)
  if (!hasAnyCandidate) {
    log.warn("assembler.no_candidates", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
    })
    return { html: null, variantIds: [] }
  }

  const cfgRow = await loadActiveAgentConfig("assembler")
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
        temperature: 0.3,
        max_tokens: 1500,
        system_prompt: DEFAULT_ASSEMBLER_SYSTEM,
        user_template: DEFAULT_ASSEMBLER_USER,
      }

  const blocksJson = JSON.stringify(
    input.blocks.map((b, i) => ({
      block_index: i,
      type: b.type,
      label: b.label,
      purpose: b.purpose,
    })),
  )
  const candidatesJson = JSON.stringify(
    candidatesByBlock.map((finalists, i) => ({
      block_index: i,
      block_type: input.blocks[i]?.type,
      candidates: finalists.map((v) => ({
        variant_id: v.id,
        name: v.name,
        density: v.density,
        mood: v.mood,
      })),
    })),
  )

  const vars: Record<string, string> = {
    brand_name: input.brandName,
    nicho: input.nicho,
    posicionamento: input.posicionamento,
    mood: input.mood,
    blocks_json: blocksJson,
    candidates_json: candidatesJson,
  }

  const t0 = Date.now()
  let llmChoices: AssemblerChoice[] = []
  let tokensInput = 0
  let tokensOutput = 0
  let rawOutput = ""
  let usedLlm = false

  try {
    const res = await invokeAgent(config, vars)
    rawOutput = res.raw
    tokensInput = res.tokensInput
    tokensOutput = res.tokensOutput
    llmChoices = parseAssemblerOutput(res.raw)
    usedLlm = llmChoices.length > 0
  } catch (err) {
    log.error("assembler.invoke_failed", {
      storeId: input.storeId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const chosen = resolveChoices(candidatesByBlock, llmChoices)
  const html = assembleReferenceHtml(chosen)
  const variantIds = chosen.map((v) => v.id)

  await upsertStoreReference(input, html, variantIds, usedLlm ? config.model : null)

  await logGenerationRun({
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "assembler",
    agentConfigId: cfgRow?.id,
    status: usedLlm ? "success" : "skipped",
    model: usedLlm ? config.model : "fallback",
    inputVars: { blocks: input.blocks.length },
    rawOutput: rawOutput.slice(0, 4000),
    parsedOutput: { chosen: variantIds.length, used_llm: usedLlm },
    tokensInput,
    tokensOutput,
    costCents: usedLlm
      ? computeCostCents(config.model, tokensInput, tokensOutput)
      : 0,
    durationMs: Date.now() - t0,
  })

  return { html, variantIds }
}

async function upsertStoreReference(
  input: AssembleReferenceInput,
  html: string,
  variantIds: string[],
  model: string | null,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from("store_email_references").upsert(
    {
      store_id: input.storeId,
      flow_type: input.flowType,
      email_number: input.emailNumber,
      html,
      variant_ids: variantIds,
      source: "ai",
      model,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id,flow_type,email_number" },
  )
  if (error) {
    log.error("reference.upsert_failed", {
      storeId: input.storeId,
      error: error.message,
    })
  }
}
