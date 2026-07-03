/**
 * Campaign Cut Map Service — mapa de cortes do email da campanha.
 *
 * 1 mapa por campanha (campaign_cut_maps, UNIQUE suggestion_id). A task
 * "Corte modelo" cria/edita; as tasks "Subir e-mails - <idioma>" da mesma
 * campanha leem o MESMO mapa (somente status "approved").
 *
 * Regras:
 *  - Draft-save é leniente (o client mantém o invariante; não bloquear
 *    rascunho por eps de contiguidade). Approve valida ESTRITO.
 *  - Editar um mapa aprovado REBAIXA para draft (approved_at limpo) —
 *    intencional: a tela de subida nunca consome mapa em edição.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { AppError } from "@/lib/api/errors"
import { MIN_PORT_FRACTION } from "@/lib/campaign-cuts/geometry"
import {
  PORT_TYPES,
  type CampaignCutMap,
  type CutMapSaveInput,
  type CutPort,
  type CutSpecialArea,
} from "@/types/campaign-cuts"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignCutMap")

const EPS = 1e-4

/**
 * Validação ESTRITA do mapa (usada no approve). Lança AppError 422 com a
 * primeira violação encontrada.
 */
export function validateCutMap(
  portas: CutPort[],
  areas: CutSpecialArea[],
): void {
  if (portas.length < 1) throw new AppError("O mapa precisa de ao menos 1 porta", 422)
  if (portas.length > 40) throw new AppError("Máximo de 40 portas", 422)
  if (areas.length > 40) throw new AppError("Máximo de 40 áreas especiais", 422)

  const ids = new Set<string>()
  for (const p of portas) {
    if (ids.has(p.id)) throw new AppError(`Porta com id duplicado: ${p.id}`, 422)
    ids.add(p.id)
    if (!(p.type in PORT_TYPES)) {
      throw new AppError(`Tipo de porta inválido: ${p.type}`, 422)
    }
    if (p.y1 - p.y0 < MIN_PORT_FRACTION) {
      throw new AppError(`Porta "${p.label}" com altura abaixo do mínimo`, 422)
    }
  }

  if (Math.abs(portas[0].y0) > EPS) {
    throw new AppError("A primeira porta deve começar no topo do email", 422)
  }
  if (Math.abs(portas[portas.length - 1].y1 - 1) > EPS) {
    throw new AppError("A última porta deve terminar no fim do email", 422)
  }
  for (let i = 1; i < portas.length; i++) {
    const gap = portas[i].y0 - portas[i - 1].y1
    if (gap > EPS) {
      throw new AppError(
        `Buraco entre "${portas[i - 1].label}" e "${portas[i].label}"`,
        422,
      )
    }
    if (gap < -EPS) {
      throw new AppError(
        `Sobreposição entre "${portas[i - 1].label}" e "${portas[i].label}"`,
        422,
      )
    }
  }

  const areaIds = new Set<string>()
  for (const a of areas) {
    if (areaIds.has(a.id)) throw new AppError(`Área com id duplicado: ${a.id}`, 422)
    areaIds.add(a.id)
    if (a.w <= 0 || a.h <= 0) {
      throw new AppError(`Área "${a.label}" com dimensão inválida`, 422)
    }
    if (a.x < -EPS || a.y < -EPS || a.x + a.w > 1 + EPS || a.y + a.h > 1 + EPS) {
      throw new AppError(`Área "${a.label}" fora dos limites da imagem`, 422)
    }
  }
}

