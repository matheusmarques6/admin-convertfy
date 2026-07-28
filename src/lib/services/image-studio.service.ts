/**
 * Estúdio de Geração de Imagens (/admin/imagens) — service.
 *
 * Domínio PARALELO à geração de campanha (campaign-image-generation.service):
 * mesma mecânica (lotes → pool de gerações → polling), MESMO motor de imagem
 * (agente `campaign_image` de email_agent_configs + image.chain + prompt-vars
 * do pipeline de email), mas tabelas próprias (image_studio_*), seleção LIVRE
 * de lojas por lote e N VARIAÇÕES por loja (cada uma com direção opcional).
 *
 * Zero ligação de dados com campaign_image_batches/results — o service de
 * campanha não é importado nem alterado; os blocos de baixo nível reusados
 * (generateEmailImage, buildImagePromptVars, renderImageTemplate,
 * loadTopProducts, pickBrandLogo, telemetria) já são módulos compartilhados.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { NotFoundError, ValidationError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { generateEmailImage, type RefImage } from "@/lib/agents/chains/image.chain"
import { renderImageTemplate } from "@/lib/agents/image/template-renderer"
import { buildImagePromptVars } from "@/lib/agents/image/prompt-vars-builder"
import { loadTopProducts } from "@/lib/agents/top-products"
import { pickBrandLogo } from "@/lib/brand/pick-logo"
import { isUsableProductImage } from "@/lib/agents/image/product-image-guard"
import {
  logGenerationRun,
  updateGenerationRun,
} from "@/lib/agents/callbacks/telemetry.callback"
import type { AspectKey } from "@/lib/agents/image/aspect-ratio"
import type { StoreBrandIdentity, StoreBriefing } from "@/types/email-workspace"
import type {
  ImageStudioAdaptFlags,
  ImageStudioBatch,
  ImageStudioBatchWithResults,
  ImageStudioFormat,
  ImageStudioReferenceMode,
  ImageStudioResult,
  ImageStudioResultStatus,
  ImageStudioStore,
  ImageStudioStoreSpec,
  ImageStudioTextContext,
  ImageStudioTextField,
  ImageStudioVariation,
} from "@/types/image-studio"

const log = logger.child("ImageStudio")

type AdminClient = ReturnType<typeof createAdminClient>

/** Concorrência máxima de gerações simultâneas (mesmo limite da campanha). */
const GENERATION_POOL_SIZE = 3

/** Teto de variações por loja num lote (sanidade de custo/UX). */
export const MAX_VARIATIONS = 8

const FORMAT_TO_ASPECT: Record<ImageStudioFormat, AspectKey> = {
  hero: "4:3",
  square: "1:1",
  story: "3:5",
  portrait: "4:5",
  landscape: "16:9",
  banner: "2:1",
  vertical: "9:16",
}

const VALID_FORMATS: ImageStudioFormat[] = [
  "hero",
  "square",
  "story",
  "portrait",
  "landscape",
  "banner",
  "vertical",
]

export function isImageStudioFormat(v: unknown): v is ImageStudioFormat {
  return typeof v === "string" && VALID_FORMATS.includes(v as ImageStudioFormat)
}

/**
 * Normaliza o array de variações vindo do cliente: garante 1..MAX_VARIATIONS
 * entradas, strings aparadas. Pura, testável.
 */
export function normalizeVariations(raw: unknown): ImageStudioVariation[] {
  const list = Array.isArray(raw) ? raw : []
  const out: ImageStudioVariation[] = []
  for (const item of list.slice(0, MAX_VARIATIONS)) {
    if (item && typeof item === "object") {
      const v = item as Record<string, unknown>
      out.push({
        label: typeof v.label === "string" ? v.label.trim().slice(0, 60) : undefined,
        direction:
          typeof v.direction === "string" ? v.direction.trim().slice(0, 1000) : undefined,
      })
    } else {
      out.push({})
    }
  }
  return out.length > 0 ? out : [{}]
}

/** Teto do adendo por loja (o prompt inteiro precisa caber com folga). */
export const MAX_STORE_SPEC_CHARS = 1000

/** Teto de imagens-base por lote (cada ref é baixada pelo provedor). */
export const MAX_REFERENCE_IMAGES = 6

