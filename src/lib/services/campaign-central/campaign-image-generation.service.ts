/**
 * Geração de Imagens por Loja (Central de Campanhas) — service.
 *
 * Na etapa de PRODUÇÃO do design de campanha, o designer cria LOTES de
 * instrução (campaign_image_batches). Cada lote = um tipo de imagem
 * (formato + instrução + imagem-base opcional + flags de adaptação). Ao
 * "gerar" um lote, para CADA loja-alvo da campanha montamos o contexto da
 * marca da loja (brand identity + catálogo + idioma + tom + headline da copy
 * de produção) e geramos uma imagem adaptada, reusando o agente de imagem do
 * pipeline de email (`generateEmailImage`, config-driven via o agent_type
 * `campaign_image`).
 *
 * Reuso: buildImagePromptVars (image/prompt-vars-builder), renderImageTemplate
 * (image/template-renderer), generateEmailImage (chains/image.chain),
 * loadTopProducts (agents/top-products).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { NotFoundError, ValidationError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { generateEmailImage, type RefImage } from "@/lib/agents/chains/image.chain"
import { renderImageTemplate } from "@/lib/agents/image/template-renderer"
import { buildImagePromptVars } from "@/lib/agents/image/prompt-vars-builder"
import { loadTopProducts } from "@/lib/agents/top-products"
import { pickBrandLogo } from "@/lib/brand/pick-logo"
import {
  logGenerationRun,
  updateGenerationRun,
} from "@/lib/agents/callbacks/telemetry.callback"
import type { AspectKey } from "@/lib/agents/image/aspect-ratio"
import type {
  StoreBrandIdentity,
  StoreBriefing,
} from "@/types/email-workspace"
import type {
  CampaignImageAdaptFlags,
  CampaignImageBatch,
  CampaignImageBatchWithResults,
  CampaignImageFormat,
  CampaignImagePayload,
  CampaignImageResult,
  CampaignImageResultStatus,
  CampaignImageTargetStore,
  CampaignImageTextContext,
  CampaignImageTextField,
  CopyResultEntry,
  SuggestionTarget,
} from "@/types/campaign-central"

const log = logger.child("CampaignImageGen")

type AdminClient = ReturnType<typeof createAdminClient>

/** Concorrência máxima de gerações simultâneas dentro de um lote. */
const GENERATION_POOL_SIZE = 3

/** Mapeia o formato do lote para o aspect ratio do agente de imagem. */
const FORMAT_TO_ASPECT: Record<CampaignImageFormat, AspectKey> = {
  hero: "4:3",
  square: "1:1",
  story: "3:5",
}

const VALID_FORMATS: CampaignImageFormat[] = ["hero", "square", "story"]

export function isCampaignImageFormat(v: unknown): v is CampaignImageFormat {
  return typeof v === "string" && VALID_FORMATS.includes(v as CampaignImageFormat)
}

// ── Tipos internos de linha ──────────────────────────────────────────

interface BatchRow {
  id: string
  org_id: string
  suggestion_id: string
  task_id: string | null
  name: string
  format: CampaignImageFormat
  instruction: string
  reference_image_url: string | null
  adapt_flags: CampaignImageAdaptFlags | null
  text_context: CampaignImageTextContext | null
  created_at: string
  updated_at: string
}

interface ResultRow {
  id: string
  batch_id: string
  store_id: string
  status: CampaignImageResultStatus
  image_url: string | null
  adjustment_notes: string | null
  error_message: string | null
  generated_via: string | null
  generated_at: string | null
}

interface StoreMeta {
  store_id: string
  store_name: string
  country: string
  language: string | null
  logo_url: string | null
  primary_color: string | null
}

// ── Helpers de leitura ───────────────────────────────────────────────

