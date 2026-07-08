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

import {
  computeCostCents,
  finishGenerationRun,
  startGenerationRun,
} from "../callbacks/telemetry.callback"
import {
  buildMatchContext,
  prefilterCandidates,
} from "./component-deriver"
import type { OutlineSection } from "./outline-sections"
import {
  invokeAgent,
  loadActiveAgentConfig,
  extractJson,
  type AgentInvokeConfig,
} from "./llm-invoke"

const log = logger.child("ComponentAssembler")

const DEFAULT_MODEL = "claude-sonnet-4-6"

// Quantos candidatos por seção vão pro PASSO A (escolha por descrição). Como o
// passo A é texto barato (sem HTML), mandamos uma lista generosa.
const CHOOSER_TOP_K = 8

// ── PASSO A — Curador: escolhe 1 variant_id por seção, só pela DESCRIÇÃO ──
const DEFAULT_CHOOSER_MODEL = "anthropic/claude-sonnet-4.6"

const DEFAULT_CHOOSER_SYSTEM = `Você é o Curador de Componentes de email. Para CADA posição da sequência do email, escolha UMA variante da biblioteca — a que melhor serve ao objetivo do email e à identidade da loja — usando o NOME, a DESCRIÇÃO e os metadados (mood/density) de cada variante. Você NÃO recebe o HTML das variantes; decide pela descrição.

Regras:
- Uma escolha por block_index da sequência. Use APENAS variant_id presente nas opções daquela posição.
- Se a descrição estiver vazia, decida pelo nome + metadados.
- Não invente variant_id.

Responda APENAS um array JSON, sem markdown nem texto ao redor:
[{"block_index": 0, "variant_id": "..."}, {"block_index": 1, "variant_id": "..."}]`

const DEFAULT_CHOOSER_USER = `<store>
- marca: {{brand_name}}
- nicho: {{nicho}}
- posicionamento: {{posicionamento}}
- persona: {{persona}}
- tom de voz: {{tom_voz}}
</store>

<outline>
- objetivo: {{outline_objective}}
- diretriz: {{outline_guidance}}
- tom sugerido: {{outline_tone_hint}}
</outline>

<estrutura_geral_ordenada>
{{blocks_json}}
</estrutura_geral_ordenada>

<biblioteca_componentes>
{{candidates_json}}
</biblioteca_componentes>

Para CADA block_index em <estrutura_geral_ordenada>, escolha em <biblioteca_componentes> (mesmo block_index) o variant_id que melhor serve ao objetivo e à loja. Responda APENAS o array JSON [{"block_index":N,"variant_id":"..."}].`

// ── PASSO B — Montador: recebe só o HTML das ESCOLHIDAS e monta ──
const DEFAULT_ASSEMBLER_SYSTEM = `Você é o Montador de Componentes. Você recebe os HTMLs REAIS das variantes JÁ ESCOLHIDAS para cada seção do email, na ordem (<componentes_escolhidos>). Sua tarefa: MONTAR um único documento HTML coeso REUSANDO esses HTMLs.

Regras:
- Preserve a técnica/estrutura de cada variante escolhida — não reescreva do zero; adapte só o necessário para harmonizar (espaçamentos, larguras, tipografia) num documento único.
- Monte os blocos na ordem de block_index (intercalando <componentes_escolhidos> e <blocos_sem_variante> pela posição).
- BLOCOS SEM VARIANTE: para CADA item de <blocos_sem_variante>, NÃO pule a posição. Extraia a seção correspondente de <htmls_referencia> (o reference PADRÃO) e inclua-a naquela posição, precedida do comentário HTML exatamente: <!-- bloco {section}: nao foi encontrada referencia para esse bloco — usando reference padrao -->. Se o reference padrão não tiver essa seção, crie um bloco mínimo daquele tipo com o MESMO comentário. O bloco SEMPRE aparece.
- Container único de 600px centralizado.
- Cores SEMPRE via CSS variables (--bg, --text, --heading, --button-bg, --button-text, --accent) declaradas em :root — unifique as cores das variantes nessas variáveis.
- NÃO escreva a copy final: use placeholders curtos (ex.: {{HEADLINE}}, {{BODY}}, {{CTA_LABEL}}).
- NÃO use imagens reais: deixe contêineres/slots de imagem vazios.

Emita APENAS o HTML, de <!DOCTYPE html> a </html>, sem cercas markdown e sem comentários explicativos — EXCETO a nota obrigatória dos blocos sem variante.`

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

