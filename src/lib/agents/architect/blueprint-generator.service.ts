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
import type { CopySpecField, EmailOutlineTemplate } from "@/types/email-generation"
import {
  extractStructureFromReference,
  skeletonToPromptJson,
  type ExtractedStructure,
} from "./reference-structure"
import { normalizeCopySpec } from "@/lib/email-workspace/copy-spec"

import { DEFAULT_BLUEPRINTS } from "../email-blueprint"
import {
  computeCostCents,
  finishGenerationRun,
  startGenerationRun,
} from "../callbacks/telemetry.callback"
import {
  invokeAgent,
  loadActiveAgentConfig,
  extractJson,
  type AgentInvokeConfig,
} from "./llm-invoke"
import { loadEffectiveBlueprint } from "./blueprint-loader"

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
  // Instrução de COMO gerar a imagem deste bloco (só p/ needs_image=true),
  // derivada da intenção do email + nicho. Persistida em blocks[].image_brief
  // e lida por buildImagePromptVars → var IMAGE_BRIEF (casando por posição).
  image_brief?: string | null
  // Orçamento min/max de caracteres por campo de copy, derivado da geometria
  // do HTML lido (fórmula em copy-spec.ts). Clampado aos guarda-corpos
  // absolutos no parse; ausente/inválido → default canônico por tipo.
  copy_spec: CopySpecField[]
  // Tags canônicas do reference que formam o bloco (só quando a estrutura
  // veio do esqueleto determinístico) — persistidas no JSONB e repassadas
  // ao n8n no payload de copy.
  tags?: string[]
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
export const DEFAULT_BLUEPRINT_SYSTEM = `Você é o arquiteto de estrutura de emails. Recebe o HTML JÁ MONTADO de um email e a estrutura geral (outline). Sua tarefa: LER o HTML e extrair o BLUEPRINT DETALHADO — UM bloco para CADA seção visual do HTML, na MESMA ordem, SEM fundir seções diferentes num bloco só e SEM pular nenhuma. Se o HTML tem 9 seções, o blueprint tem 9 blocos; NÃO force um número (esqueça qualquer faixa tipo "4 a 9"). Mapeie cada seção ao tipo técnico mais adequado (reviews/depoimentos → testimonials ou social_proof; cupom → coupon; escassez/contagem → urgency; CTA de fechamento → cta; selos/garantias → features; grade de produtos → products). Use SOMENTE os tipos permitidos. Cada bloco precisa de:
- label: nome específico da seção (não genérico).
- purpose: 2-3 frases CONCRETAS — o que a seção mostra, o ângulo/argumento e o que a COPY precisa entregar ali (NÃO escreva a copy final, escreva a diretiva específica daquele bloco). Nada de "papel do bloco" raso.
- needs_image: true só onde há imagem renderizada (hero/image quase sempre; products quando tem foto; demais quase nunca).
- image_brief: quando needs_image=true, 1-2 frases de COMO gerar a imagem (cena, assunto, enquadramento, mood) derivadas da INTENÇÃO do email + NICHO, sem texto na imagem; quando needs_image=false, null.
- copy_spec: para cada bloco com texto, a lista dos campos de copy com orçamento de caracteres derivado da GEOMETRIA REAL do HTML que você leu. Fórmula: chars_por_linha ≈ largura_útil_px ÷ (font_size_px × 0.55); em colunas ESTREITAS (< 300px, ex.: texto ao lado de imagem) use × 0.75 — a quebra de palavra desperdiça ~30% da linha. max_chars = chars_por_linha × nº de linhas que a seção comporta com elegância (headline 1-2 linhas; body 3-4; CTA SEMPRE 1). min_chars ≈ 40-60% do max. Use as chaves reais de copy (headline, body, text, cta, code, hint, title, eyebrow, greeting, signoff, author). Guarda-corpos que nunca podem ser violados: headline 12-60, body/text 30-400, cta 6-24, code 4-16, title 8-50. REGRA ESPECÍFICA DO HERO: o campo \`eyebrow\` (kicker) do bloco hero tem MÁXIMO 24 caracteres — é um kicker de 1 linha (1-3 palavras). NUNCA emita max_chars > 24 para o eyebrow do hero, mesmo que a geometria comporte mais. Blocos sem texto (image, divider, spacer, footer) → copy_spec: [].
Retorne APENAS JSON: {"objective","messaging","subject_hint","blocks":[{"type","label","purpose","needs_image","image_brief","copy_spec":[{"key","min_chars","max_chars"}]}]}.

ESTRUTURA PRÉ-EXTRAÍDA (tags canônicas): quando o input contiver um bloco <estrutura_extraida> NÃO-VAZIO, a estrutura já foi derivada deterministicamente das tags {{TAG}} do HTML — número, ordem e type dos blocos e o copy_spec por bloco JÁ ESTÃO DECIDIDOS e serão impostos por código. Nesse caso: NÃO re-derive a estrutura nem a geometria; gere "blocks" EXATAMENTE na mesma ordem, quantidade e type da estrutura pré-extraída, preenchendo para cada bloco apenas label (nome específico), purpose (2-3 frases concretas de diretiva de copy) e image_brief (só onde needs_image=true), além de objective, messaging e subject_hint. Pode omitir copy_spec nesses blocos (será sobrescrito). Se <estrutura_extraida> estiver vazio, siga o fluxo normal (extraia a estrutura do HTML como sempre).

PURPOSE LIMITADO ÀS TAGS: em <estrutura_extraida>, cada bloco lista as tags {{TAG}} do template. O purpose de cada bloco deve dirigir SOMENTE a copy dos campos presentes nas tags DAQUELE bloco — nada além. Ex.: bloco com apenas *_CTA_LABEL + *_IMAGE → purpose foca no texto do botão e na direção visual; NUNCA peça narrativa, headline ou body que o template não tem onde renderizar. Tags de sistema (*_IMAGE, *_URL, *_ICON, nomes/preços de produto) não recebem copy — podem ser citadas como direção visual, não como campo a escrever. Se a intenção editorial do email (outline/objective) pedir um conteúdo sem slot no bloco, NÃO transfira esse conteúdo para outro campo — registre a intenção no messaging geral e mantenha o purpose fiel às tags.`