/**
 * Normaliza a lista de imagens-base: apara, descarta vazios, deduplica
 * (mesma URL duas vezes só confundiria o modelo) e corta no teto. Pura.
 */
export function normalizeReferenceUrls(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set<string>()
  for (const item of list) {
    if (typeof item !== "string") continue
    const url = item.trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    if (seen.size >= MAX_REFERENCE_IMAGES) break
  }
  return Array.from(seen)
}

/**
 * Imagens-base efetivas de UMA geração, conforme o modo do lote:
 *  - "all"           → todas (o modelo vê o conjunto inteiro)
 *  - "per_variation" → só a imagem (variationIndex mod N), para cada
 *    variação nascer ancorada numa referência diferente; o ciclo repete
 *    quando há mais variações que imagens.
 * Pura, testável.
 */
export function pickReferenceUrls(
  urls: string[],
  mode: ImageStudioReferenceMode,
  variationIndex: number,
): string[] {
  if (urls.length === 0) return []
  if (mode !== "per_variation") return urls
  const i = ((variationIndex % urls.length) + urls.length) % urls.length
  return [urls[i]]
}

/**
 * Normaliza o mapa de adendos por loja: apara textos, corta no teto e
 * DESCARTA entradas vazias — apagar o texto na UI equivale a remover o
 * adendo. Chaves de lojas fora do lote são preservadas aqui (inofensivas:
 * a geração só lê as lojas que está gerando) mas não atrapalham. Pura.
 */
export function normalizeStoreSpecs(raw: unknown): Record<string, ImageStudioStoreSpec> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, ImageStudioStoreSpec> = {}
  for (const [storeId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue
    const instruction = (value as Record<string, unknown>).instruction
    const text = typeof instruction === "string" ? instruction.trim() : ""
    if (!text) continue
    out[storeId] = { instruction: text.slice(0, MAX_STORE_SPEC_CHARS) }
  }
  return out
}

/**
 * Direção efetiva de uma variação para o prompt. Vazia = variação livre:
 * instrui o modelo a variar composição/ângulo/cenário mantendo o brief.
 * Pura, testável.
 */
export function variationDirective(
  variations: ImageStudioVariation[],
  index: number,
): string {
  const v = variations[index]
  const direction = v?.direction?.trim()
  if (direction) return `VARIAÇÃO ${index + 1}: ${direction}`
  if (variations.length <= 1) return ""
  return `VARIAÇÃO ${index + 1} de ${variations.length}: crie uma composição DIFERENTE das demais variações (outro ângulo, enquadramento ou cenário), mantendo o mesmo brief e a mesma identidade da marca.`
}

/** Chave de um resultado dentro do lote (loja × variação). Pura. */
export function resultKey(storeId: string, variationIndex: number): string {
  return `${storeId}:${variationIndex}`
}

/**
 * Conjunto de chaves APROVADAS — a geração do lote pula estes pares.
 * Pura, testável.
 */
export function approvedKeySet(
  rows: Array<{ store_id: string; variation_index: number }>,
): Set<string> {
  return new Set(rows.map((r) => resultKey(r.store_id, r.variation_index)))
}

// ── Tipos internos de linha ──────────────────────────────────────────

interface BatchRow {
  id: string
  org_id: string
  name: string
  format: ImageStudioFormat
  instruction: string
  reference_image_url: string | null // deprecada — fallback de leitura
  reference_image_urls: string[] | null
  reference_mode: ImageStudioReferenceMode | null
  adapt_flags: ImageStudioAdaptFlags | null
  text_context: ImageStudioTextContext | null
  store_ids: string[] | null
  variations: ImageStudioVariation[] | null
  store_specs: Record<string, ImageStudioStoreSpec> | null
  created_at: string
  updated_at: string
}

interface ResultRow {
  id: string
  batch_id: string
  store_id: string
  variation_index: number
  status: ImageStudioResultStatus
  image_url: string | null
  adjustment_notes: string | null
  error_message: string | null
  generated_via: string | null
  generated_at: string | null
  approved_at: string | null
  updated_at: string
}

interface StoreMeta {
  store_id: string
  store_name: string
  country: string
  language: string | null
  logo_url: string | null
  primary_color: string | null
}

