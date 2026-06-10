/**
 * Component Assembler (Epic AE — passo B).
 *
 * GERA a estrutura HTML do email (a arquitetura: layout, ordem dos blocos,
 * seções) com o LLM, usando como input: briefing, nicho, HTMLs de referência
 * (curado), a biblioteca de componentes (`email_component_variants`) como
 * inspiração e a estrutura geral (outline/sections). O HTML produzido é
 * persistido em `store_email_references` e passa a ocupar o papel do
 * reference_html (build-vars.ts) — o agente HTML downstream só repinta com a
 * identidade da loja e despeja a copy, por isso roda em modelo barato.
 *
 * Degrade seguro: LLM falha / output não-HTML → fallback determinístico
 * concatena o top-1 das variantes pré-filtradas; pool vazio → nenhum
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

const log = logger.child("ComponentAssembler")

const DEFAULT_MODEL = "claude-sonnet-4-6"

const DEFAULT_ASSEMBLER_SYSTEM = `Você é o ARQUITETO de estrutura de emails. Sua tarefa é GERAR a estrutura HTML completa de um email — o esqueleto/arquitetura: layout, ordem dos blocos e seções — que um agente downstream vai apenas REPINTAR com a identidade da loja e PREENCHER com a copy. Por isso:
- NÃO escreva a copy final: use placeholders curtos por bloco (ex.: {{HEADLINE}}, {{BODY}}, {{CTA_LABEL}}).
- NÃO use imagens reais: deixe contêineres/slots de imagem vazios.
- Cores SEMPRE via CSS variables (--bg, --text, --heading, --button-bg, --button-text, --accent) declaradas em :root — nunca hex fixo no markup.
- Container único de 600px centralizado, div + flexbox (sem tabelas).
Use os HTMLs de referência e a biblioteca de componentes como inspiração de TÉCNICA de construção, adaptando ao briefing, nicho e estrutura geral — não copie literalmente.
Emita APENAS o HTML, começando em <!DOCTYPE html> e terminando em </html>, sem cercas markdown e sem comentários explicativos.`

const DEFAULT_ASSEMBLER_USER = `<store>
- marca: {{brand_name}}
- nicho: {{nicho}}
- posicionamento: {{posicionamento}}
- persona: {{persona}}
- tom de voz: {{tom_voz}}
- mood: {{mood}}
</store>

<briefing>
{{briefing_json}}
</briefing>

<pesquisa_diagnostico>
{{pesquisa_diagnostico}}
</pesquisa_diagnostico>

<outline>
- objetivo: {{outline_objective}}
- diretriz: {{outline_guidance}}
- tom sugerido: {{outline_tone_hint}}
</outline>

<estrutura_geral_ordenada>
{{blocks_json}}
</estrutura_geral_ordenada>

<htmls_referencia>
{{reference_template_html}}
</htmls_referencia>

<biblioteca_componentes>
{{candidates_json}}
</biblioteca_componentes>

Gere AGORA a estrutura HTML completa do email seguindo a ordem de blocos em <estrutura_geral_ordenada>, usando placeholders de copy e CSS variables de cor. Emita só o HTML, de <!DOCTYPE html> a </html>.`

export interface AssemblerChoice {
  block_index: number
  variant_id: string
  reasoning?: string
  brand_evidence?: string
}

// ── Parsing + resolução (puro, testável) ───────────────────────────

/** Extrai o array de escolhas do output do LLM. Vazio se inválido. */
export function parseAssemblerOutput(raw: string): AssemblerChoice[] {
  try {
    const json = JSON.parse(extractJson(raw)) as unknown
    if (!Array.isArray(json)) return []
    return json
      .filter(
        (c): c is Record<string, unknown> =>
          !!c &&
          typeof c === "object" &&
          typeof (c as Record<string, unknown>).block_index === "number" &&
          typeof (c as Record<string, unknown>).variant_id === "string",
      )
      .map((c) => ({
        block_index: c.block_index as number,
        variant_id: c.variant_id as string,
        // Campos auxiliares opcionais (telemetria/auditoria) — ignorados na
        // montagem, guardados para inspeção.
        ...(typeof c.reasoning === "string" ? { reasoning: c.reasoning } : {}),
        ...(typeof c.brand_evidence === "string"
          ? { brand_evidence: c.brand_evidence }
          : {}),
      }))
  } catch {
    return []
  }
}

/**
 * Fisher-Yates: retorna uma NOVA array embaralhada (não muta a original).
 * Usado para apresentar os candidatos ao LLM sem viés de posição — o
 * fallback determinístico continua usando a ordem por score.
 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
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

/** Extrai o documento HTML do output do LLM (remove fences + prosa ao redor). */
export function extractHtml(raw: string): string {
  let s = raw.replace(/```(?:html)?\s*/gi, "").replace(/```/g, "").trim()
  const doctype = s.search(/<!DOCTYPE html/i)
  if (doctype > 0) {
    s = s.slice(doctype)
  } else {
    const htmlOpen = s.search(/<html[\s>]/i)
    if (htmlOpen > 0) s = s.slice(htmlOpen)
  }
  const end = s.toLowerCase().lastIndexOf("</html>")
  if (end >= 0) s = s.slice(0, end + "</html>".length)
  return s.trim()
}

