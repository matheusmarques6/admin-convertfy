/**
 * Campaign Store Emails Service — Tela 2 "Subir Campanha por Loja".
 *
 * Compõe o payload do modal (lojas da campanha + copy + imagem por loja +
 * mapa de cortes aprovado), o resumo pro badge do drawer e as escritas:
 * PATCH de status/downloaded_ports (união server-side — dois downloads
 * concorrentes não se clobberam) e upload manual de imagem por loja.
 *
 * A linha campaign_store_emails é campanha×loja: as 3 tasks "Subir
 * e-mails - <idioma>" compartilham o mesmo progresso.
 */

import sharp from "sharp"
import { createAdminClient } from "@/lib/supabase/server"
import { AppError, NotFoundError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { getCampaignHandoff } from "./campaign-handoff.service"
import { getCutMap, validateCutMap } from "./campaign-cut-map.service"
import type { CutPort } from "@/types/campaign-cuts"
import { isFigmaConfigured } from "@/lib/integrations/figma/client"
import { storeLangGroup } from "@/lib/campaign-cuts/lang"
import type {
  CampaignStoreEmail,
  CampaignUploadPayload,
  CampaignUploadSummary,
  CutMapGateStatus,
} from "@/types/campaign-store-emails"
import type { SuggestionTarget } from "@/types/campaign-central"

const log = logger.child("CampaignStoreEmail")

const BUCKET = "onboarding-visual-assets"

const ROW_COLS =
  "id, suggestion_id, store_id, image_url, image_path, image_filename, " +
  "image_natural_w, image_natural_h, source, figma_node_id, status, " +
  "downloaded_ports, cut_ports_override, updated_at"

export function mapStoreEmailRow(row: Record<string, unknown>): CampaignStoreEmail {
  return {
    id: row.id as string,
    suggestion_id: row.suggestion_id as string,
    store_id: row.store_id as string,
    image_url: (row.image_url as string | null) ?? null,
    image_path: (row.image_path as string | null) ?? null,
    image_filename: (row.image_filename as string | null) ?? null,
    image_natural_w: (row.image_natural_w as number | null) ?? null,
    image_natural_h: (row.image_natural_h as number | null) ?? null,
    source: (row.source as "figma" | "manual") ?? "manual",
    figma_node_id: (row.figma_node_id as string | null) ?? null,
    status: (row.status as CampaignStoreEmail["status"]) ?? "pendente",
    downloaded_ports: Array.isArray(row.downloaded_ports)
      ? (row.downloaded_ports as string[])
      : [],
    cut_ports_override: Array.isArray(row.cut_ports_override)
      ? (row.cut_ports_override as CampaignStoreEmail["cut_ports_override"])
      : null,
    updated_at: row.updated_at as string,
  }
}

async function fetchStoreEmailRows(
  suggestionId: string,
  orgId: string,
): Promise<CampaignStoreEmail[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("campaign_store_emails")
    .select(ROW_COLS)
    .eq("suggestion_id", suggestionId)
    .eq("org_id", orgId)
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(
    mapStoreEmailRow,
  )
}

/** Payload completo do modal. `cut_map` só sai quando APPROVED (gate). */
export async function getCampaignUploadPayload(
  suggestionId: string,
  orgId: string,
): Promise<CampaignUploadPayload> {
  const [handoff, cutMapRes, rows] = await Promise.all([
    getCampaignHandoff(suggestionId, orgId),
    getCutMap(suggestionId, orgId),
    fetchStoreEmailRows(suggestionId, orgId),
  ])

  const cutMapStatus: CutMapGateStatus = cutMapRes.map
    ? cutMapRes.map.status
    : "missing"
  const rowByStore = new Map(rows.map((r) => [r.store_id, r]))

  return {
    suggestion_id: suggestionId,
    campaign_title: handoff.title || cutMapRes.campaign_title || null,
    figma_link: handoff.figma_link,
    figma_available: isFigmaConfigured(),
    cut_map_status: cutMapStatus,
    cut_map: cutMapStatus === "approved" ? cutMapRes.map : null,
    stores: handoff.stores.map((s) => ({
      store_id: s.store_id,
      store_name: s.store_name,
      country: s.country,
      language: s.language,
      lang_group: storeLangGroup(s.language),
      copy: s.copy,
      email: rowByStore.get(s.store_id) ?? null,
    })),
  }
}

/** Resumo leve pro badge "X/N lojas" do drawer (sem copy nem figma chain). */
export async function getCampaignUploadSummary(
  suggestionId: string,
  orgId: string,
): Promise<CampaignUploadSummary> {
  const admin = createAdminClient()
  const [{ data: sug }, { data: mapRow }, { data: rowsData }] = await Promise.all([
    admin
      .from("campaign_suggestions")
      .select("targets")
      .eq("id", suggestionId)
      .eq("org_id", orgId)
      .maybeSingle(),
    admin
      .from("campaign_cut_maps")
      .select("status")
      .eq("suggestion_id", suggestionId)
      .eq("org_id", orgId)
      .maybeSingle(),
    admin
      .from("campaign_store_emails")
      .select("status, image_url")
      .eq("suggestion_id", suggestionId)
      .eq("org_id", orgId),
  ])

  if (!sug) throw new NotFoundError("Campanha")
  const targets = ((sug.targets as SuggestionTarget[] | null) ?? []).length
  const rows = rowsData ?? []

  return {
    total: targets,
    concluidas: rows.filter((r) => r.status === "concluida").length,
    com_imagem: rows.filter((r) => Boolean(r.image_url)).length,
    cut_map_status: ((mapRow?.status as "draft" | "approved" | undefined) ??
      "missing") as CutMapGateStatus,
  }
}

async function requireTargetStore(
  suggestionId: string,
  orgId: string,
  storeId: string,
): Promise<void> {
  const admin = createAdminClient()
  const { data: sug } = await admin
    .from("campaign_suggestions")
    .select("targets")
    .eq("id", suggestionId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!sug) throw new NotFoundError("Campanha")
  const targets = (sug.targets as SuggestionTarget[] | null) ?? []
  if (!targets.some((t) => t.store_id === storeId)) {
    throw new AppError("Loja não pertence à campanha", 422)
  }
}

/**
 * Linha da loja + nome (pros filenames das rotas slice/download-zip).
 * 404 quando a loja ainda não tem imagem registrada.
 */
export async function getStoreEmailWithName(
  suggestionId: string,
  orgId: string,
  storeId: string,
): Promise<{ row: CampaignStoreEmail; storeName: string }> {
  const admin = createAdminClient()
  const [{ data: sug }, { data: rowData }] = await Promise.all([
    admin
      .from("campaign_suggestions")
      .select("targets")
      .eq("id", suggestionId)
      .eq("org_id", orgId)
      .maybeSingle(),
    admin
      .from("campaign_store_emails")
      .select(ROW_COLS)
      .eq("suggestion_id", suggestionId)
      .eq("org_id", orgId)
      .eq("store_id", storeId)
      .maybeSingle(),
  ])

  if (!sug) throw new NotFoundError("Campanha")
  const targets = (sug.targets as SuggestionTarget[] | null) ?? []
  const target = targets.find((t) => t.store_id === storeId)
  if (!target) throw new AppError("Loja não pertence à campanha", 422)
  if (!rowData) throw new NotFoundError("Email da loja (suba a imagem primeiro)")

  const row = mapStoreEmailRow(rowData as unknown as Record<string, unknown>)
  if (!row.image_url && !row.image_path) {
    throw new NotFoundError("Imagem da loja")
  }
  return { row, storeName: target.store_name || "loja" }
}

/**
 * Validação do ajuste fino por loja: mesmo invariante do mapa
 * (validateCutMap) + os ids têm que ser EXATAMENTE os do mapa aprovado,
 * na mesma ordem — copy e downloaded_ports casam por id.
 */
export function assertValidOverride(
  mapPorts: CutPort[],
  override: CutPort[],
): void {
  validateCutMap(override, [])
  const mapIds = mapPorts.map((p) => p.id).join("|")
  const overrideIds = override.map((p) => p.id).join("|")
  if (mapIds !== overrideIds) {
    throw new AppError(
      "Ajuste de cortes não corresponde às portas do mapa aprovado — reabra o modal",
      409,
    )
  }
}

/**
 * PATCH por loja: status, downloaded_ports e/ou ajuste fino de cortes.
 * downloaded_ports faz UNIÃO com o existente no servidor — o client manda
 * só os ids novos. cut_ports_override null = restaurar automático.
 */
export async function patchStoreEmail(
  suggestionId: string,
  orgId: string,
  input: {
    store_id: string
    status?: CampaignStoreEmail["status"]
    add_downloaded_ports?: string[]
    cut_ports_override?: CutPort[] | null
  },
): Promise<CampaignStoreEmail> {
  await requireTargetStore(suggestionId, orgId, input.store_id)

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from("campaign_store_emails")
    .select(ROW_COLS)
    .eq("suggestion_id", suggestionId)
    .eq("org_id", orgId)
    .eq("store_id", input.store_id)
    .maybeSingle()

  if (!existing) {
    throw new NotFoundError("Email da loja (suba a imagem primeiro)")
  }

  const row = mapStoreEmailRow(existing as unknown as Record<string, unknown>)
  const update: Record<string, unknown> = {}
  if (input.status) update.status = input.status
  if (input.add_downloaded_ports?.length) {
    update.downloaded_ports = Array.from(
      new Set([...row.downloaded_ports, ...input.add_downloaded_ports]),
    )
  }
  if (input.cut_ports_override !== undefined) {
    if (input.cut_ports_override === null) {
      update.cut_ports_override = null
    } else {
      const { map } = await getCutMap(suggestionId, orgId)
      if (!map || map.status !== "approved") {
        throw new AppError("Mapa de cortes ainda não aprovado", 409)
      }
      assertValidOverride(map.portas, input.cut_ports_override)
      update.cut_ports_override = input.cut_ports_override
    }
  }
  if (Object.keys(update).length === 0) return row

  const { data, error } = await admin
    .from("campaign_store_emails")
    .update(update)
    .eq("id", row.id)
    .select(ROW_COLS)
    .single()

  if (error) {
    log.error("patch.failed", { suggestionId, storeId: input.store_id, error: error.message })
    throw new AppError(`Erro ao atualizar: ${error.message}`, 500)
  }
  return mapStoreEmailRow(data as unknown as Record<string, unknown>)
}

/**
 * Upload manual da imagem de uma loja: normaliza pra PNG, mede as
 * dimensões no buffer real, grava no storage (path fixo por loja,
 * upsert) e upserta a linha preservando status "concluida".
 */
export async function saveManualStoreEmail(params: {
  suggestionId: string
  orgId: string
  storeId: string
  userId: string
  buffer: Buffer
  contentType: string
  filename: string
}): Promise<CampaignStoreEmail> {
  const { suggestionId, orgId, storeId, userId, filename } = params
  await requireTargetStore(suggestionId, orgId, storeId)

  // Normaliza pra PNG (path fixo .png viabiliza o upsert de substituição).
  const isPng = params.contentType === "image/png"
  const pngBuffer = isPng ? params.buffer : await sharp(params.buffer).png().toBuffer()
  const meta = await sharp(pngBuffer).metadata()
  if (!meta.width || !meta.height) {
    throw new AppError("Não foi possível medir a imagem enviada", 422)
  }

  const admin = createAdminClient()
  const path = `campaigns/${suggestionId}/store-emails/${storeId}.png`
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, pngBuffer, { contentType: "image/png", upsert: true })
  if (upErr) {
    log.error("upload.failed", { suggestionId, storeId, error: upErr.message })
    throw new AppError(`Erro no upload: ${upErr.message}`, 500)
  }

  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 365 * 24 * 60 * 60)
  const imageUrl = signed?.signedUrl ?? null
  if (!imageUrl) throw new AppError("Não foi possível assinar a URL da imagem", 500)

  const { data: existing } = await admin
    .from("campaign_store_emails")
    .select("status")
    .eq("suggestion_id", suggestionId)
    .eq("org_id", orgId)
    .eq("store_id", storeId)
    .maybeSingle()

  const { data, error } = await admin
    .from("campaign_store_emails")
    .upsert(
      {
        org_id: orgId,
        suggestion_id: suggestionId,
        store_id: storeId,
        image_url: imageUrl,
        image_path: path,
        image_filename: filename,
        image_natural_w: meta.width,
        image_natural_h: meta.height,
        source: "manual",
        figma_node_id: null,
        status: existing?.status === "concluida" ? "concluida" : "andamento",
        uploaded_by: userId,
      },
      { onConflict: "suggestion_id,store_id" },
    )
    .select(ROW_COLS)
    .single()

  if (error) {
    log.error("manual.save_failed", { suggestionId, storeId, error: error.message })
    throw new AppError(`Erro ao gravar registro: ${error.message}`, 500)
  }
  return mapStoreEmailRow(data as unknown as Record<string, unknown>)
}
