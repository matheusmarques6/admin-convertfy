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
import { buildCatalog, buildTypeIndex } from "./catalog-builder"
import {
  parseCuratorRanking,
  rankingIds,
  type ParsedRanking,
  type RankedChoice,
} from "./curator-ranking.parser"
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

// ── PASSO A — Curador: rankeia até 3 variant_id por posição (story CM-3) ──
// O pré-filtro determinístico (score objectives/tones/density, top-8) SAIU: ele
// decidia quem o LLM podia ver a partir de três campos categóricos, antes de
// qualquer leitura de marca. Agora o Curador recebe o catálogo INTEIRO — no
// system prompt, para ser cacheável — e é ele quem corta.
const DEFAULT_CHOOSER_MODEL = "anthropic/claude-sonnet-4.6"

/** Teto de finalistas por posição (o Montador escolhe entre eles — CM-4). */
export const CHOOSER_TOP_N = 3

/**
 * Tentativas do Curador antes de desistir. Sem o score do pré-filtro não há
 * fallback determinístico: uma composição escolhida por critério arbitrário
 * seria pior que uma falha visível (decisão CM-3).
 */
export const CHOOSER_MAX_ATTEMPTS = 2

/** Var do catálogo no system prompt — ausência é falha, não degradação. */
export const CATALOG_VAR = "{{catalogo}}"

/**
 * Teto de output do Curador. 12 posições × 3 UUIDs (≈20 tokens cada) + 12
 * motivos curtos ≈ 2,5k — os 2048 anteriores estourariam, e o parser não
 * recupera JSON truncado. Teto não é custo: cobra-se o que sai.
 */
export const CHOOSER_MAX_TOKENS = 8192

/**
 * O Curador não produziu composição utilizável. Sobe para o caller
 * (`generateBlueprintAndReference`) em vez de gravar arquitetura arbitrária.
 */
export class CuratorFailedError extends Error {
  readonly reason: string
  constructor(reason: string) {
    super(`curador_failed:${reason}`)
    this.name = "CuratorFailedError"
    this.reason = reason
  }
}

/** `block_index` → motivo da 1ª indicação (telemetria). */
function topMotivos(parsed: ParsedRanking): Record<number, string> {
  const out: Record<number, string> = {}
  for (const [block, choices] of parsed.byBlock) {
    const m = choices[0]?.motivo
    if (m) out[block] = m
  }
  return out
}

export const DEFAULT_CHOOSER_SYSTEM = `Você é o Curador de Componentes de email da Convertfy. Para CADA posição da sequência de um email, você seleciona da biblioteca as ATÉ ${CHOOSER_TOP_N} variantes que melhor servem àquele email e àquela loja, em ordem de preferência.

Você decide pelo nome, pela descrição e pelos metadados de cada variante. Você NÃO recebe o HTML delas.

<biblioteca>
Catálogo completo, agrupado por tipo de seção. Dentro de cada tipo a ordem é alfabética e NÃO carrega julgamento nenhum — não trate posição na lista como sinal de qualidade.
{{catalogo}}
</biblioteca>

Regras de seleção:
- Para cada block_index da sequência, escolha SOMENTE entre variantes cujo tipo de seção é o daquela posição.
- Devolva ATÉ ${CHOOSER_TOP_N} por posição, em ordem de preferência — a 1ª é a sua recomendação. Se o tipo tiver menos de ${CHOOSER_TOP_N} variantes adequadas, devolva quantas houver: nunca complete a lista com uma variante que você rejeitaria.
- Respeite quando_nao_usar: se o contexto do email casa com um "quando NÃO usar", a variante está fora, não em último lugar.
- Prefira variantes cujos objectives/tones batem com o objetivo do outline e o tom de voz da loja.
- Use <perfil_marca> como âncora de identidade: a variante precisa caber na MARCA, não só no objetivo do email.
- Produtos: cruze product_slots com <top_products>. NUNCA indique variante que exige mais produtos do que a loja tem cadastrado.
- Use orientacao_copy como sinal de viabilidade: bloco que exige dado que a loja não tem (campo de cupom sem oferta no contexto) fica fora.
- Use <memoria> como sinal, nunca como regra:
  - <email_anterior_desta_loja>: as variantes escolhidas no email ANTERIOR do MESMO flow desta loja. Busque COERÊNCIA visual — mesma linguagem de layout — sem copiar cegamente: cada email tem seu objetivo.
  - <mesmo_email_em_outras_lojas>: as variantes que ESTE mesmo email recebeu em OUTRAS lojas recentes. Busque VARIEDADE quando houver alternativa igualmente adequada à marca e ao objetivo.
  - Adequação à marca e ao objetivo SEMPRE vence a memória.
- Duas posições do mesmo tipo (dois blocos de corpo, por exemplo) podem receber as mesmas indicações. Rankeie cada posição pelo mérito dela: quem garante variedade dentro do email é a etapa seguinte, não você.
- Se a descrição estiver vazia, decida pelo nome e pelos demais metadados.
- Não invente variant_id: use apenas ids presentes em <biblioteca>.

Responda APENAS o array JSON, sem markdown e sem texto ao redor. A ORDEM do array \`escolhas\` É a ordem de preferência. Somente a 1ª de cada posição leva \`motivo\` — uma frase de no máximo 20 palavras:

[{"block_index":0,"escolhas":[{"variant_id":"...","motivo":"..."},{"variant_id":"..."},{"variant_id":"..."}]}]`