/** Heurística: o output parece um documento HTML de email utilizável. */
export function looksLikeHtml(s: string): boolean {
  return /<\/html>/i.test(s) && /<(div|table|body)[\s>]/i.test(s)
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
  persona: string
  // Briefing da marca (JSON serializado) — ancora as escolhas no briefing.
  briefingJson: string
  // Pesquisa & Diagnóstico (5 pilares) serializada — fonte rica.
  pesquisa: string
  // Diretriz de alto nível do outline (estrutura geral): objetivo + guidance + tom.
  outlineObjective: string
  outlineGuidance: string
  outlineToneHint: string
  // Template de referência curado global (email_reference_templates) p/ este
  // flow×email — guia de estrutura/estilo para a escolha das variantes (NÃO é
  // copiado). "" quando não há curado. Independe do papel de fallback que a
  // mesma fonte mantém no build-vars (consumidor).
  referenceTemplateHtml: string
  // Seções (8) vindas do outline (estrutura geral), na ordem.
  sections: string[]
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
  const candidatesByBlock: EmailComponentVariant[][] = input.sections.map(
    (section) =>
      prefilterCandidates(poolByType.get(section) ?? [], matchCtx, DEFAULT_TOP_K),
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
        // Gera um documento HTML inteiro — precisa de espaço (não os ~1.5k
        // de quando só escolhia variantes).
        max_tokens: 16384,
        system_prompt: DEFAULT_ASSEMBLER_SYSTEM,
        user_template: DEFAULT_ASSEMBLER_USER,
      }

  const blocksJson = JSON.stringify(
    input.sections.map((section, i) => ({
      block_index: i,
      section,
    })),
  )
  // Biblioteca como inspiração: mostra o HTML de até 3 exemplos por seção
  // (truncado p/ controlar tokens). O LLM se inspira na técnica, não copia.
  const candidatesJson = JSON.stringify(
    candidatesByBlock.map((finalists, i) => ({
      block_index: i,
      section: input.sections[i],
      exemplos: shuffle(finalists)
        .slice(0, 3)
        .map((v) => ({
          name: v.name,
          density: v.density,
          mood: v.mood,
          html: v.html.trim().slice(0, 1500),
        })),
    })),
  )

  const vars: Record<string, string> = {
    brand_name: input.brandName,
    nicho: input.nicho,
    posicionamento: input.posicionamento,
    persona: input.persona,
    tom_voz: input.tomVoz,
    mood: input.mood,
    briefing_json: input.briefingJson,
    pesquisa_diagnostico: input.pesquisa,
    outline_objective: input.outlineObjective,
    outline_guidance: input.outlineGuidance,
    outline_tone_hint: input.outlineToneHint,
    reference_template_html: input.referenceTemplateHtml,
    blocks_json: blocksJson,
    candidates_json: candidatesJson,
  }

  const t0 = Date.now()
  let tokensInput = 0
  let tokensOutput = 0
  let rawOutput = ""
  let generatedHtml = ""
  let usedLlm = false
  let invokeError: string | null = null

  try {
    const res = await invokeAgent(config, vars)
    rawOutput = res.raw
    tokensInput = res.tokensInput
    tokensOutput = res.tokensOutput
    generatedHtml = extractHtml(res.raw)
    usedLlm = looksLikeHtml(generatedHtml)
    // LLM respondeu mas não veio um documento HTML utilizável.
    if (!usedLlm) invokeError = "llm_output_not_html"
  } catch (err) {
    invokeError = err instanceof Error ? err.message : String(err)
    log.error("assembler.invoke_failed", {
      storeId: input.storeId,
      model: config.model,
      error: invokeError,
    })
  }

  // Fallback determinístico: concatena o top-1 das variantes pré-filtradas.
  const fallbackChosen = resolveChoices(candidatesByBlock, [])
  const html = usedLlm ? generatedHtml : assembleReferenceHtml(fallbackChosen)
  const variantIds = usedLlm ? [] : fallbackChosen.map((v) => v.id)

  await upsertStoreReference(input, html, variantIds, usedLlm ? config.model : null)

  await logGenerationRun({
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "assembler",
    agentConfigId: cfgRow?.id,
    status: usedLlm ? "success" : "skipped",
    model: usedLlm ? config.model : "fallback",
    // Em skip, registra o motivo + o modelo tentado pra diagnóstico.
    errorMessage: usedLlm ? undefined : (invokeError ?? undefined),
    inputVars: { sections: input.sections.length },
    // Telemetria do output bruto. HTML gerado é grande — guarda até 40k pra
    // não cortar a visualização (o HTML real persistido não é truncado).
    rawOutput: rawOutput.slice(0, 40000),
    parsedOutput: {
      used_llm: usedLlm,
      attempted_model: config.model,
      invoke_error: invokeError,
      html_chars: html.length,
    },
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