function mapBatchRow(row: BatchRow): CampaignImageBatch {
  return {
    id: row.id,
    suggestion_id: row.suggestion_id,
    task_id: row.task_id,
    name: row.name,
    format: row.format,
    instruction: row.instruction,
    reference_image_url: row.reference_image_url,
    adapt_flags: row.adapt_flags ?? {},
    text_context: row.text_context ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** Carrega a suggestion (valida org) e devolve targets + copy de produção. */
async function loadSuggestion(
  admin: AdminClient,
  suggestionId: string,
  orgId: string,
): Promise<{
  id: string
  title: string
  send_date: string | null
  targets: SuggestionTarget[]
  production: Record<string, CopyResultEntry>
}> {
  const { data: sug } = await admin
    .from("campaign_suggestions")
    .select("id, title, send_date, targets, copy_results")
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle<{
      id: string
      title: string | null
      send_date: string | null
      targets: SuggestionTarget[] | null
      copy_results: { production?: Record<string, CopyResultEntry> } | null
    }>()

  if (!sug) throw new NotFoundError("Campanha")

  return {
    id: sug.id,
    title: sug.title ?? "",
    send_date: sug.send_date ?? null,
    targets: sug.targets ?? [],
    production: sug.copy_results?.production ?? {},
  }
}

/** Metadados de marca por loja (logo + cor primária + idioma/país atualizados). */
async function loadStoreMeta(
  admin: AdminClient,
  storeIds: string[],
): Promise<Map<string, StoreMeta>> {
  const map = new Map<string, StoreMeta>()
  if (storeIds.length === 0) return map

  const [storesRes, brandRes] = await Promise.all([
    admin
      .from("client_stores")
      .select("id, store_name, country, language")
      .in("id", storeIds),
    admin
      .from("store_brand_identity")
      .select(
        "store_id, logo_main_png, logo_main_svg, logo_alt_svg, logo_alt_png, logo_monogram_svg, logo_monogram_png, logo_reverse_svg, logo_reverse_png, colors_primary, version",
      )
      .in("store_id", storeIds)
      .order("version", { ascending: false }),
  ])

  for (const s of (storesRes.data ?? []) as Array<{
    id: string
    store_name: string | null
    country: string | null
    language: string | null
  }>) {
    map.set(s.id, {
      store_id: s.id,
      store_name: s.store_name ?? "Loja",
      country: s.country ?? "",
      language: s.language ?? null,
      logo_url: null,
      primary_color: null,
    })
  }

  // brandRes vem ordenado por version desc: a 1ª linha vista de cada store é a
  // versão mais recente. Lojas já preenchidas são ignoradas (guard no Set).
  const brandSeen = new Set<string>()
  for (const b of (brandRes.data ?? []) as Array<{
    store_id: string
    logo_main_png: string | null
    logo_main_svg: string | null
    logo_alt_svg: string | null
    logo_alt_png: string | null
    logo_monogram_svg: string | null
    logo_monogram_png: string | null
    logo_reverse_svg: string | null
    logo_reverse_png: string | null
    colors_primary: Array<{ hex?: string }> | null
  }>) {
    if (brandSeen.has(b.store_id)) continue
    brandSeen.add(b.store_id)
    const meta = map.get(b.store_id)
    if (!meta) continue
    // Fallback multi-variante (main → alt → monogram → reverse); prefere PNG
    // porque este logo_url vira imagem de referencia pro modelo.
    meta.logo_url = pickBrandLogo(b, "png")?.url ?? null
    meta.primary_color = b.colors_primary?.[0]?.hex ?? null
  }

  return map
}

function mapResultRow(row: ResultRow, meta: Map<string, StoreMeta>): CampaignImageResult {
  const m = meta.get(row.store_id)
  return {
    id: row.id,
    batch_id: row.batch_id,
    store_id: row.store_id,
    store_name: m?.store_name ?? "Loja",
    country: m?.country ?? "",
    language: m?.language ?? null,
    status: row.status,
    image_url: row.image_url,
    adjustment_notes: row.adjustment_notes,
    error_message: row.error_message,
    generated_at: row.generated_at,
  }
}

/** Monta o payload completo (lojas-alvo + lotes com resultados). */
export async function getCampaignImageData(
  suggestionId: string,
  orgId: string,
): Promise<CampaignImagePayload> {
  const admin = createAdminClient()
  const sug = await loadSuggestion(admin, suggestionId, orgId)

  const storeIds = sug.targets.map((t) => t.store_id)
  const meta = await loadStoreMeta(admin, storeIds)

  const stores: CampaignImageTargetStore[] = sug.targets.map((t) => {
    const m = meta.get(t.store_id)
    return {
      store_id: t.store_id,
      store_name: m?.store_name || t.store_name || "Loja",
      country: m?.country || t.country || "",
      language: m?.language ?? null,
      logo_url: m?.logo_url ?? null,
      primary_color: m?.primary_color ?? null,
    }
  })

  const { data: batchRows } = await admin
    .from("campaign_image_batches")
    .select("*")
    .eq("suggestion_id", suggestionId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })

  const batches = (batchRows as BatchRow[] | null) ?? []
  const batchIds = batches.map((b) => b.id)

  let resultsByBatch = new Map<string, CampaignImageResult[]>()
  if (batchIds.length > 0) {
    const { data: resultRows } = await admin
      .from("campaign_image_results")
      .select(
        "id, batch_id, store_id, status, image_url, adjustment_notes, error_message, generated_via, generated_at",
      )
      .in("batch_id", batchIds)

    resultsByBatch = new Map()
    for (const r of (resultRows as ResultRow[] | null) ?? []) {
      const list = resultsByBatch.get(r.batch_id) ?? []
      list.push(mapResultRow(r, meta))
      resultsByBatch.set(r.batch_id, list)
    }
  }

  const batchesWithResults: CampaignImageBatchWithResults[] = batches.map((b) => ({
    ...mapBatchRow(b),
    results: resultsByBatch.get(b.id) ?? [],
  }))

  return {
    suggestion_id: sug.id,
    title: sug.title,
    send_date: sug.send_date,
    stores,
    batches: batchesWithResults,
  }
}

// ── Criação de lote ──────────────────────────────────────────────────

export interface CreateBatchInput {
  name: string
  format: CampaignImageFormat
  instruction: string
  reference_image_url?: string | null
  adapt_flags?: CampaignImageAdaptFlags
  text_context?: CampaignImageTextContext
  task_id?: string | null
}

export async function createBatch(
  suggestionId: string,
  orgId: string,
  input: CreateBatchInput,
  createdBy: string | null,
): Promise<CampaignImageBatchWithResults> {
  const admin = createAdminClient()
  // Valida a suggestion (org + existência).
  await loadSuggestion(admin, suggestionId, orgId)

  const { data, error } = await admin
    .from("campaign_image_batches")
    .insert({
      org_id: orgId,
      suggestion_id: suggestionId,
      task_id: input.task_id ?? null,
      name: input.name.trim() || "Novo lote",
      format: input.format,
      instruction: input.instruction.trim(),
      reference_image_url: input.reference_image_url ?? null,
      adapt_flags: input.adapt_flags ?? {},
      text_context: input.text_context ?? {},
      created_by: createdBy,
    })
    .select("*")
    .single()

  if (error) throw error
  log.info("batch.created", { suggestionId, batchId: (data as BatchRow).id })
  return { ...mapBatchRow(data as BatchRow), results: [] }
}

export interface UpdateBatchInput {
  name?: string
  format?: CampaignImageFormat
  instruction?: string
  reference_image_url?: string | null
  adapt_flags?: CampaignImageAdaptFlags
  text_context?: CampaignImageTextContext
}

export async function updateBatch(
  batchId: string,
  orgId: string,
  input: UpdateBatchInput,
): Promise<CampaignImageBatch> {
  const admin = createAdminClient()
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name.trim() || "Novo lote"
  if (input.format !== undefined) patch.format = input.format
  if (input.instruction !== undefined) patch.instruction = input.instruction.trim()
  if (input.reference_image_url !== undefined) {
    patch.reference_image_url = input.reference_image_url
  }
  if (input.adapt_flags !== undefined) patch.adapt_flags = input.adapt_flags
  if (input.text_context !== undefined) patch.text_context = input.text_context

  const { data, error } = await admin
    .from("campaign_image_batches")
    .update(patch)
    .eq("id", batchId)
    .eq("org_id", orgId)
    .select("*")
    .maybeSingle()

  if (error) throw error
  if (!data) throw new NotFoundError("Lote")
  return mapBatchRow(data as BatchRow)
}

// ── Geração (prompt + agente de imagem) ──────────────────────────────

interface AgentConfig {
  id: string
  model: string
  system_prompt: string
  user_template: string
}

async function loadCampaignImageConfig(admin: AdminClient): Promise<AgentConfig | null> {
  const { data } = await admin
    .from("email_agent_configs")
    .select("id, model, system_prompt, user_template")
    .eq("agent_type", "campaign_image")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as AgentConfig | null) ?? null
}