export const DEFAULT_CHOOSER_USER = `<store>
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

<sequencia_do_email>
{{blocks_json}}
</sequencia_do_email>

Para CADA block_index de <sequencia_do_email>, selecione em <biblioteca> as até ${CHOOSER_TOP_N} variantes do tipo daquela posição, em ordem de preferência. Responda APENAS o array JSON.`

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
  /** Todas as elegíveis, em ordem de chegada (o catálogo reordena). */
  all: EmailComponentVariant[]
  byType: Map<string, EmailComponentVariant[]>
  excludedUntagged: Record<string, string[]>
}> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("email_component_variants")
    .select("*")
    .eq("is_active", true)
  const all: EmailComponentVariant[] = []
  const byType = new Map<string, EmailComponentVariant[]>()
  const excludedUntagged: Record<string, string[]> = {}
  if (error) {
    log.error("variants.load_failed", { error: error.message })
    return { all, byType, excludedUntagged }
  }
  for (const v of (data as EmailComponentVariant[] | null) ?? []) {
    if (!variantHasPlaceholders(v)) {
      ;(excludedUntagged[v.block_type] ??= []).push(v.name)
      continue
    }
    all.push(v)
    const arr = byType.get(v.block_type) ?? []
    arr.push(v)
    byType.set(v.block_type, arr)
  }
  if (Object.keys(excludedUntagged).length > 0) {
    log.warn("chooser.candidates_excluded_untagged", { excludedUntagged })
  }
  return { all, byType, excludedUntagged }
}

/**
 * Monta o reference HTML da loja a partir dos blocos do blueprint.
 * Retorna `html: null` quando não há nenhuma variante (consumidor cai no
 * template global).
 */
