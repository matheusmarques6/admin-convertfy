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
import type {
  EmailComponentVariant,
  ReferenceSlotMapEntry,
} from "@/types/email-generation"

import {
  resolveCostCents,
  finishGenerationRun,
  startGenerationRun,
} from "../callbacks/telemetry.callback"
import {
  buildMatchContext,
  prefilterCandidates,
  seededShuffle,
  seedFrom,
} from "./component-deriver"
import { effectiveVariantHtml } from "../shared/component-dimensions"
import { assembleDocument, validateBlockMarkers } from "./assemble-document"
import type { OutlineSection } from "./outline-sections"
import {
  invokeAgent,
  loadActiveAgentConfig,
  extractJson,
  type AgentInvokeConfig,
} from "./llm-invoke"
import {
  loadCuradorMemory,
  logCuradorChoice,
  renderCuradorMemory,
  type ChoiceEntry,
} from "./curador-memory"

const log = logger.child("ComponentAssembler")

// Quantos candidatos por seção vão pro PASSO A (escolha por descrição). Como o
// passo A é texto barato (sem HTML), mandamos uma lista generosa.
const CHOOSER_TOP_K = 8

// ── PASSO A — Curador: escolhe 1 variant_id por seção, só pela DESCRIÇÃO ──
const DEFAULT_CHOOSER_MODEL = "anthropic/claude-sonnet-4.6"

const DEFAULT_CHOOSER_SYSTEM = `Você é o Curador de Componentes de email. Para CADA posição da sequência do email, escolha UMA variante da biblioteca — a que melhor serve ao objetivo do email e à identidade da loja — usando o NOME, a DESCRIÇÃO e os metadados de cada variante: quando_usar / quando_nao_usar (contexto de uso escrito pelo time), objectives (objetivos de email compatíveis), tones (tons compatíveis), density, product_slots, orientacao_copy (diretriz de copy do bloco), campos_copy (o que o bloco exige da copy: campos, tipos e limites) e notas_implementacao (notas técnicas do layout). Você NÃO recebe o HTML das variantes; decide pela descrição e pelo contexto.

Regras:
- Uma escolha por block_index da sequência. Use APENAS variant_id presente nas opções daquela posição.
- Respeite quando_nao_usar: se o contexto do email bate com um "quando NÃO usar", prefira outra variante da posição.
- Prefira variantes cujos objectives/tones batem com o objetivo do outline e o tom de voz da loja.
- Use <perfil_marca> como âncora de identidade: a variante escolhida precisa caber na marca, não só no objetivo.
- Para posições de produtos, cruze product_slots com <top_products>: NUNCA escolha variante que exige mais produtos do que a loja tem cadastrado.
- Use orientacao_copy/campos_copy como sinal de viabilidade: se o bloco exige dados que a loja não tem (ex.: campo de cupom sem oferta no contexto), prefira outra variante.
- Evite repetir a mesma variante em posições diferentes do mesmo email; quando a mesma seção aparece 2+ vezes, escolha variantes diferentes se houver opções.
- Use <memoria> como sinal de continuidade e variedade:
  - <email_anterior_desta_loja>: são as variantes escolhidas no email ANTERIOR do MESMO flow desta loja. Busque COERÊNCIA visual — mantenha a mesma linguagem de layout (ex.: se o email anterior usou hero com imagem de fundo, prefira um hero coerente aqui), sem copiar cegamente: cada email tem seu objetivo.
  - <mesmo_email_em_outras_lojas>: são as variantes que ESTE mesmo email recebeu em OUTRAS lojas recentes. Busque VARIEDADE — evite repetir sempre as mesmas variantes usadas nas outras lojas quando houver alternativa igualmente adequada à marca e ao objetivo.
  - A memória é sinal, não regra: adequação à marca e ao objetivo do email SEMPRE vence.
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

<perfil_marca>
{{briefing_marca}}
</perfil_marca>

<top_products>
{{top_products}}
</top_products>

<memoria>
{{memoria}}
</memoria>

<estrutura_geral_ordenada>
{{blocks_json}}
</estrutura_geral_ordenada>

<biblioteca_componentes>
{{candidates_json}}
</biblioteca_componentes>

Para CADA block_index em <estrutura_geral_ordenada>, escolha em <biblioteca_componentes> (mesmo block_index) o variant_id que melhor serve ao objetivo e à loja. Responda APENAS o array JSON [{"block_index":N,"variant_id":"..."}].`

export interface AssemblerChoice {
  block_index: number
  variant_id: string
  reasoning?: string
  brand_evidence?: string
}