export const DEFAULT_BLUEPRINT_USER = `LOJA: {{brand_name}} — NICHO: {{nicho}} — POSICIONAMENTO: {{posicionamento}}
PERSONA: {{persona}} — TOM DE VOZ: {{tom_voz}}
FLOW: {{flow_type}} — EMAIL #{{email_number}}
OUTLINE: {{outline_objective}} | {{outline_guidance}}
TIPOS PERMITIDOS: {{allowed_block_types}}

<pesquisa_diagnostico>
{{pesquisa_diagnostico}}
</pesquisa_diagnostico>

HTML MONTADO (extraia a estrutura DELE):
{{reference_html}}

Extraia o blueprint detalhado que reflete este HTML. Responda apenas o JSON.

<estrutura_extraida>
{{estrutura_extraida}}
</estrutura_extraida>`

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
  const needs_image = b.needs_image === true || IMAGE_BLOCKS.has(type)
  const brief = typeof b.image_brief === "string" ? b.image_brief.trim() : ""
  return {
    type,
    label: typeof b.label === "string" && b.label.trim() ? b.label : type,
    purpose: asString(b.purpose),
    needs_image,
    // image_brief só faz sentido em bloco de imagem; nos demais fica null.
    image_brief: needs_image && brief ? brief : null,
    copy_spec: normalizeCopySpec(b.copy_spec, type),
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

/**
 * Impõe o esqueleto determinístico (extraído das tags canônicas do
 * reference) sobre o blueprint do LLM: número/ordem/type dos blocos,
 * needs_image e copy_spec vêm SEMPRE do esqueleto; do LLM aproveita-se só
 * label/purpose/image_brief (casados por posição+tipo, best-effort). Assim o
 * LLM não tem como corromper a estrutura — se fundir/pular blocos, o
 * esqueleto ganha e os campos criativos do bloco não-casado ficam default.
 */
export function applySkeletonToBlueprint(
  blueprint: GeneratedBlueprint,
  skeleton: ExtractedStructure,
): GeneratedBlueprint {
  const used = new Set<number>()
  const pick = (type: string, idx: number): GeneratedBlock | null => {
    const at = blueprint.blocks[idx]
    if (at && at.type === type && !used.has(idx)) {
      used.add(idx)
      return at
    }
    const j = blueprint.blocks.findIndex(
      (b, k) => !used.has(k) && b.type === type,
    )
    if (j >= 0) {
      used.add(j)
      return blueprint.blocks[j]
    }
    return null
  }
  const blocks: GeneratedBlock[] = skeleton.blocks.map((sb, i) => {
    const src = pick(sb.type, i)
    const seen = new Set<string>()
    return {
      type: sb.type,
      label: src?.label?.trim() ? src.label : sb.type,
      purpose: src?.purpose ?? "",
      needs_image: sb.needs_image,
      image_brief: sb.needs_image ? (src?.image_brief ?? null) : null,
      copy_spec: sb.copy_spec,
      // Tags indexadas reais ({{PRODUCT_1_NAME}}), dedup na ordem do DOM.
      tags: sb.tags.filter((t) => (seen.has(t) ? false : (seen.add(t), true))),
    }
  })
  return { ...blueprint, blocks }
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
      image_brief: b.image_brief ?? null,
      copy_spec: normalizeCopySpec(null, b.type),
    })),
  }
}