export async function assembleStoreReference(
  input: AssembleReferenceInput,
): Promise<AssembleReferenceResult> {
  const sections = input.structure.map((s) => s.section)
  const { all: eligible, byType: poolByType, excludedUntagged } =
    await loadActiveVariantsByType()

  // Catálogo COMPLETO (todas as seções) em ordem estável — vai no system
  // prompt para ser cacheado, e cache é endereçado por conteúdo: filtrar por
  // email ou embaralhar por loja mataria o cache (story CM-3).
  const catalog = buildCatalog(eligible)
  const typeIndex = buildTypeIndex(eligible)

  const blocksJson = JSON.stringify(
    input.structure.map((s, i) => ({
      block_index: i,
      section: s.section,
      componente: s.label,
    })),
  )
  const curatedReference = input.referenceTemplateHtml.trim()
  const t0 = Date.now()

  // Nenhuma seção da estrutura tem variante elegível → nem chama o LLM. Não
  // persiste: o consumidor (build-vars) cai no template global.
  if (sections.every((section) => (poolByType.get(section) ?? []).length === 0)) {
    log.warn("assembler.library_covers_nothing", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      sections,
    })
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

  // ── PASSO A — Curador: rankeia até CHOOSER_TOP_N por posição.
  // O HTML das variantes NÃO entra: o catálogo é só nome + descrição +
  // metadados, e vai no SYSTEM para ser cacheável.
  //
  // Prompt vazio na config → cai no DEFAULT in-code, como nos chains da fase
  // 2. É o que a migration do CM-3 grava (corte seco: system_prompt = '') e
  // também o que faz o guard de {{catalogo}} não disparar em falso.
  const chooserRow = await loadActiveAgentConfig("assembler_chooser")
  const chooserConfig: AgentInvokeConfig = {
    model: chooserRow?.model || input.defaultModel || DEFAULT_CHOOSER_MODEL,
    temperature: chooserRow?.temperature ?? 0.2,
    max_tokens: chooserRow?.max_tokens ?? CHOOSER_MAX_TOKENS,
    system_prompt: chooserRow?.system_prompt?.trim() || DEFAULT_CHOOSER_SYSTEM,
    user_template: chooserRow?.user_template?.trim() || DEFAULT_CHOOSER_USER,
  }

  const chooserVars: Record<string, string> = {
    brand_name: input.brandName,
    nicho: input.nicho,
    posicionamento: input.posicionamento,
    persona: input.persona,
    tom_voz: input.tomVoz,
    outline_objective: input.outlineObjective,
    outline_guidance: input.outlineGuidance,
    outline_tone_hint: input.outlineToneHint,
    // Perfil da marca (store_briefings.marca) — ancora a escolha na
    // identidade, não só no objetivo do email.
    briefing_marca: input.briefingJson,
    // Top 5 produtos — cruza com product_slots (não indicar bloco de 4
    // produtos em loja com 2).
    top_products:
      input.topProductNames.length > 0
        ? input.topProductNames.map((t, i) => `${i + 1}. ${t}`).join("\n")
        : "(sem produtos cadastrados)",
    blocks_json: blocksJson,
    memoria: renderCuradorMemory(memory),
  }

  // Guard: o system é editável na aba Agentes. Sem o catálogo o Curador
  // escolheria no vazio — falha explícita é melhor que escolha inventada.
  if (!chooserConfig.system_prompt.includes(CATALOG_VAR)) {
    log.error("assembler.chooser_catalog_missing", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      hasActiveConfig: Boolean(chooserRow),
    })
    throw new CuratorFailedError("catalogo_ausente")
  }

  // Run 'running' visível na live view enquanto o LLM roda.
  const chooserRunId = await startGenerationRun({
    storeId: input.storeId,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "assembler_chooser",
    agentConfigId: chooserRow?.id,
    model: chooserConfig.model,
    inputVars: {
      sections: input.structure.length,
      catalog_variants: catalog.total,
    },
  })

  // Retry 1x. Sem o score do pré-filtro não existe mais fallback determinístico
  // possível: composição arbitrária é pior que falha visível (decisão CM-3).
  let chooserRaw = ""
  let chooserTokensIn = 0
  let chooserTokensOut = 0
  let chooserCostUsd = 0
  let ranking: ParsedRanking | null = null
  let chooserError: string | null = null
  let attempts = 0

  for (let attempt = 1; attempt <= CHOOSER_MAX_ATTEMPTS; attempt++) {
    attempts = attempt
    try {
      const res = await invokeAgent(chooserConfig, chooserVars, {
        // Catálogo no SYSTEM: prefixo idêntico entre lojas → cacheável.
        // Substituição LITERAL (interpolateSystem), nunca pelo renderer —
        // ele apagaria notação como as tags {{TAG}} de outros prompts (CM-1).
        catalogo: catalog.json,
      })
      chooserRaw = res.raw
      chooserTokensIn += res.tokensInput
      chooserTokensOut += res.tokensOutput
      chooserCostUsd += res.costUsd
      const parsed = parseCuratorRanking({
        raw: res.raw,
        sections,
        typeIndex,
        maxPerBlock: CHOOSER_TOP_N,
      })
      ranking = parsed
      // JSON ilegível ou nada aproveitável → vale uma segunda tentativa.
      if (!parsed.malformed && parsed.byBlock.size > 0) {
        chooserError = null
        break
      }
      chooserError = parsed.malformed ? "json_malformado" : "nenhuma_escolha_valida"
    } catch (err) {
      chooserError = err instanceof Error ? err.message : String(err)
    }
    log.warn("assembler.chooser_attempt_failed", {
      storeId: input.storeId,
      flowType: input.flowType,
      emailNumber: input.emailNumber,
      attempt,
      error: chooserError,
    })
  }

  const rankingByBlock = ranking?.byBlock ?? new Map<number, RankedChoice[]>()

  // Slots ordenados: uma posição POR BLOCO da estrutura, na ordem. Enquanto o
  // Montador não escolhe entre os finalistas (CM-4), o código fica com o
  // RANK 1 — equivalente ao comportamento anterior, mas escolhido sobre a
  // biblioteca inteira em vez do top-8 por score.
  const byId = new Map<string, EmailComponentVariant>(
    eligible.map((v) => [v.id, v]),
  )
  const slots: AssemblySlot[] = sections.map((section, i) => {
    const label = input.structure[i]?.label ?? section
    const top = rankingByBlock.get(i)?.[0]
    const variant = top ? byId.get(top.variant_id) : undefined
    if (!variant) return { kind: "missing", section, label }
    return { kind: "variant", variant, section, label }
  })
  const chosen = slots.flatMap((s) => (s.kind === "variant" ? [s.variant] : []))
  const missingCount = slots.filter((s) => s.kind === "missing").length

  const chooserTelemetry = {
    sections: input.structure.length,
    catalog_variants: catalog.total,
    catalog_types: catalog.types.length,
    attempts,
    chosen: chosen.length,
    // Ranking completo — insumo do Montador (CM-4) e auditoria da curadoria.
    ranking: ranking ? rankingIds(ranking) : {},
    motivos: ranking ? topMotivos(ranking) : {},
    // Validações do parser (o catálogo vai inteiro, então o modelo pode
    // indicar id inexistente ou de outra seção).
    invalid_ids: ranking?.invalidIds ?? [],
    wrong_type_ids: ranking?.wrongTypeIds ?? [],
    unknown_blocks: ranking?.unknownBlocks ?? [],
    duplicate_ids: ranking?.duplicateIds ?? [],
    // Posições sem nenhum finalista válido → saem do email (selo nos logs).
    empty_blocks: ranking?.emptyBlocks ?? [],
    // Variantes ativas SEM placeholder ficaram fora do pool (pressão de
    // curadoria — ver variantHasPlaceholders).
    candidates_excluded_untagged: excludedUntagged,
  }

  // Nenhuma posição recebeu variante depois do retry → não há composição.
  // Falha explícita, sem gravar arquitetura.
  if (chosen.length === 0) {
    await finishGenerationRun(chooserRunId, {
      storeId: input.storeId,
      triggeredBy: input.triggeredBy,
      batchId: input.batchId,
      agent: "assembler_chooser",
      agentConfigId: chooserRow?.id,
      status: "error",
      model: chooserConfig.model,
      errorMessage: chooserError ?? "curador_sem_escolhas",
      inputVars: { sections: input.structure.length },
      rawOutput: chooserRaw.slice(0, 8000),
      parsedOutput: chooserTelemetry,
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
    throw new CuratorFailedError(
      chooserError === "json_malformado" || chooserError === null
        ? "curador_sem_escolhas"
        : "curador_failed",
    )
  }

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
    status: "success",
    model: chooserConfig.model,
    inputVars: {
      sections: input.structure.length,
      catalog_variants: catalog.total,
    },
    rawOutput: chooserRaw.slice(0, 8000),
    parsedOutput: chooserTelemetry,
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