// Tags de imagem canônicas ({{HERO_IMAGE}}, {{PRODUCT_1_THUMB_2}}...).
const IMAGE_TAG_PATTERN = /\{\{\s*([A-Z][A-Z0-9_]*(?:IMAGE|THUMB)[A-Z0-9_]*)\s*\}\}/g

/**
 * Guard determinístico: tags de imagem presentes nos HTMLs das variantes
 * escolhidas mas AUSENTES no documento montado — o Montador as removeu ao
 * harmonizar (bug provado na Luxe Lift welcome#3: hero/products/body com
 * slot tagueado no input, zero tags de imagem no output → email em branco).
 * Puro, testável.
 */
export function findDroppedImageTags(
  chosenHtml: string,
  outputHtml: string,
): string[] {
  const collect = (s: string) =>
    new Set(Array.from(s.matchAll(IMAGE_TAG_PATTERN), (m) => m[1]))
  const input = collect(chosenHtml)
  const output = collect(outputHtml)
  return Array.from(input)
    .filter((t) => !output.has(t))
    .sort()
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

/**
 * Escolha do Curador/Montador por parte do email — persistida em
 * store_email_references.slot_map. Missing → variant_id null. Pura.
 */
export function slotMapFromSlots(slots: AssemblySlot[]): ReferenceSlotMapEntry[] {
  return slots.map((s, i) => ({
    block_index: i,
    section: s.section,
    label: s.label,
    variant_id: s.kind === "variant" ? s.variant.id : null,
    variant_name: s.kind === "variant" ? s.variant.name : null,
  }))
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
  // Top 5 produtos da loja (títulos, rank asc) — o Curador cruza com
  // product_slots dos candidatos. Vazio quando a loja não tem produtos.
  topProductNames: string[]
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
  // Modelo default da aba Configurações — usado nos fallbacks quando o
  // agente (Curador/Montador) NÃO tem config ativa em email_agent_configs.
  defaultModel?: string | null
  // Fontes aprovadas da loja (store_brand_identity). Normalizam a
  // tipografia do documento montado: componentes vêm de origens diferentes
  // (Arial, Courier, Trebuchet) e sem isso o email sai com 3 tipografias.
  // O phase2 normaliza de novo a cada geração — a loja pode trocar de fonte
  // sem invalidar a arquitetura persistida.
  fontHeading?: string | null
  fontBody?: string | null
}

// "code" = documento concatenado pelo código a partir das variantes
//   escolhidas (story CM-2 — substituiu o "llm" do Montador).
// "store" = reference+blueprint já persistidos foram REUSADOS sem regerar
//   (guard de reuso do generate.service; só com force=false).
// "llm" = legado: reference gravada pelo Montador LLM antes do CM-2.
export type ReferenceSource = "llm" | "code" | "global" | "none" | "store"

export interface AssembleReferenceResult {
  html: string | null
  variantIds: string[]
  // Fonte do reference HTML deste run — informa o dispatch (settle) e a página
  // de Logs de geração: "llm" = Montador gerou; "global" = caiu no template
  // curado (email_reference_templates); "none" = sem LLM e sem global curado.
  source: ReferenceSource
  // Slots ordenados da estrutura (variante escolhida ou missing) — insumo do
  // builder determinístico de blueprint NO MESMO RUN. Não confundir com
  // variantIds (que pula os missing e por isso não casa com a estrutura).
  slots: AssemblySlot[]
}

// Placeholder canônico ({{TAG_MAIUSCULA}}) — mesmo formato do tag-registry.
const ANY_PLACEHOLDER = /\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}/

/**
 * Guard de elegibilidade: variante cujo HTML não tem NENHUM placeholder é
 * impreenchível pelo pipeline (blueprint não a vê → n8n não gera copy →
 * agentes não têm o que substituir → exemplo hardcoded vaza pro cliente —
 * caso "body 2" da Luxe Lift, jul/2026). Fica fora do pool de candidatas
 * até ser tagueada (manual ou taguedor). Pura, testável.
 * Elegível quando o html TEM placeholder OU quando o taguedor produziu um
 * html_tagged APROVADO com placeholder — é esse HTML efetivo que o
 * pipeline consome (effectiveVariantHtml).
 */
export function variantHasPlaceholders(v: EmailComponentVariant): boolean {
  return ANY_PLACEHOLDER.test(effectiveVariantHtml(v) ?? "")
}

