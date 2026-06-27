/**
 * Board unificado de 7 colunas da Central de Campanhas (Fase 2).
 *
 * getBoard() estende a lógica de getProduction (production.service.ts): além dos
 * campaign_pipeline_items tagueados 'central' (campanhas com produção por loja),
 * soma as campaign_suggestions com status IN ('suggested','approved') que ainda
 * NÃO têm pipeline_item (rascunhos/aprovadas sem produção iniciada).
 *
 * Decisões do plano:
 *   - A coluna é DERIVADA (board-mapping.deriveBoardColumn), nunca armazenada.
 *   - NÃO filtra por cycle_id (cross-ciclo: campanhas em produção vêm de ciclos
 *     passados). Risco transversal explícito no plano.
 *   - Checa suggestion.status ANTES de prod_stage (rascunho com item legado não
 *     pode cair em "Copy").
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { CampaignStage } from "@/types/campaign-pipeline"
import type { CampaignSuggestionType } from "@/types/campaign-central"
import type { ProductionDesigner, ProductionStore } from "@/types/campaign-production"
import type { BoardCard, BoardCardTarget, BoardResponse } from "@/types/campaign-board"
import {
  deriveBoardColumn,
  resolveProdStages,
  stageToProdIndex,
} from "./board-mapping"

const log = logger.child("CampaignBoard")

const CENTRAL_TYPES = new Set<CampaignSuggestionType>([
  "data",
  "tema",
  "email",
  "performance",
  "avulsa",
])

/** Nome legível do país (region_label) — server-safe (espelha production.service). */
const REGION_LABELS: Record<string, string> = {
  BR: "Brasil",
  US: "EUA",
  PT: "Portugal",
  ES: "Espanha",
  MX: "México",
  AR: "Argentina",
  CO: "Colômbia",
  CL: "Chile",
  DE: "Alemanha",
  FR: "França",
  IT: "Itália",
  GB: "Reino Unido",
  UK: "Reino Unido",
  CA: "Canadá",
  AU: "Austrália",
  JP: "Japão",
}

function langKey(language: string | null | undefined): string {
  return (language ?? "pt").slice(0, 2).toLowerCase()
}

function countryKey(country: string | null | undefined): string {
  return (country ?? "BR").toUpperCase().slice(0, 2)
}