function mapRow(row: Record<string, unknown>): CampaignCutMap {
  return {
    id: row.id as string,
    suggestion_id: row.suggestion_id as string,
    task_id: (row.task_id as string | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    image_path: (row.image_path as string | null) ?? null,
    image_filename: (row.image_filename as string | null) ?? null,
    image_natural_w: (row.image_natural_w as number | null) ?? null,
    image_natural_h: (row.image_natural_h as number | null) ?? null,
    portas: (row.portas as CutPort[]) ?? [],
    special_areas: (row.special_areas as CutSpecialArea[]) ?? [],
    status: (row.status as "draft" | "approved") ?? "draft",
    approved_at: (row.approved_at as string | null) ?? null,
    updated_at: row.updated_at as string,
  }
}

const SELECT_COLS =
  "id, suggestion_id, task_id, image_url, image_path, image_filename, " +
  "image_natural_w, image_natural_h, portas, special_areas, status, " +
  "approved_at, updated_at"

/** Mapa atual (ou null) + título da campanha para o header do modal. */
export async function getCutMap(
  suggestionId: string,
  orgId: string,
): Promise<{ map: CampaignCutMap | null; campaign_title: string | null }> {
  const admin = createAdminClient()

  const [{ data: mapRowData }, { data: suggestion }] = await Promise.all([
    admin
      .from("campaign_cut_maps")
      .select(SELECT_COLS)
      .eq("suggestion_id", suggestionId)
      .eq("org_id", orgId)
      .maybeSingle(),
    admin
      .from("campaign_suggestions")
      .select("title")
      .eq("id", suggestionId)
      .eq("org_id", orgId)
      .maybeSingle(),
  ])

  return {
    map: mapRowData ? mapRow(mapRowData as unknown as Record<string, unknown>) : null,
    campaign_title: (suggestion?.title as string | undefined) ?? null,
  }
}

function buildUpsertPayload(
  suggestionId: string,
  orgId: string,
  input: CutMapSaveInput,
  userId: string,
  taskId: string | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    org_id: orgId,
    suggestion_id: suggestionId,
    task_id: taskId,
    portas: input.portas,
    special_areas: input.special_areas,
    created_by: userId,
  }
  // Campos de imagem só entram quando enviados (não apagar num draft
  // que não mexeu na imagem).
  if (input.image_url !== undefined) payload.image_url = input.image_url
  if (input.image_path !== undefined) payload.image_path = input.image_path
  if (input.image_filename !== undefined) payload.image_filename = input.image_filename
  if (input.image_natural_w !== undefined) payload.image_natural_w = input.image_natural_w
  if (input.image_natural_h !== undefined) payload.image_natural_h = input.image_natural_h
  return payload
}

/**
 * Salva rascunho (upsert por suggestion_id). Rebaixa mapa aprovado para
 * draft — quem edita depois de aprovar precisa reaprovar.
 */
export async function saveCutMapDraft(
  suggestionId: string,
  orgId: string,
  input: CutMapSaveInput,
  userId: string,
  taskId: string | null,
): Promise<CampaignCutMap> {
  const admin = createAdminClient()
  const payload = {
    ...buildUpsertPayload(suggestionId, orgId, input, userId, taskId),
    status: "draft",
    approved_by: null,
    approved_at: null,
  }

  const { data, error } = await admin
    .from("campaign_cut_maps")
    .upsert(payload, { onConflict: "suggestion_id" })
    .select(SELECT_COLS)
    .single()

  if (error) {
    log.error("draft.save_failed", { suggestionId, error: error.message })
    throw new AppError(`Erro ao salvar rascunho: ${error.message}`, 500)
  }
  return mapRow(data as unknown as Record<string, unknown>)
}

/** Valida estrito + grava como aprovado. */
export async function approveCutMap(
  suggestionId: string,
  orgId: string,
  input: CutMapSaveInput,
  userId: string,
  taskId: string | null,
): Promise<CampaignCutMap> {
  validateCutMap(input.portas, input.special_areas)
  // O approve carrega o estado completo — a imagem é obrigatória.
  if (!input.image_url) {
    throw new AppError("O mapa precisa de uma imagem do email", 422)
  }

  const admin = createAdminClient()
  const payload = {
    ...buildUpsertPayload(suggestionId, orgId, input, userId, taskId),
    status: "approved",
    approved_by: userId,
    approved_at: new Date().toISOString(),
  }

  const { data, error } = await admin
    .from("campaign_cut_maps")
    .upsert(payload, { onConflict: "suggestion_id" })
    .select(SELECT_COLS)
    .single()

  if (error) {
    log.error("approve.save_failed", { suggestionId, error: error.message })
    throw new AppError(`Erro ao aprovar mapeamento: ${error.message}`, 500)
  }

  log.info("approve.ok", {
    suggestionId,
    portas: input.portas.length,
    areas: input.special_areas.length,
  })
  return mapRow(data as unknown as Record<string, unknown>)
}