/** Carrega as variantes ativas agrupadas por block_type. */
async function loadActiveVariantsByType(): Promise<{
  byType: Map<string, EmailComponentVariant[]>
  excludedUntagged: Record<string, string[]>
}> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("email_component_variants")
    .select("*")
    .eq("is_active", true)
  const byType = new Map<string, EmailComponentVariant[]>()
  const excludedUntagged: Record<string, string[]> = {}
  if (error) {
    log.error("variants.load_failed", { error: error.message })
    return { byType, excludedUntagged }
  }
  for (const v of (data as EmailComponentVariant[] | null) ?? []) {
    if (!variantHasPlaceholders(v)) {
      ;(excludedUntagged[v.block_type] ??= []).push(v.name)
      continue
    }
    const arr = byType.get(v.block_type) ?? []
    arr.push(v)
    byType.set(v.block_type, arr)
  }
  if (Object.keys(excludedUntagged).length > 0) {
    log.warn("chooser.candidates_excluded_untagged", { excludedUntagged })
  }
  return { byType, excludedUntagged }
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
    flow_type: input.flowType,
    tom_voz: input.tomVoz,
    tone_hint: input.outlineToneHint,
  })

  const sections = input.structure.map((s) => s.section)
  const { byType: poolByType, excludedUntagged } =
    await loadActiveVariantsByType()
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
      slots: sections.map((section, i) => ({
        kind: "missing" as const,
        section,
        label: input.structure[i]?.label ?? section,
      })),
    }
  }

  // Memória do Curador: escolha do email anterior desta loja (coerência) +
  // escolhas do mesmo email em outras lojas do org (variedade). Best-effort —
  // nunca derruba a geração; org_id resolvido aqui é reusado no log.
  const memory = await loadCuradorMemory(
    input.storeId,
    input.flowType,
    input.emailNumber,
  )

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
        model: input.defaultModel ?? DEFAULT_CHOOSER_MODEL,
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
      // Embaralha a APRESENTAÇÃO (não o fallback) pra remover o viés de posição
      // do Curador. Seed por (loja, flow, email, bloco): varia entre lojas e
      // entre emails, mas o mesmo email regenera igual. `candidatesByBlock`
      // segue em ordem de score → `resolveChoices` mantém o top-1 como fallback.
      // SEM html: só descrição + metadados (escolha barata).
      opcoes: seededShuffle(
        finalists,
        seedFrom(input.storeId, input.flowType, input.emailNumber, i),
      ).map((v) => ({
        variant_id: v.id,
        name: v.name,
        description: v.description ?? "",
        quando_usar: v.when_use ?? "",
        quando_nao_usar: v.when_not_use ?? "",
        objectives: v.objectives ?? [],
        tones: v.tones ?? [],
        density: v.density,
        product_slots: v.product_slots ?? 0,
        // Dados de conteúdo da variante — sinal do que o bloco EXIGE da
        // copy/loja pra funcionar (decisão jul/2026: o Curador escolhe
        // melhor sabendo o que o bloco vai pedir).
        orientacao_copy: v.copy_guidance ?? "",
        notas_implementacao: v.long_description ?? "",
        // output_schema COMPACTO (sem example/guidance — controle de
        // tokens; a versão completa vai pro blueprint/n8n, não pra cá).
        campos_copy: (v.output_schema ?? []).map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          max_len: f.max_len,
          required: f.required,
        })),
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
    // Perfil da marca (store_briefings.marca) — mesmo JSON que o Montador
    // já recebia; agora ancora TAMBÉM a escolha das variantes.
    briefing_marca: input.briefingJson,
    // Top 5 produtos da loja — cruza com product_slots dos candidatos
    // (não escolher bloco de 4 produtos em loja com 2).
    top_products:
      input.topProductNames.length > 0
        ? input.topProductNames.map((t, i) => `${i + 1}. ${t}`).join("\n")
        : "(sem produtos cadastrados)",
    blocks_json: blocksJson,
    candidates_json: chooserCandidatesJson,
    memoria: renderCuradorMemory(memory),
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
  let chooserCostUsd = 0
  let choices: AssemblerChoice[] = []
  let chooserError: string | null = null
  try {
    const res = await invokeAgent(chooserConfig, chooserVars)
    chooserRaw = res.raw
    chooserTokensIn = res.tokensInput
    chooserTokensOut = res.tokensOutput
    chooserCostUsd = res.costUsd
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

  // Registra as escolhas desta geração no histórico append-only (memória do
  // Curador). Fire-and-forget: não bloqueia o run nem falha a geração.
  const choiceEntries: ChoiceEntry[] = slots.flatMap((s) =>
    s.kind === "variant"
      ? [{ section: s.section, variant_id: s.variant.id, variant_name: s.variant.name }]
      : [],
  )
  void logCuradorChoice({
    storeId: input.storeId,
    orgId: memory.orgId,
    flowType: input.flowType,
    emailNumber: input.emailNumber,
    batchId: input.batchId,
    choices: choiceEntries,
  })

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
    parsedOutput: {
      choices: choices.length,
      chosen: chosen.length,
      // Guard de elegibilidade: variantes ativas SEM placeholder no HTML
      // ficaram fora do pool (visível no drawer de logs — pressão de
      // curadoria; ver variantHasPlaceholders).
      candidates_excluded_untagged: excludedUntagged,
    },
    tokensInput: chooserTokensIn,
    tokensOutput: chooserTokensOut,
    costCents: resolveCostCents({
      model: chooserConfig.model,
      tokensInput: chooserTokensIn,
      tokensOutput: chooserTokensOut,
      costUsd: chooserCostUsd,
    }),
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
      slots,
    }
  }

  // ── PASSO B — Montagem por CÓDIGO (story CM-2) ─────────────────────
  // O documento é a concatenação dos HTMLs canônicos das variantes
  // escolhidas. Nenhum LLM participa: não há como achatar a variante,
  // remover tag de imagem ou emitir marcador inválido.
  const t1 = Date.now()
  const assembled = assembleDocument({
    slots,
    fonts: { heading: input.fontHeading, body: input.fontBody },
  })
  let html = assembled.html
  const variantIds = chosen.map((v) => v.id)

  // Self-check: marcadores emitidos pelo próprio código. Status diferente
  // de "ok" com blocos presentes é BUG de código — loga error e segue sem
  // marcadores (a fase 2 cai no tag-locator).
  const markerCheck = validateBlockMarkers(html, assembled.stats.expected)
  html = markerCheck.html
  if (assembled.stats.blocks > 0 && markerCheck.status !== "ok") {
    log.error("assembler.marker_selfcheck_failed", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      status: markerCheck.status,
      blocks: assembled.stats.blocks,
    })
  }

  // Self-check: nenhuma tag de imagem das variantes pode ter se perdido na
  // concatenação. Diferente de zero é bug de código.
  const droppedImageTags = findDroppedImageTags(
    slots
      .flatMap((sl) => (sl.kind === "variant" ? [effectiveVariantHtml(sl.variant)] : []))
      .join("\n"),
    html,
  )
  if (droppedImageTags.length > 0) {
    log.error("assembler.image_tags_dropped", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      droppedImageTags,
    })
  }

  if (assembled.stats.skipped.length > 0) {
    log.warn("assembler.blocks_skipped", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      skipped: assembled.stats.skipped,
    })
  }

  const source: ReferenceSource = assembled.stats.blocks > 0 ? "code" : "none"

  if (source === "code") {
    await upsertStoreReference(input, html, variantIds, "code", slots)
  } else {
    // Nenhum bloco entrou (toda variante recusada/vazia): não persiste, o
    // consumidor cai no template global.
    html = curatedReference
    log.warn("assembler.no_block_assembled", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      skipped: assembled.stats.skipped,
    })
  }

  // Run do Montador: nesta story ele não escolhe nem monta (CM-4 dá o papel
  // novo). Registrado como skipped para a linha continuar aparecendo nos
  // gen-logs com a razão.
  const asmRow = await loadActiveAgentConfig("assembler")
  const asmRunId = await startGenerationRun({
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "assembler",
    agentConfigId: asmRow?.id,
    model: "code",
    inputVars: { sections: input.structure.length, chosen: chosen.length },
  })
  await finishGenerationRun(asmRunId, {
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "assembler",
    agentConfigId: asmRow?.id,
    status: "skipped",
    model: "code",
    inputVars: {
      sections: input.structure.length,
      chosen: chosen.length,
      missing: missingCount,
    },
    parsedOutput: {
      reason: "montagem_por_codigo",
      reference_source: source,
      html_chars: html.length,
      variant_ids: variantIds.length,
      blocks: assembled.stats.blocks,
      // Posições que ficaram FORA do email (selo nos logs — CM-7).
      blocks_skipped: assembled.stats.skipped,
      fonts_normalized: assembled.stats.fontsNormalized,
      // Self-checks: os dois têm de ser sempre limpos.
      marker_selfcheck: markerCheck.status,
      image_tags_dropped: droppedImageTags,
    },
    tokensInput: 0,
    tokensOutput: 0,
    costCents: 0,
    durationMs: Date.now() - t1,
  })

  return { html, variantIds, source, slots }
}

async function upsertStoreReference(
  input: AssembleReferenceInput,
  html: string,
  variantIds: string[],
  model: string | null,
  slots: AssemblySlot[],
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from("store_email_references").upsert(
    {
      store_id: input.storeId,
      flow_type: input.flowType,
      email_number: input.emailNumber,
      html,
      variant_ids: variantIds,
      // Escolha por parte do email (migration 20261039) — fonte primária do
      // agente hero_section pra resolver a variante da hero na fase 2.
      slot_map: slotMapFromSlots(slots),
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