/**
 * Fallback do blueprint global curado (`email_blueprints`): reusa a cascata
 * loadEffectiveBlueprint com storeId=null (pula a camada store e vai direto ao
 * global). É a fonte curada que já existe — preferível ao DEFAULT_BLUEPRINTS
 * in-code (que é só um espelho). null se o global não cobrir o flow×email.
 */
async function blueprintFromGlobal(
  flowType: string,
  emailNumber: number,
): Promise<GeneratedBlueprint | null> {
  const admin = createAdminClient()
  const bp = await loadEffectiveBlueprint(admin, null, flowType, emailNumber)
  if (!bp || !Array.isArray(bp.blocks) || bp.blocks.length === 0) return null
  return {
    objective: bp.objective ?? "",
    messaging: bp.messaging ?? "",
    subject_hint: bp.subject_hint ?? null,
    blocks: (bp.blocks as unknown as GeneratedBlock[]).map((b) => ({
      type: b.type,
      label: b.label,
      purpose: b.purpose,
      needs_image: b.needs_image === true || IMAGE_BLOCKS.has(b.type),
      image_brief: b.image_brief ?? null,
      copy_spec: normalizeCopySpec(b.copy_spec, b.type),
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
  // Pesquisa & Diagnóstico (5 pilares) serializada — fonte rica.
  pesquisa: string
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
        // 8192 p/ caber 1 bloco por seção, purpose detalhado + image_brief.
        max_tokens: 8192,
        system_prompt: DEFAULT_BLUEPRINT_SYSTEM,
        user_template: DEFAULT_BLUEPRINT_USER,
      }

  // Estrutura determinística das tags canônicas do reference (tag-registry).
  // Quando presente: o LLM só preenche os campos criativos e o merge
  // pós-parse impõe estrutura/copy_spec do esqueleto. null = reference
  // legado (sem tags canônicas) → fluxo atual intacto.
  const skeleton = extractStructureFromReference(input.referenceHtml)
  if (skeleton && skeleton.unknownTags.length > 0) {
    log.warn("blueprint.unknown_tags", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      unknownTags: skeleton.unknownTags,
    })
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
    pesquisa_diagnostico: input.pesquisa,
    estrutura_extraida: skeleton ? skeletonToPromptJson(skeleton) : "",
  }

  const t0 = Date.now()
  // Run 'running' visível na live view enquanto o LLM roda.
  const runId = await startGenerationRun({
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "blueprint",
    agentConfigId: cfgRow?.id,
    model: config.model,
  })
  let blueprint: GeneratedBlueprint | null = null
  let source: "ai" | "manual" = "ai"
  let model: string | null = config.model
  let tokensInput = 0
  let tokensOutput = 0
  let rawOutput = ""
  let invokeError: string | null = null

  try {
    const res = await invokeAgent(config, vars)
    rawOutput = res.raw
    tokensInput = res.tokensInput
    tokensOutput = res.tokensOutput
    blueprint = parseBlueprintOutput(res.raw)
    // LLM respondeu mas o JSON não pôde ser parseado em um blueprint válido.
    if (!blueprint) invokeError = "blueprint_unparseable_json"
    // Estrutura determinística ganha do LLM (tags canônicas no reference).
    if (blueprint && skeleton) {
      blueprint = applySkeletonToBlueprint(blueprint, skeleton)
    }
  } catch (err) {
    invokeError = err instanceof Error ? err.message : String(err)
    log.error("blueprint.invoke_failed", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      model: config.model,
      error: invokeError,
    })
  }

  // Fallback nível 1: blueprint global curado (email_blueprints) do mesmo
  // flow×email — a fonte curada que já existe, preferível ao in-code.
  let fallbackSource: "global_blueprint" | "default_incode" | "minimal" | null =
    null
  if (!blueprint) {
    blueprint = await blueprintFromGlobal(input.flowType, input.emailNumber)
    if (blueprint) fallbackSource = "global_blueprint"
    source = "manual"
    model = null
  }

  // Fallback nível 2: DEFAULT_BLUEPRINTS in-code (espelho do global; cobre o
  // caso raro do global não ter o flow×email).
  if (!blueprint) {
    blueprint = blueprintFromDefault(input.flowType, input.emailNumber)
    if (blueprint) fallbackSource = "default_incode"
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
        { type: "hero", label: "Hero", purpose: "", needs_image: true, copy_spec: normalizeCopySpec(null, "hero") },
        { type: "text", label: "Texto", purpose: "", needs_image: false, copy_spec: normalizeCopySpec(null, "text") },
        { type: "footer", label: "Rodapé", purpose: "", needs_image: false, copy_spec: normalizeCopySpec(null, "footer") },
      ],
    }
    fallbackSource = "minimal"
    source = "manual"
    model = null
  }

  // Só persiste o blueprint quando o LLM gerou de verdade (source='ai'). No
  // fallback (DEFAULT_BLUEPRINTS in-code ou mínimo) NÃO grava: preserva um
  // blueprint store bom anterior e deixa loadEffectiveBlueprint cair no
  // email_blueprints global curado — o que funcionava antes. O blueprint de
  // fallback ainda vai no retorno, pro run corrente usar.
  if (source === "ai") {
    await upsertStoreBlueprint(input, blueprint, source, model)
  }

  await finishGenerationRun(runId, {
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "blueprint",
    agentConfigId: cfgRow?.id,
    status: source === "ai" ? "success" : "skipped",
    model: model ?? "fallback",
    // Em fallback (skipped), registra o motivo + modelo tentado pra diagnóstico.
    errorMessage: source === "ai" ? undefined : (invokeError ?? undefined),
    inputVars: vars,
    rawOutput: rawOutput.slice(0, 4000),
    parsedOutput: {
      blocks: blueprint.blocks.length,
      source,
      // Fonte do fallback registrada na página de Logs de geração.
      fallback_source: fallbackSource,
      attempted_model: config.model,
      invoke_error: invokeError,
      // Estrutura determinística via tags canônicas do reference.
      skeleton_used: skeleton !== null,
      skeleton_blocks: skeleton?.blocks.length ?? null,
      skeleton_unknown_tags: skeleton?.unknownTags ?? null,
    },
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