const RESULT_COLS =
  "id, batch_id, store_id, variation_index, status, image_url, adjustment_notes, error_message, generated_via, generated_at, approved_at, updated_at"

function mapBatchRow(row: BatchRow): ImageStudioBatch {
  return {
    id: row.id,
    name: row.name,
    format: row.format,
    instruction: row.instruction,
    // Array é a fonte; lote antigo (pré-20260732) cai na coluna singular.
    reference_image_urls: normalizeReferenceUrls(
      row.reference_image_urls?.length
        ? row.reference_image_urls
        : row.reference_image_url
          ? [row.reference_image_url]
          : [],
    ),
    reference_mode: row.reference_mode === "per_variation" ? "per_variation" : "all",
    adapt_flags: row.adapt_flags ?? {},
    text_context: row.text_context ?? {},
    store_ids: row.store_ids ?? [],
    variations: normalizeVariations(row.variations),
    store_specs: normalizeStoreSpecs(row.store_specs),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function mapResultRow(row: ResultRow, meta: Map<string, StoreMeta>): ImageStudioResult {
  const m = meta.get(row.store_id)
  return {
    id: row.id,
    batch_id: row.batch_id,
    store_id: row.store_id,
    store_name: m?.store_name ?? "Loja",
    country: m?.country ?? "",
    language: m?.language ?? null,
    variation_index: row.variation_index,
    status: row.status,
    image_url: row.image_url,
    adjustment_notes: row.adjustment_notes,
    error_message: row.error_message,
    generated_at: row.generated_at,
    approved_at: row.approved_at,
    updated_at: row.updated_at,
  }
}

// ── Lojas e metadados ────────────────────────────────────────────────

/** Lojas ativas da org para o seletor (nome, país, logo, cor). */
export async function listEligibleStores(orgId: string): Promise<ImageStudioStore[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("client_stores")
    .select("id, store_name, country, language, niche")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("store_name")
    .limit(500)

  const stores = (data ?? []) as Array<{
    id: string
    store_name: string | null
    country: string | null
    language: string | null
    niche: string | null
  }>
  const meta = await loadStoreMeta(
    admin,
    stores.map((s) => s.id),
  )
  return stores.map((s) => ({
    store_id: s.id,
    store_name: s.store_name ?? "Loja",
    country: s.country ?? "",
    language: s.language ?? null,
    niche: s.niche ?? null,
    logo_url: meta.get(s.id)?.logo_url ?? null,
    primary_color: meta.get(s.id)?.primary_color ?? null,
  }))
}

/** Metadados de marca por loja (logo + cor primária) — espelho da campanha. */
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
    meta.logo_url = pickBrandLogo(b, "png")?.url ?? null
    meta.primary_color = b.colors_primary?.[0]?.hex ?? null
  }

  return map
}

// ── CRUD de lotes ────────────────────────────────────────────────────

export async function listBatches(orgId: string): Promise<ImageStudioBatchWithResults[]> {
  const admin = createAdminClient()
  const { data: batchRows } = await admin
    .from("image_studio_batches")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(100)

  const batches = (batchRows as BatchRow[] | null) ?? []
  const batchIds = batches.map((b) => b.id)
  const allStoreIds = new Set<string>()
  for (const b of batches) for (const id of b.store_ids ?? []) allStoreIds.add(id)

  let resultsByBatch = new Map<string, ResultRow[]>()
  if (batchIds.length > 0) {
    const { data: resultRows } = await admin
      .from("image_studio_results")
      .select(RESULT_COLS)
      .in("batch_id", batchIds)
    resultsByBatch = new Map()
    for (const r of (resultRows as ResultRow[] | null) ?? []) {
      allStoreIds.add(r.store_id)
      const list = resultsByBatch.get(r.batch_id) ?? []
      list.push(r)
      resultsByBatch.set(r.batch_id, list)
    }
  }

  const meta = await loadStoreMeta(admin, Array.from(allStoreIds))
  return batches.map((b) => ({
    ...mapBatchRow(b),
    results: (resultsByBatch.get(b.id) ?? [])
      .sort((a, z) => a.variation_index - z.variation_index)
      .map((r) => mapResultRow(r, meta)),
  }))
}