<htmls_referencia>
{{reference_template_html}}
</htmls_referencia>

<componentes_escolhidos>
{{chosen_html_json}}
</componentes_escolhidos>

<blocos_sem_variante>
{{missing_blocks_json}}
</blocos_sem_variante>

Monte AGORA o HTML completo na ordem de block_index, REUSANDO os HTMLs de <componentes_escolhidos> e, para cada item de <blocos_sem_variante>, puxando aquela seção de <htmls_referencia> (com a nota obrigatória). Harmonize num documento único com placeholders de copy e CSS variables de cor. Emita só o HTML, de <!DOCTYPE html> a </html>.`

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

/** Slot ordenado da estrutura do email: ou uma variante escolhida, ou um bloco
 * sem variante na biblioteca (que vira placeholder com nota no fallback). */
export type AssemblySlot =
  | { kind: "variant"; variant: EmailComponentVariant; section: string; label: string }
  | { kind: "missing"; section: string; label: string }

/** Nota obrigatória do bloco sem variante (mesma do prompt do Montador). */
export function missingBlockNote(section: string): string {
  return `<!-- bloco ${section}: nao foi encontrada referencia para esse bloco — usando reference padrao -->`
}

function referenceShell(body: string): string {
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

/** Concatena os snippets escolhidos num shell de referência 600px. */
export function assembleReferenceHtml(chosen: EmailComponentVariant[]): string {
  const body = chosen
    .map((v) => `  <!-- ${v.block_type}: ${v.name} -->\n  ${v.html.trim()}`)
    .join("\n")
  return referenceShell(body)
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
  // Estrutura geral do outline (categoria + rótulo original), na ordem. É o
  // que o Montador segue pra gerar 1 bloco por componente.
  structure: OutlineSection[]
}

export type ReferenceSource = "llm" | "global" | "none"

export interface AssembleReferenceResult {
  html: string | null
  variantIds: string[]
  // Fonte do reference HTML deste run — informa o dispatch (settle) e a página
  // de Logs de geração: "llm" = Montador gerou; "global" = caiu no template
  // curado (email_reference_templates); "none" = sem LLM e sem global curado.
  source: ReferenceSource
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

  const sections = input.structure.map((s) => s.section)
  const poolByType = await loadActiveVariantsByType()
  const candidatesByBlock: EmailComponentVariant[][] = sections.map((section) =>
    prefilterCandidates(poolByType.get(section) ?? [], matchCtx, CHOOSER_TOP_K),
  )

  const blocksJson = JSON.stringify(
    input.structure.map((s, i) => ({
      block_index: i,
      section: s.section,
      componente: s.label,
    })),
  )
  const curatedReference = input.referenceTemplateHtml.trim()
  const t0 = Date.now()

  // Biblioteca não cobre NENHUMA seção → nem chama o LLM. Não persiste: o
  // consumidor (build-vars) cai no template global. Devolve o curado (se houver)
  // só pro Blueprint do mesmo run ter estrutura.
  if (candidatesByBlock.every((b) => b.length === 0)) {
    return {
      html: curatedReference || "",
      variantIds: [],
      source: curatedReference ? "global" : "none",
    }
  }

  // ── PASSO A — Curador: escolhe 1 variant_id por seção SÓ pela descrição.
  // O HTML das variantes NÃO entra aqui — evita gasto de input token com HTML
  // que não será usado (variantes rejeitadas).
  const chooserRow = await loadActiveAgentConfig("assembler_chooser")
  const chooserConfig: AgentInvokeConfig = chooserRow
    ? {
        model: chooserRow.model,
        temperature: chooserRow.temperature,
        max_tokens: chooserRow.max_tokens,
        system_prompt: chooserRow.system_prompt,
        user_template: chooserRow.user_template,
      }
    : {
        model: DEFAULT_CHOOSER_MODEL,
        temperature: 0.2,
        max_tokens: 2048,
        system_prompt: DEFAULT_CHOOSER_SYSTEM,
        user_template: DEFAULT_CHOOSER_USER,
      }

  const chooserCandidatesJson = JSON.stringify(
    candidatesByBlock.map((finalists, i) => ({
      block_index: i,
      section: sections[i],
      label: input.structure[i]?.label ?? sections[i],
      // SEM html: só descrição + metadados (escolha barata).
      opcoes: finalists.map((v) => ({
        variant_id: v.id,
        name: v.name,
        description: v.description ?? "",
        mood: v.mood,
        density: v.density,
      })),
    })),
  )

  const chooserVars: Record<string, string> = {
    brand_name: input.brandName,
    nicho: input.nicho,
    posicionamento: input.posicionamento,
    persona: input.persona,
    tom_voz: input.tomVoz,
    outline_objective: input.outlineObjective,
    outline_guidance: input.outlineGuidance,
    outline_tone_hint: input.outlineToneHint,
    blocks_json: blocksJson,
    candidates_json: chooserCandidatesJson,
  }

  // Run 'running' visível na live view enquanto o LLM roda.
  const chooserRunId = await startGenerationRun({
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "assembler_chooser",
    agentConfigId: chooserRow?.id,
    model: chooserConfig.model,
    inputVars: { sections: input.structure.length },
  })

  let chooserRaw = ""
  let chooserTokensIn = 0
  let chooserTokensOut = 0
  let choices: AssemblerChoice[] = []
  let chooserError: string | null = null
  try {
    const res = await invokeAgent(chooserConfig, chooserVars)
    chooserRaw = res.raw
    chooserTokensIn = res.tokensInput
    chooserTokensOut = res.tokensOutput
    choices = parseAssemblerOutput(res.raw)
  } catch (err) {
    chooserError = err instanceof Error ? err.message : String(err)
    log.error("assembler.chooser_failed", {
      storeId: input.storeId,
      model: chooserConfig.model,
      error: chooserError,
    })
  }

  // Slots ordenados: uma posição POR BLOCO da estrutura, na ordem. Posição com
  // candidato → variante escolhida (top-1 fallback se o LLM não escolheu/errou
  // o id); posição SEM candidato → bloco "missing" (NÃO some — o passo B puxa do
  // reference padrão; o fallback determinístico insere placeholder com nota).
  const choiceMap = new Map(choices.map((c) => [c.block_index, c.variant_id]))
  const slots: AssemblySlot[] = candidatesByBlock.map((finalists, i) => {
    const section = sections[i]
    const label = input.structure[i]?.label ?? section
    if (finalists.length === 0) return { kind: "missing", section, label }
    const id = choiceMap.get(i)
    const variant =
      (id ? finalists.find((v) => v.id === id) : undefined) ?? finalists[0]
    return { kind: "variant", variant, section, label }
  })
  const chosen = slots.flatMap((s) => (s.kind === "variant" ? [s.variant] : []))
  const missingCount = slots.filter((s) => s.kind === "missing").length

  await finishGenerationRun(chooserRunId, {
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "assembler_chooser",
    agentConfigId: chooserRow?.id,
    status: chosen.length > 0 ? "success" : "skipped",
    model: chooserConfig.model,
    errorMessage:
      chooserError ?? (chosen.length === 0 ? "no_candidates" : undefined),
    inputVars: { sections: input.structure.length },
    rawOutput: chooserRaw.slice(0, 8000),
    parsedOutput: { choices: choices.length, chosen: chosen.length },
    tokensInput: chooserTokensIn,
    tokensOutput: chooserTokensOut,
    costCents: computeCostCents(
      chooserConfig.model,
      chooserTokensIn,
      chooserTokensOut,
    ),
    durationMs: Date.now() - t0,
  })

  // Biblioteca não cobre NENHUMA seção → não há o que montar. Não persiste: o
  // consumidor (build-vars) cai no template global. Devolve o curado (se
  // houver) só pro Blueprint do mesmo run ter estrutura.
  if (chosen.length === 0) {
    return {
      html: curatedReference || "",
      variantIds: [],
      source: curatedReference ? "global" : "none",
    }
  }

  // ── PASSO B — Montador: recebe SÓ o HTML COMPLETO das escolhidas e monta.
  const harmRow = await loadActiveAgentConfig("assembler")
  const harmConfig: AgentInvokeConfig = harmRow
    ? {
        model: harmRow.model,
        temperature: harmRow.temperature,
        max_tokens: harmRow.max_tokens,
        system_prompt: harmRow.system_prompt,
        user_template: harmRow.user_template,
      }
    : {
        model: DEFAULT_MODEL,
        temperature: 0.3,
        max_tokens: 16384,
        system_prompt: DEFAULT_ASSEMBLER_SYSTEM,
        user_template: DEFAULT_ASSEMBLER_USER,
      }

  // chosen + missing carregam block_index (posição na sequência) pra o Montador
  // intercalar os dois na ordem certa.
  const chosenHtmlJson = JSON.stringify(
    slots.flatMap((s, i) =>
      s.kind === "variant"
        ? [{
            block_index: i,
            section: s.section,
            label: s.label,
            name: s.variant.name,
            html: s.variant.html,
          }]
        : [],
    ),
  )
  const missingBlocksJson = JSON.stringify(
    slots.flatMap((s, i) =>
      s.kind === "missing"
        ? [{ block_index: i, section: s.section, label: s.label }]
        : [],
    ),
  )

  const harmVars: Record<string, string> = {
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
    chosen_html_json: chosenHtmlJson,
    missing_blocks_json: missingBlocksJson,
  }

  const t1 = Date.now()
  const harmRunId = await startGenerationRun({
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "assembler",
    agentConfigId: harmRow?.id,
    model: harmConfig.model,
    inputVars: {
      sections: input.structure.length,
      chosen: chosen.length,
      missing: missingCount,
    },
  })
  let harmRaw = ""
  let harmTokensIn = 0
  let harmTokensOut = 0
  let html = ""
  let usedLlm = false
  let harmError: string | null = null
  try {
    const res = await invokeAgent(harmConfig, harmVars)
    harmRaw = res.raw
    harmTokensIn = res.tokensInput
    harmTokensOut = res.tokensOutput
    const extracted = extractHtml(res.raw)
    if (looksLikeHtml(extracted)) {
      html = extracted
      usedLlm = true
    } else {
      harmError = "llm_output_not_html"
    }
  } catch (err) {
    harmError = err instanceof Error ? err.message : String(err)
    log.error("assembler.harmonizer_failed", {
      storeId: input.storeId,
      model: harmConfig.model,
      error: harmError,
    })
  }

  const variantIds = chosen.map((v) => v.id)

  // Fonte do reference deste run. "llm" = Montador gerou HTML válido. Caso
  // contrário (timeout/erro/output não-HTML), NÃO geramos HTML degradado nem
  // persistimos: caímos no HTML reference global curado
  // (email_reference_templates) do mesmo flow×email, que o consumidor
  // (build-vars) já resolve via cascata store→global. Não sobrescrever
  // store_email_references preserva um reference bom de geração anterior e
  // deixa o global vencer (era a intenção já documentada no dispatch).
  const source: ReferenceSource = usedLlm
    ? "llm"
    : curatedReference
      ? "global"
      : "none"

  if (usedLlm) {
    await upsertStoreReference(input, html, variantIds, harmConfig.model)
  } else {
    // html devolvido = o global curado (ou "" se não houver) — usado só pelo
    // Blueprint do mesmo run pra extrair a estrutura; NÃO é persistido.
    html = curatedReference
    const logCtx = {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      error: harmError,
    }
    if (source === "global") {
      log.info("assembler.fallback_global_reference", logCtx)
    } else {
      log.warn("assembler.fallback_no_global_reference", logCtx)
    }
  }

  await finishGenerationRun(harmRunId, {
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "assembler",
    agentConfigId: harmRow?.id,
    status: usedLlm ? "success" : "skipped",
    model: usedLlm ? harmConfig.model : "fallback",
    errorMessage: usedLlm ? undefined : (harmError ?? undefined),
    inputVars: {
      sections: input.structure.length,
      chosen: chosen.length,
      missing: missingCount,
    },
    rawOutput: harmRaw.slice(0, 40000),
    parsedOutput: {
      used_llm: usedLlm,
      // Fonte registrada na página de Logs de geração (detalhe do run).
      reference_source: source,
      global_available: curatedReference.length > 0,
      html_chars: html.length,
      variant_ids: variantIds.length,
      missing_blocks: missingCount,
    },
    tokensInput: harmTokensIn,
    tokensOutput: harmTokensOut,
    costCents: usedLlm
      ? computeCostCents(harmConfig.model, harmTokensIn, harmTokensOut)
      : 0,
    durationMs: Date.now() - t1,
  })

  return { html, variantIds, source }
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