/** Lê brand identity + briefing + client_stores row de uma loja (admin direto). */
async function loadStoreContext(
  admin: AdminClient,
  storeId: string,
): Promise<{
  brand: StoreBrandIdentity | null
  briefing: StoreBriefing | null
  storeRaw: Record<string, unknown>
  storeUrl: string | null
}> {
  const [storeRes, brandRes, briefingRes] = await Promise.all([
    admin
      .from("client_stores")
      .select("id, store_name, store_url, language, currency, niche, country, tone_description, tom_de_voz")
      .eq("id", storeId)
      .maybeSingle(),
    admin
      .from("store_brand_identity")
      .select("*")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("store_briefings")
      .select("*")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const storeRaw = (storeRes.data as Record<string, unknown> | null) ?? { id: storeId }
  return {
    brand: (brandRes.data as StoreBrandIdentity | null) ?? null,
    briefing: (briefingRes.data as StoreBriefing | null) ?? null,
    storeRaw,
    storeUrl: (storeRaw.store_url as string | null) ?? null,
  }
}

/** Extrai uma headline curta da copy de produção da loja (1º heading). */
function headlineFromCopy(copy: CopyResultEntry | undefined): string {
  if (!copy) return ""
  const headingBlock = (copy.blocks ?? []).find(
    (b) => b.type === "heading" && (b.headline || "").trim(),
  )
  return (headingBlock?.headline || copy.subject || "").trim()
}

/**
 * Monta a INSTRUCAO_ADICIONAL do prompt a partir da instrução do lote,
 * das flags de adaptação ligadas (descrição textual) e — quando regerando —
 * das notas de ajuste. As flags listam EXPLICITAMENTE o que adaptar pra que
 * o modelo priorize cada faceta da marca da loja.
 *
 * A headline NÃO entra mais aqui: virou opt-in via `text_context`/template
 * (`{{#if INCLUDE_HEADLINE}}`), resolvida em `generateOneStoreImage`.
 */
function buildBatchInstruction(opts: {
  instruction: string
  flags: CampaignImageAdaptFlags
  adjustmentNotes?: string | null
}): string {
  const parts: string[] = []
  if (opts.instruction.trim()) parts.push(opts.instruction.trim())

  const adapt: string[] = []
  if (opts.flags.idioma) adapt.push("idioma/contexto cultural da loja")
  if (opts.flags.cores) adapt.push("paleta de cores da marca")
  if (opts.flags.logo) adapt.push("estilo do logo da marca")
  if (opts.flags.catalogo) adapt.push("produtos reais do catálogo da loja")
  if (adapt.length > 0) {
    parts.push(`Adaptar para esta loja: ${adapt.join(", ")}.`)
  }

  if (opts.adjustmentNotes && opts.adjustmentNotes.trim()) {
    parts.push(`AJUSTE SOLICITADO: ${opts.adjustmentNotes.trim()}`)
  }
  return parts.join("\n")
}

// ── Telemetria best-effort ───────────────────────────────────────────
// Os helpers reais (telemetry.callback) já engolem os próprios erros, mas
// envelopamos aqui também pra GARANTIR que uma exceção de telemetria nunca
// desvie a geração pro caminho de falha (nem mascare o erro original no
// caminho de erro). Telemetria é puramente aditiva.

async function safeLogRun(
  params: Parameters<typeof logGenerationRun>[0],
): Promise<string> {
  try {
    return await logGenerationRun(params)
  } catch (e) {
    log.warn("telemetry.log_failed", { error: e instanceof Error ? e.message : String(e) })
    return ""
  }
}

async function safeUpdateRun(
  runId: string,
  update: Parameters<typeof updateGenerationRun>[1],
): Promise<void> {
  try {
    await updateGenerationRun(runId, update)
  } catch (e) {
    log.warn("telemetry.update_failed", { error: e instanceof Error ? e.message : String(e) })
  }
}

/**
 * Gera UMA imagem para um (lote × loja). Constrói o contexto da loja, renderiza
 * o prompt e chama o agente de imagem. Best-effort: não lança — devolve o
 * patch de status (ready/failed) pra persistir no result.
 */
async function generateOneStoreImage(
  admin: AdminClient,
  batch: BatchRow,
  storeId: string,
  config: AgentConfig,
  production: Record<string, CopyResultEntry>,
  adjustmentNotes?: string | null,
): Promise<{ status: "ready" | "failed"; image_url: string | null; error: string | null; via: string }> {
  // Telemetria two-phase (best-effort): loga um run em email_generation_runs
  // pra esta imagem aparecer na página de logs "assim como os outros agentes".
  // runId/t0 vivem fora do try pra o caminho de erro fechar o run mesmo se a
  // falha acontecer depois do logGenerationRun. logGenerationRun nunca lança
  // (devolve "" em falha) e updateGenerationRun("") é no-op — telemetria não
  // quebra a geração.
  let runId = ""
  let t0 = Date.now()
  // Instrumentação de ingestão (preenchida pelo onMeta do agente de imagem):
  // tokens de input de imagem reportados pelo provedor + refs efetivamente
  // anexadas. Default zerado pro caminho de erro/sem-ref não quebrar.
  let meta = {
    tokensInput: 0,
    tokensOutput: 0,
    refsSent: [] as RefImage[],
  }
  try {
    const ctx = await loadStoreContext(admin, storeId)
    const topProducts = await loadTopProducts(admin, storeId, ctx.storeUrl)
    const flags = batch.adapt_flags ?? {}
    const headline = headlineFromCopy(production[storeId])

    const instrucaoAdicional = buildBatchInstruction({
      instruction: batch.instruction,
      flags,
      adjustmentNotes,
    })

    const aspect = FORMAT_TO_ASPECT[batch.format] ?? "4:3"

    // Referências visuais por URL que o modelo vai ENXERGAR (não só descrição
    // textual): a imagem-base do lote sempre; o LOGO quando adapt_flags.logo;
    // a foto do produto-herói quando adapt_flags.catalogo. Logo via
    // pickBrandLogo (fallback multi-variante main→alt→monogram→reverse,
    // prefere PNG por ingeribilidade). Refs guardam contra URL vazia.
    const refs: RefImage[] = []
    if (batch.reference_image_url) {
      refs.push({ label: "Base reference:", url: batch.reference_image_url })
    }
    if (flags.logo) {
      const picked = pickBrandLogo(ctx.brand, "png")
      if (picked) refs.push({ label: "Brand logo — match this exactly:", url: picked.url })
    }
    if (flags.catalogo) {
      const productImg = topProducts[0]?.image_url
      if (productImg) {
        refs.push({ label: "Hero product — reproduce faithfully:", url: productImg })
      }
    }
    const hasRef = refs.length > 0
    const mode = hasRef ? "product_ref" : "text2img"

    const vars = buildImagePromptVars({
      brand: ctx.brand,
      briefing: ctx.briefing,
      topProducts,
      storeRaw: ctx.storeRaw,
      blockPurpose: `campaign image (${batch.format})`,
      instrucaoAdicional,
      aspect,
      mode,
    })

    // Contexto textual OPT-IN: para cada campo ligado, computa INCLUDE_* +
    // valor (override custom OU dado real da loja) e mescla por cima das
    // vars-base. Campo desligado => INCLUDE="" (falsy no renderer) + valor "".
    const tc = batch.text_context ?? {}
    const resolve = (
      f: CampaignImageTextField | undefined,
      storeVal: string,
    ): [string, string] => {
      if (!f?.include) return ["", ""]
      const v = (f.value?.trim() || storeVal || "").trim()
      return [v ? "true" : "", v]
    }
    const [INCLUDE_NICHO, NICHO] = resolve(tc.nicho, vars.nicho ?? "")
    const [INCLUDE_PUBLICO, PUBLICO] = resolve(tc.publico, vars.PUBLICO ?? "")
    const [INCLUDE_TOM, TOM_VOZ] = resolve(tc.tom, vars.tom_voz ?? "")
    const [INCLUDE_MOEDA, MOEDA] = resolve(tc.moeda, vars.MOEDA ?? "")
    const IDIOMA = INCLUDE_MOEDA ? (vars.IDIOMA ?? "") : ""
    const [INCLUDE_HEADLINE, HEADLINE] = resolve(tc.headline, headline)

    const finalVars = {
      ...vars,
      INCLUDE_NICHO,
      NICHO,
      INCLUDE_PUBLICO,
      PUBLICO,
      INCLUDE_TOM,
      TOM_VOZ,
      INCLUDE_MOEDA,
      MOEDA,
      IDIOMA,
      INCLUDE_HEADLINE,
      HEADLINE,
    }

    const prompt = renderImageTemplate(config.user_template, finalVars)

    t0 = Date.now()
    runId = await safeLogRun({
      storeId,
      batchId: batch.id,
      agent: "campaign_image",
      agentConfigId: config.id,
      status: "running",
      model: config.model,
      // refs_sent prova o wiring na UI de logs independente do provedor
      // reportar token de imagem (o delta de tokens é a prova adicional).
      inputVars: {
        format: batch.format,
        store_id: storeId,
        batch_id: batch.id,
        mode,
        refs_sent: refs.map((r) => ({ label: r.label, url: r.url })),
      },
      renderedPrompt: prompt,
    })

    const imageUrl = await generateEmailImage(prompt, storeId, {
      aspect,
      mode,
      // A imagem-base agora viaja como a 1ª ref rotulada (não mais
      // referenceImageUrl) — logo+produto seguem junto via adapt_flags.
      referenceImages: hasRef ? refs : undefined,
      systemPrompt: config.system_prompt || undefined,
      model: config.model,
      onMeta: (m) => {
        meta = m
      },
    })

    await safeUpdateRun(runId, {
      status: "success",
      durationMs: Date.now() - t0,
      tokensInput: meta.tokensInput,
      tokensOutput: meta.tokensOutput,
    })

    return {
      status: "ready",
      image_url: imageUrl,
      error: null,
      via: `campaign_image:${config.model}`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn("generate.store.failed", { batchId: batch.id, storeId, error: message })
    // Fecha o run (mapeia o 'failed' do service pro status 'error' do runs —
    // o CHECK aceita running|success|error|skipped, não 'failed'). No-op se
    // runId == "" (falha antes do logGenerationRun).
    await safeUpdateRun(runId, {
      status: "error",
      durationMs: Date.now() - t0,
      errorMessage: message.slice(0, 500),
    })
    return { status: "failed", image_url: null, error: message.slice(0, 500), via: "campaign_image" }
  }
}

/** Limitador de concorrência simples (pool de Promises). */
async function runWithPool<T>(
  items: T[],
  poolSize: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0
  async function next(): Promise<void> {
    const idx = cursor++
    if (idx >= items.length) return
    await worker(items[idx])
    await next()
  }
  const runners = Array.from({ length: Math.min(poolSize, items.length) }, () => next())
  await Promise.all(runners)
}

/** Upsert (queued) dos results de um lote pras lojas-alvo e marca generating. */
async function seedResults(
  admin: AdminClient,
  batchId: string,
  storeIds: string[],
): Promise<void> {
  const rows = storeIds.map((store_id) => ({
    batch_id: batchId,
    store_id,
    status: "generating" as const,
    error_message: null,
    generated_at: null,
    // Gerar o lote inteiro NÃO reaplica notas de ajuste por loja
    // (generateBatch chama generateOneStoreImage sem notas). Zeramos a nota
    // antiga pra não exibir um ajuste que a imagem nova ignorou.
    adjustment_notes: null,
  }))
  // onConflict (batch_id, store_id): re-gerar reusa a linha existente.
  const { error } = await admin
    .from("campaign_image_results")
    .upsert(rows, { onConflict: "batch_id,store_id" })
  if (error) throw error
}

/**
 * Gera o lote inteiro: para CADA loja-alvo da campanha, gera a imagem
 * adaptada. Marca generating→ready/failed por loja. Retorna o lote com os
 * resultados atualizados. As gerações rodam com um pool de concorrência.
 */
export async function generateBatch(
  batchId: string,
  orgId: string,
): Promise<CampaignImageBatchWithResults> {
  const admin = createAdminClient()

  const { data: batchData } = await admin
    .from("campaign_image_batches")
    .select("*")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!batchData) throw new NotFoundError("Lote")
  const batch = batchData as BatchRow

  const sug = await loadSuggestion(admin, batch.suggestion_id, orgId)
  const storeIds = sug.targets.map((t) => t.store_id)
  if (storeIds.length === 0) {
    throw new ValidationError("Campanha sem lojas-alvo")
  }

  const config = await loadCampaignImageConfig(admin)
  if (!config) {
    throw new ValidationError(
      "Agente campaign_image não configurado (email_agent_configs)",
    )
  }

  await seedResults(admin, batchId, storeIds)

  await runWithPool(storeIds, GENERATION_POOL_SIZE, async (storeId) => {
    const res = await generateOneStoreImage(
      admin,
      batch,
      storeId,
      config,
      sug.production,
    )
    await admin
      .from("campaign_image_results")
      .update({
        status: res.status,
        // Em falha preserva a imagem anterior (undefined = não toca a coluna),
        // igual ao regenerateResult — evita perder um resultado bom por uma
        // falha transitória numa loja durante a geração do lote.
        image_url: res.image_url ?? undefined,
        error_message: res.error,
        generated_via: res.via,
        generated_at: res.status === "ready" ? new Date().toISOString() : null,
      })
      .eq("batch_id", batchId)
      .eq("store_id", storeId)
  })

  return loadBatchWithResults(admin, batchId, orgId)
}

/**
 * Regera UMA loja de um lote, opcionalmente com nota de ajuste (apensada ao
 * prompt). Usado por "Regerar com ajuste" e "Tentar de novo" (sem nota).
 */
export async function regenerateResult(
  batchId: string,
  orgId: string,
  storeId: string,
  adjustmentNotes?: string | null,
): Promise<CampaignImageResult> {
  const admin = createAdminClient()

  const { data: batchData } = await admin
    .from("campaign_image_batches")
    .select("*")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!batchData) throw new NotFoundError("Lote")
  const batch = batchData as BatchRow

  const sug = await loadSuggestion(admin, batch.suggestion_id, orgId)
  if (!sug.targets.some((t) => t.store_id === storeId)) {
    throw new ValidationError("Loja não pertence à campanha")
  }

  const config = await loadCampaignImageConfig(admin)
  if (!config) {
    throw new ValidationError("Agente campaign_image não configurado")
  }

  const notes = adjustmentNotes?.trim() || null

  // Marca generating (e persiste a nota de ajuste, se houver).
  await admin
    .from("campaign_image_results")
    .upsert(
      {
        batch_id: batchId,
        store_id: storeId,
        status: "generating",
        adjustment_notes: notes,
        error_message: null,
        generated_at: null,
      },
      { onConflict: "batch_id,store_id" },
    )

  const res = await generateOneStoreImage(
    admin,
    batch,
    storeId,
    config,
    sug.production,
    notes,
  )

  // Se houve nota de ajuste e a geração foi OK, marca 'adjustment' (revisado),
  // senão 'ready'. Falha vira 'failed'.
  const finalStatus: CampaignImageResultStatus =
    res.status === "failed" ? "failed" : notes ? "adjustment" : "ready"

  const { data } = await admin
    .from("campaign_image_results")
    .update({
      status: finalStatus,
      image_url: res.image_url ?? undefined,
      error_message: res.error,
      generated_via: res.via,
      generated_at: res.status === "ready" ? new Date().toISOString() : null,
    })
    .eq("batch_id", batchId)
    .eq("store_id", storeId)
    .select(
      "id, batch_id, store_id, status, image_url, adjustment_notes, error_message, generated_via, generated_at",
    )
    .maybeSingle()

  const meta = await loadStoreMeta(admin, [storeId])
  return mapResultRow(data as ResultRow, meta)
}

/** Recarrega 1 lote + resultados (usado após geração). */
async function loadBatchWithResults(
  admin: AdminClient,
  batchId: string,
  orgId: string,
): Promise<CampaignImageBatchWithResults> {
  const { data: batchData } = await admin
    .from("campaign_image_batches")
    .select("*")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!batchData) throw new NotFoundError("Lote")
  const batch = batchData as BatchRow

  const { data: resultRows } = await admin
    .from("campaign_image_results")
    .select(
      "id, batch_id, store_id, status, image_url, adjustment_notes, error_message, generated_via, generated_at",
    )
    .eq("batch_id", batchId)

  const storeIds = ((resultRows as ResultRow[] | null) ?? []).map((r) => r.store_id)
  const meta = await loadStoreMeta(admin, storeIds)
  const results = ((resultRows as ResultRow[] | null) ?? []).map((r) =>
    mapResultRow(r, meta),
  )

  return { ...mapBatchRow(batch), results }
}