export interface BatchInput {
  name?: string
  format?: ImageStudioFormat
  instruction?: string
  reference_image_urls?: string[]
  reference_mode?: ImageStudioReferenceMode
  adapt_flags?: ImageStudioAdaptFlags
  text_context?: ImageStudioTextContext
  store_ids?: string[]
  variations?: ImageStudioVariation[]
  store_specs?: Record<string, ImageStudioStoreSpec>
}

export async function createBatch(
  orgId: string,
  input: BatchInput,
  createdBy: string | null,
): Promise<ImageStudioBatchWithResults> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("image_studio_batches")
    .insert({
      org_id: orgId,
      name: input.name?.trim() || "Novo lote",
      format: input.format ?? "hero",
      instruction: input.instruction?.trim() ?? "",
      reference_image_urls: normalizeReferenceUrls(input.reference_image_urls ?? []),
      reference_mode: input.reference_mode ?? "all",
      adapt_flags: input.adapt_flags ?? {},
      text_context: input.text_context ?? {},
      store_ids: input.store_ids ?? [],
      variations: normalizeVariations(input.variations ?? [{}]),
      store_specs: normalizeStoreSpecs(input.store_specs ?? {}),
      created_by: createdBy,
    })
    .select("*")
    .single()

  if (error) throw error
  log.info("batch.created", { orgId, batchId: (data as BatchRow).id })
  return { ...mapBatchRow(data as BatchRow), results: [] }
}

export async function updateBatch(
  batchId: string,
  orgId: string,
  input: BatchInput,
): Promise<ImageStudioBatch> {
  const admin = createAdminClient()
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name.trim() || "Novo lote"
  if (input.format !== undefined) patch.format = input.format
  if (input.instruction !== undefined) patch.instruction = input.instruction.trim()
  if (input.reference_image_urls !== undefined) {
    patch.reference_image_urls = normalizeReferenceUrls(input.reference_image_urls)
  }
  if (input.reference_mode !== undefined) patch.reference_mode = input.reference_mode
  if (input.adapt_flags !== undefined) patch.adapt_flags = input.adapt_flags
  if (input.text_context !== undefined) patch.text_context = input.text_context
  if (input.store_ids !== undefined) patch.store_ids = input.store_ids
  if (input.variations !== undefined) {
    patch.variations = normalizeVariations(input.variations)
  }
  if (input.store_specs !== undefined) {
    patch.store_specs = normalizeStoreSpecs(input.store_specs)
  }

  const { data, error } = await admin
    .from("image_studio_batches")
    .update(patch)
    .eq("id", batchId)
    .eq("org_id", orgId)
    .select("*")
    .maybeSingle()

  if (error) throw error
  if (!data) throw new NotFoundError("Lote")
  return mapBatchRow(data as BatchRow)
}