/** Dias até a data de envio (YYYY-MM-DD). Negativo = atrasado. */
function daysUntil(sendDate: string | null): number | null {
  if (!sendDate) return null
  const target = new Date(`${sendDate}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

interface RawTargetStore {
  store_id: string
  store_name?: string
  status?: string
  prod_stage?: number
  designer_id?: string | null
}

interface StoreMeta {
  country: string
  lang: string
}

interface SuggestionMeta {
  status: "suggested" | "approved" | "dismissed"
  copy_results: {
    test?: Record<string, { quality?: "good" | null }>
    production?: Record<string, unknown>
  } | null
  confidence: number | null
  low_perf: boolean
}

function hasPilotGood(meta: SuggestionMeta | null | undefined): boolean {
  const tests = meta?.copy_results?.test ?? {}
  return Object.values(tests).some((t) => t?.quality === "good")
}

function productionCopyCount(meta: SuggestionMeta | null | undefined): number {
  return Object.keys(meta?.copy_results?.production ?? {}).length
}

export async function getBoard(orgId: string): Promise<BoardResponse> {
  const admin = createAdminClient()

  // 1) Pipeline items da Central (campanhas com produção por loja).
  const { data: items, error: itemsErr } = await admin
    .from("campaign_pipeline_items")
    .select("id, title, subject_line, description, stage, copy_data, design_data, deploy_config, target_stores, tags, created_at")
    .eq("org_id", orgId)
    .contains("tags", ["central"])
    .order("created_at", { ascending: false })
  if (itemsErr) throw itemsErr
  const itemRows = items ?? []

  // 2) Sugestões cross-ciclo (NÃO filtra cycle_id) ainda 'suggested'/'approved'.
  //    Inclui as que já têm pipeline_item (pra hidratar status/copy_results dos
  //    cards de produção) E as sem pipeline_item (cards só-sugestão).
  const { data: sugs, error: sugErr } = await admin
    .from("campaign_suggestions")
    .select(
      "id, status, type, title, subject, angle, channel, confidence, low_perf, send_date, targets, target_summary, copy_results, pipeline_item_id, created_at",
    )
    .eq("org_id", orgId)
    .in("status", ["suggested", "approved"])
    .order("created_at", { ascending: false })
  if (sugErr) throw sugErr
  const sugRows = sugs ?? []

  // Índices auxiliares.
  const sugById = new Map<string, (typeof sugRows)[number]>()
  const sugMeta = new Map<string, SuggestionMeta>()
  for (const s of sugRows) {
    sugById.set(s.id as string, s)
    sugMeta.set(s.id as string, {
      status: s.status as SuggestionMeta["status"],
      copy_results: (s.copy_results as SuggestionMeta["copy_results"]) ?? null,
      confidence: (s.confidence as number | null) ?? null,
      low_perf: Boolean(s.low_perf),
    })
  }

  // Metadados das lojas referenciadas pelos pipeline items (país/idioma).
  const storeIds = new Set<string>()
  for (const it of itemRows) {
    for (const t of (it.target_stores as RawTargetStore[] | null) ?? []) {
      if (t?.store_id) storeIds.add(t.store_id)
    }
  }
  const storeMeta = new Map<string, StoreMeta>()
  if (storeIds.size > 0) {
    const { data: stores } = await admin
      .from("client_stores")
      .select("id, country, language")
      .in("id", [...storeIds])
    for (const s of stores ?? []) {
      storeMeta.set(s.id as string, {
        country: countryKey(s.country as string | null),
        lang: langKey(s.language as string | null),
      })
    }
  }

  const designers = await getDesigners(orgId)

  const cards: BoardCard[] = []
  /** suggestion_ids já representados por um card de pipeline_item. */
  const consumedSuggestionIds = new Set<string>()

  // ── Cards a partir de pipeline items ──────────────────────────────────
  for (const it of itemRows) {
    const copy = (it.copy_data ?? {}) as Record<string, unknown>
    const deploy = (it.deploy_config ?? {}) as Record<string, unknown>
    const tags = (it.tags as string[] | null) ?? []
    const itemStage = it.stage as CampaignStage

    const type =
      (tags.find((t) => CENTRAL_TYPES.has(t as CampaignSuggestionType)) as
        | CampaignSuggestionType
        | undefined) ?? "avulsa"

    const sendDate = (deploy.send_date as string | null) ?? null

    const rawStores = (it.target_stores as RawTargetStore[] | null) ?? []
    const stores: ProductionStore[] = rawStores.map((t) => {
      const meta = storeMeta.get(t.store_id) ?? { country: "BR", lang: "pt" }
      const prodStage =
        typeof t.prod_stage === "number" ? t.prod_stage : stageToProdIndex(itemStage)
      return {
        store_id: t.store_id,
        store_name: t.store_name ?? "Loja",
        country: meta.country,
        lang: meta.lang,
        region_label: REGION_LABELS[meta.country] ?? meta.country,
        prod_stage: prodStage,
        designer_id: t.designer_id ?? null,
        deploy_status: (t.status as ProductionStore["deploy_status"]) ?? "pending",
      }
    })

    const designData = (it.design_data ?? {}) as Record<string, unknown>
    const designStage = (designData.design_stage as string | null) ?? null
    const designVersion =
      typeof designData.design_version === "number"
        ? designData.design_version
        : null

    const sid = (copy.suggestion_id as string | null) ?? null
    if (sid) consumedSuggestionIds.add(sid)
    const meta = sid ? sugMeta.get(sid) : null
    // Item legado sem sugestão atrelada (ou sugestão dismissed/ausente): trata
    // como aprovado (já está em produção). O gate de piloto fica false → o card
    // mostra que veio antes do gate, mas não trava as transições de produção.
    const status: BoardCard["status"] = meta?.status ?? "approved"

    const prodStages = resolveProdStages(rawStores, itemStage)
    const column = deriveBoardColumn({
      status,
      hasProductionCopy: productionCopyCount(meta) > 0,
      prodStages,
    })

    const targets: BoardCardTarget[] = stores.map((s) => ({
      store_id: s.store_id,
      store_name: s.store_name,
      country: s.country,
    }))

    cards.push({
      id: it.id as string,
      suggestion_id: sid,
      pipeline_item_id: it.id as string,
      column,
      status,
      type,
      title: it.title as string,
      subject: (it.subject_line as string | null) ?? null,
      angle: (copy.angle as string | null) ?? (it.description as string | null) ?? null,
      channel: (copy.channel as string | null) ?? "Email",
      confidence: meta?.confidence ?? null,
      low_perf: meta?.low_perf ?? false,
      send_date: sendDate,
      send_in: daysUntil(sendDate),
      targets,
      stores,
      has_pilot_good: hasPilotGood(meta),
      has_production_copy: productionCopyCount(meta) > 0,
      production_copy_count: productionCopyCount(meta),
      design_stage: designStage,
      design_version: designVersion,
    })
  }

  // ── Cards a partir de sugestões SEM pipeline_item ─────────────────────
  for (const s of sugRows) {
    const sid = s.id as string
    if (s.pipeline_item_id) continue // representada por card de produção
    if (consumedSuggestionIds.has(sid)) continue // defensivo

    const meta = sugMeta.get(sid) ?? null
    const type = (s.type as CampaignSuggestionType) ?? "avulsa"
    const sendDate = (s.send_date as string | null) ?? null
    const rawTargets = (s.targets as Array<Record<string, unknown>> | null) ?? []
    const targets: BoardCardTarget[] = rawTargets.map((t) => ({
      store_id: (t.store_id as string) ?? "",
      store_name: (t.store_name as string) ?? "Loja",
      country: countryKey((t.country as string) ?? "BR"),
    }))

    const column = deriveBoardColumn({
      status: (s.status as SuggestionMeta["status"]) ?? null,
      hasProductionCopy: productionCopyCount(meta) > 0,
      prodStages: [], // sem pipeline_item → sem produção por loja
    })

    cards.push({
      id: `sugg:${sid}`,
      suggestion_id: sid,
      pipeline_item_id: null,
      column,
      status: (s.status as SuggestionMeta["status"]) ?? null,
      type,
      title: s.title as string,
      subject: (s.subject as string | null) ?? null,
      angle: (s.angle as string | null) ?? null,
      channel: (s.channel as string | null) ?? "Email",
      confidence: (s.confidence as number | null) ?? null,
      low_perf: Boolean(s.low_perf),
      send_date: sendDate,
      send_in: daysUntil(sendDate),
      targets,
      stores: [],
      has_pilot_good: hasPilotGood(meta),
      has_production_copy: productionCopyCount(meta) > 0,
      production_copy_count: productionCopyCount(meta),
      // Card só-sugestão ainda não tem pipeline_item → sem design ativo.
      design_stage: null,
      design_version: null,
    })
  }

  log.info("board.loaded", { orgId, cards: cards.length })
  return { cards, designers, count: cards.length }
}

async function getDesigners(orgId: string): Promise<ProductionDesigner[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("org_members")
    .select("profile:profiles!org_members_profile_id_fkey(id, name, avatar_url)")
    .eq("org_id", orgId)
    .eq("is_active", true)

  if (error) {
    log.warn("getDesigners.failed", { error: error.message })
    return []
  }

  type ProfileRel = { id: string; name: string | null; avatar_url: string | null }
  const seen = new Set<string>()
  const designers: ProductionDesigner[] = []
  for (const row of data ?? []) {
    const rel = row.profile as ProfileRel | ProfileRel[] | null
    const profile = Array.isArray(rel) ? (rel[0] ?? null) : rel
    if (!profile?.id || seen.has(profile.id)) continue
    seen.add(profile.id)
    designers.push({
      id: profile.id,
      name: profile.name ?? "Sem nome",
      avatar_url: profile.avatar_url ?? null,
    })
  }
  designers.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  return designers
}