/** Exclui o lote + imagens do storage (best-effort no storage). */
export async function deleteBatch(batchId: string, orgId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: batch } = await admin
    .from("image_studio_batches")
    .select("id, org_id")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!batch) throw new NotFoundError("Lote")

  // Best-effort: remove os arquivos da pasta do lote. Imagens geradas pelo
  // image.chain vivem em paths próprios por loja — só a pasta do estúdio
  // (imagem-base) é removida aqui; as geradas expiram com as signed URLs.
  try {
    const prefix = `image-studio/${orgId}/${batchId}`
    const { data: files } = await admin.storage
      .from("onboarding-visual-assets")
      .list(prefix)
    if (files && files.length > 0) {
      await admin.storage
        .from("onboarding-visual-assets")
        .remove(files.map((f) => `${prefix}/${f.name}`))
    }
  } catch (e) {
    log.warn("batch.delete.storage_failed", {
      batchId,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  const { error } = await admin
    .from("image_studio_batches")
    .delete()
    .eq("id", batchId)
    .eq("org_id", orgId)
  if (error) throw error
  log.info("batch.deleted", { batchId })
}

// ── Geração ──────────────────────────────────────────────────────────

interface AgentConfig {
  id: string
  model: string
  system_prompt: string
  user_template: string
}

async function loadImageAgentConfig(admin: AdminClient): Promise<AgentConfig | null> {
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
      .select(
        "id, store_name, store_url, language, currency, niche, country, tone_description, tom_de_voz",
      )
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

/**
 * INSTRUCAO_ADICIONAL: instrução-base + direção da variação + flags de
 * adaptação + (regeração) notas de ajuste na frente. Pura, testável.
 */
export function buildStudioInstruction(opts: {
  instruction: string
  variationText: string
  flags: ImageStudioAdaptFlags
  /** Adendo desta loja (store_specs) — acrescenta ao brief base. */
  storeSpec?: string | null
  adjustmentNotes?: string | null
}): string {
  const parts: string[] = []
  if (opts.instruction.trim()) parts.push(opts.instruction.trim())
  if (opts.variationText.trim()) parts.push(opts.variationText.trim())
  // Depois da variação de propósito: o mais específico é lido por último e
  // os modelos de imagem dão peso ao fim do prompt.
  if (opts.storeSpec?.trim()) {
    parts.push(`ESPECÍFICO DESTA LOJA: ${opts.storeSpec.trim()}`)
  }

  const adapt: string[] = []
  if (opts.flags.idioma) adapt.push("idioma/contexto cultural da loja")
  if (opts.flags.cores) adapt.push("paleta de cores da marca")
  if (opts.flags.logo) adapt.push("estilo do logo da marca")
  if (opts.flags.catalogo) adapt.push("produtos reais do catálogo da loja")
  if (adapt.length > 0) {
    parts.push(`Adaptar para esta loja: ${adapt.join(", ")}.`)
  }

  if (opts.adjustmentNotes && opts.adjustmentNotes.trim()) {
    parts.unshift(
      `AJUSTE OBRIGATÓRIO (prioridade máxima — aplique esta mudança acima de tudo, mesmo que difira da imagem de referência): ${opts.adjustmentNotes.trim()}`,
    )
  }
  return parts.join("\n")
}

/** Valida refs em paralelo, descartando só as definitivamente ruins. */
async function filterUsableRefs(refs: RefImage[]): Promise<RefImage[]> {
  if (refs.length === 0) return refs
  const checks = await Promise.all(
    refs.map((r) => isUsableProductImage(r.url, undefined, { rasterOnly: true })),
  )
  const kept: RefImage[] = []
  refs.forEach((r, i) => {
    const c = checks[i]
    const definitivelyBad =
      !c.usable &&
      (c.reason === "not_image" ||
        c.reason === "svg_not_raster" ||
        c.reason === "missing_or_invalid_url" ||
        (typeof c.status === "number" && c.status >= 400 && c.status < 500))
    if (definitivelyBad) {
      log.warn("generate.ref.dropped", { label: r.label, url: r.url, reason: c.reason })
    } else {
      kept.push(r)
    }
  })
  return kept
}

async function safeLogRun(params: Parameters<typeof logGenerationRun>[0]): Promise<string> {
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
 * Gera UMA imagem (lote × loja × variação). Best-effort: nunca lança —
 * devolve o patch de status pra persistir no result.
 */
async function generateOneImage(
  admin: AdminClient,
  batch: BatchRow,
  storeId: string,
  variationIndex: number,
  config: AgentConfig,
  adjustmentNotes?: string | null,
): Promise<{ status: "ready" | "failed"; image_url: string | null; error: string | null; via: string }> {
  let runId = ""
  let t0 = Date.now()
  let meta = { tokensInput: 0, tokensOutput: 0, costCents: 0, refsSent: [] as RefImage[] }
  try {
    const ctx = await loadStoreContext(admin, storeId)
    const topProducts = await loadTopProducts(admin, storeId, ctx.storeUrl)
    const flags = batch.adapt_flags ?? {}
    const variations = normalizeVariations(batch.variations)

    const storeSpec = normalizeStoreSpecs(batch.store_specs)[storeId]?.instruction ?? null

    const instrucaoAdicional = buildStudioInstruction({
      instruction: batch.instruction,
      variationText: variationDirective(variations, variationIndex),
      flags,
      storeSpec,
      adjustmentNotes,
    })

    const aspect = FORMAT_TO_ASPECT[batch.format] ?? "4:3"

    // Imagens-base do lote conforme o modo: 'all' manda todas,
    // 'per_variation' manda só a que cabe a esta variação (i mod N).
    const allRefUrls = normalizeReferenceUrls(
      batch.reference_image_urls?.length
        ? batch.reference_image_urls
        : batch.reference_image_url
          ? [batch.reference_image_url]
          : [],
    )
    const refUrls = pickReferenceUrls(
      allRefUrls,
      batch.reference_mode === "per_variation" ? "per_variation" : "all",
      variationIndex,
    )

    const candidateRefs: RefImage[] = []
    refUrls.forEach((url, i) => {
      // Com ajuste, a base vira guia solto — senão o modelo copia a
      // referência e ignora o ajuste pedido.
      const baseLabel = adjustmentNotes?.trim()
        ? "Previous composition — loose guide ONLY; you MUST apply the requested change below, do not copy it:"
        : refUrls.length > 1
          ? `Base reference ${i + 1} of ${refUrls.length}:`
          : "Base reference:"
      candidateRefs.push({ label: baseLabel, url })
    })
    if (flags.logo) {
      const picked = pickBrandLogo(ctx.brand, "png", { rasterOnly: true })
      if (picked) candidateRefs.push({ label: "Brand logo — match this exactly:", url: picked.url })
    }
    if (flags.catalogo) {
      const productImg = topProducts[0]?.image_url
      if (productImg) {
        candidateRefs.push({ label: "Hero product — reproduce faithfully:", url: productImg })
      }
    }
    const refs = await filterUsableRefs(candidateRefs)
    const hasRef = refs.length > 0
    const mode = hasRef ? "product_ref" : "text2img"

    const vars = buildImagePromptVars({
      brand: ctx.brand,
      briefing: ctx.briefing,
      topProducts,
      storeRaw: ctx.storeRaw,
      blockPurpose: `studio image (${batch.format})`,
      instrucaoAdicional,
      aspect,
      mode,
    })

    // Contexto textual opt-in (mesma resolução da campanha; headline aqui é
    // sempre valor custom — não existe copy de produção no estúdio).
    const tc = batch.text_context ?? {}
    const resolve = (
      f: ImageStudioTextField | undefined,
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
    const [INCLUDE_HEADLINE, HEADLINE] = resolve(tc.headline, "")

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
      inputVars: {
        source: "image_studio",
        format: batch.format,
        store_id: storeId,
        batch_id: batch.id,
        variation_index: variationIndex,
        has_store_spec: !!storeSpec,
        reference_mode: batch.reference_mode ?? "all",
        reference_images: refUrls.length,
        mode,
        refs_sent: refs.map((r) => ({ label: r.label, url: r.url })),
      },
      renderedPrompt: prompt,
    })

    const imageUrl = await generateEmailImage(prompt, storeId, {
      aspect,
      mode,
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
      costCents: meta.costCents,
    })

    return {
      status: "ready",
      image_url: imageUrl,
      error: null,
      via: `image_studio:${config.model}`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn("generate.item.failed", {
      batchId: batch.id,
      storeId,
      variationIndex,
      error: message,
    })
    await safeUpdateRun(runId, {
      status: "error",
      durationMs: Date.now() - t0,
      errorMessage: message.slice(0, 500),
    })
    return { status: "failed", image_url: null, error: message.slice(0, 500), via: "image_studio" }
  }
}

/** Pool simples de Promises (espelho da campanha). */
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

/**
 * Gera o lote (ou um SUBSET de lojas — chunking do frontend contra o teto de
 * 300s da função): para cada loja × variação, gera a imagem adaptada.
 * Marca generating→ready/failed por item; reconciliação fecha sobras.
 */
export async function generateBatch(
  batchId: string,
  orgId: string,
  storeSubset?: string[],
): Promise<ImageStudioBatchWithResults> {
  const admin = createAdminClient()

  const { data: batchData } = await admin
    .from("image_studio_batches")
    .select("*")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!batchData) throw new NotFoundError("Lote")
  const batch = batchData as BatchRow

  const selected = batch.store_ids ?? []
  if (selected.length === 0) throw new ValidationError("Selecione ao menos uma loja")

  // Subset (chunking) precisa ser um recorte da seleção do lote.
  const storeIds = storeSubset?.length
    ? selected.filter((id) => storeSubset.includes(id))
    : selected
  if (storeIds.length === 0) {
    throw new ValidationError("Nenhuma loja do subset pertence ao lote")
  }

  const config = await loadImageAgentConfig(admin)
  if (!config) {
    throw new ValidationError("Agente campaign_image não configurado (email_agent_configs)")
  }

  const variations = normalizeVariations(batch.variations)

  // Aprovadas ficam CONGELADAS: não entram no seed nem no pool — gerar o
  // lote de novo preserva o que o operador já validou (e não paga por elas).
  const { data: approvedRows } = await admin
    .from("image_studio_results")
    .select("store_id, variation_index")
    .eq("batch_id", batchId)
    .not("approved_at", "is", null)
  const approved = approvedKeySet(
    (approvedRows as Array<{ store_id: string; variation_index: number }> | null) ?? [],
  )

  const items: Array<{ storeId: string; variationIndex: number }> = []
  for (const storeId of storeIds) {
    for (let i = 0; i < variations.length; i++) {
      if (approved.has(resultKey(storeId, i))) continue
      items.push({ storeId, variationIndex: i })
    }
  }
  if (items.length === 0) {
    log.info("generate.all_approved", { batchId, storeIds: storeIds.length })
    return loadBatchWithResults(admin, batchId, orgId)
  }

  // Seed: upsert (batch, store, variation) → generating; zera nota antiga.
  const rows = items.map((it) => ({
    batch_id: batchId,
    store_id: it.storeId,
    variation_index: it.variationIndex,
    status: "generating" as const,
    error_message: null,
    generated_at: null,
    adjustment_notes: null,
  }))
  const { error: seedErr } = await admin
    .from("image_studio_results")
    .upsert(rows, { onConflict: "batch_id,store_id,variation_index" })
  if (seedErr) throw seedErr

  await runWithPool(items, GENERATION_POOL_SIZE, async (it) => {
    try {
      const res = await generateOneImage(
        admin,
        batch,
        it.storeId,
        it.variationIndex,
        config,
      )
      await admin
        .from("image_studio_results")
        .update({
          status: res.status,
          image_url: res.image_url ?? undefined,
          error_message: res.error,
          generated_via: res.via,
          generated_at: res.status === "ready" ? new Date().toISOString() : null,
        })
        .eq("batch_id", batchId)
        .eq("store_id", it.storeId)
        .eq("variation_index", it.variationIndex)
    } catch (err) {
      log.error("generate.item.unexpected", {
        batchId,
        storeId: it.storeId,
        variationIndex: it.variationIndex,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // Reconciliação: nada fica preso em generating (só do subset gerado agora).
  await admin
    .from("image_studio_results")
    .update({ status: "failed", error_message: "Geração interrompida" })
    .eq("batch_id", batchId)
    .eq("status", "generating")
    .is("approved_at", null)
    .in("store_id", storeIds)

  return loadBatchWithResults(admin, batchId, orgId)
}

/** Regera UM resultado (loja × variação), opcionalmente com nota de ajuste. */
export async function regenerateResult(
  resultId: string,
  orgId: string,
  adjustmentNotes?: string | null,
): Promise<ImageStudioResult> {
  const admin = createAdminClient()

  const { data: resultData } = await admin
    .from("image_studio_results")
    .select(RESULT_COLS)
    .eq("id", resultId)
    .maybeSingle()
  if (!resultData) throw new NotFoundError("Resultado")
  const result = resultData as ResultRow

  if (result.approved_at) {
    throw new ValidationError("Imagem aprovada — desaprove antes de regerar")
  }

  const { data: batchData } = await admin
    .from("image_studio_batches")
    .select("*")
    .eq("id", result.batch_id)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!batchData) throw new NotFoundError("Lote")
  const batch = batchData as BatchRow

  const config = await loadImageAgentConfig(admin)
  if (!config) throw new ValidationError("Agente campaign_image não configurado")

  const notes = adjustmentNotes?.trim() || null

  await admin
    .from("image_studio_results")
    .update({
      status: "generating",
      adjustment_notes: notes,
      error_message: null,
      generated_at: null,
    })
    .eq("id", resultId)

  const res = await generateOneImage(
    admin,
    batch,
    result.store_id,
    result.variation_index,
    config,
    notes,
  )

  const finalStatus: ImageStudioResultStatus =
    res.status === "failed" ? "failed" : notes ? "adjustment" : "ready"

  const { data } = await admin
    .from("image_studio_results")
    .update({
      status: finalStatus,
      image_url: res.image_url ?? undefined,
      error_message: res.error,
      generated_via: res.via,
      generated_at: res.status === "ready" ? new Date().toISOString() : null,
    })
    .eq("id", resultId)
    .select(RESULT_COLS)
    .maybeSingle()

  const meta = await loadStoreMeta(admin, [result.store_id])
  return mapResultRow(data as ResultRow, meta)
}

/**
 * Aprova (congela) ou desaprova UM resultado. Imagem aprovada não é
 * regerada pela geração do lote nem pela regeração individual.
 */
export async function setResultApproval(
  resultId: string,
  orgId: string,
  approved: boolean,
): Promise<ImageStudioResult> {
  const admin = createAdminClient()

  const { data: resultData } = await admin
    .from("image_studio_results")
    .select(RESULT_COLS)
    .eq("id", resultId)
    .maybeSingle()
  if (!resultData) throw new NotFoundError("Resultado")
  const result = resultData as ResultRow

  // Valida a org pelo lote dono (results não tem org_id).
  const { data: batch } = await admin
    .from("image_studio_batches")
    .select("id")
    .eq("id", result.batch_id)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!batch) throw new NotFoundError("Lote")

  const { data } = await admin
    .from("image_studio_results")
    .update({ approved_at: approved ? new Date().toISOString() : null })
    .eq("id", resultId)
    .select(RESULT_COLS)
    .maybeSingle()

  const meta = await loadStoreMeta(admin, [result.store_id])
  return mapResultRow(data as ResultRow, meta)
}

/** Resultados ao vivo de um lote (polling do frontend). */
export async function getBatchResults(
  batchId: string,
  orgId: string,
): Promise<ImageStudioResult[]> {
  const admin = createAdminClient()
  const { data: batch } = await admin
    .from("image_studio_batches")
    .select("id")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!batch) throw new NotFoundError("Lote")

  const { data: resultRows } = await admin
    .from("image_studio_results")
    .select(RESULT_COLS)
    .eq("batch_id", batchId)

  const rows = (resultRows as ResultRow[] | null) ?? []
  const meta = await loadStoreMeta(admin, Array.from(new Set(rows.map((r) => r.store_id))))
  return rows
    .sort((a, z) => a.variation_index - z.variation_index)
    .map((r) => mapResultRow(r, meta))
}

/** Itens prontos pra download em ZIP: `loja-variacao-N.png`. */
export async function getBatchDownloadItems(
  batchId: string,
  orgId: string,
): Promise<{
  batchName: string
  format: ImageStudioFormat
  items: Array<{ storeName: string; variationIndex: number; imageUrl: string }>
}> {
  const admin = createAdminClient()

  const { data: batchData } = await admin
    .from("image_studio_batches")
    .select("id, name, format")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; name: string; format: ImageStudioFormat }>()
  if (!batchData) throw new NotFoundError("Lote")

  const { data: resultRows } = await admin
    .from("image_studio_results")
    .select("store_id, variation_index, status, image_url")
    .eq("batch_id", batchId)

  const rows =
    (resultRows as Array<{
      store_id: string
      variation_index: number
      status: ImageStudioResultStatus
      image_url: string | null
    }> | null) ?? []

  const ready = rows.filter(
    (
      r,
    ): r is {
      store_id: string
      variation_index: number
      status: ImageStudioResultStatus
      image_url: string
    } => (r.status === "ready" || r.status === "adjustment") && !!r.image_url,
  )

  const meta = await loadStoreMeta(admin, Array.from(new Set(ready.map((r) => r.store_id))))
  const items = ready.map((r) => ({
    storeName: meta.get(r.store_id)?.store_name ?? "Loja",
    variationIndex: r.variation_index,
    imageUrl: r.image_url,
  }))

  return { batchName: batchData.name, format: batchData.format, items }
}

/** Recarrega 1 lote + resultados (pós-geração). */
async function loadBatchWithResults(
  admin: AdminClient,
  batchId: string,
  orgId: string,
): Promise<ImageStudioBatchWithResults> {
  const { data: batchData } = await admin
    .from("image_studio_batches")
    .select("*")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!batchData) throw new NotFoundError("Lote")
  const batch = batchData as BatchRow

  const results = await getBatchResults(batchId, orgId)
  return { ...mapBatchRow(batch), results }
}
