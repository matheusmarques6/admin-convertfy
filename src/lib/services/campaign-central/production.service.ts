/**
 * Produção da Central de Campanhas.
 *
 * Lê os campaign_pipeline_items originados da Central (tag 'central') e os
 * apresenta como campanhas em produção, com estágio + designer POR LOJA
 * guardados no JSONB target_stores. Para itens criados antes desse recurso,
 * o estágio por loja cai num fallback derivado do stage global do item.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { NotFoundError } from "@/lib/api/errors"
import type { CampaignStage } from "@/types/campaign-pipeline"
import type { CampaignSuggestionType } from "@/types/campaign-central"
import type {
  ProductionCampaign,
  ProductionDesigner,
  ProductionResponse,
  ProductionStore,
} from "@/types/campaign-production"

const log = logger.child("CampaignProduction")

const CENTRAL_TYPES = new Set<CampaignSuggestionType>([
  "data",
  "tema",
  "email",
  "performance",
  "avulsa",
])

/** Nome legível do país (region_label) — server-safe (espelha o CountryChip). */
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

/** Fallback: stage global do item → estágio por loja (0..4) para itens antigos. */
function stageToProdIndex(stage: CampaignStage): number {
  switch (stage) {
    case "design":
      return 1
    case "review":
      return 2
    case "ready_to_deploy":
    case "deploying":
      return 3
    case "deployed":
      return 4
    default:
      // idea, briefing, copy_creation
      return 0
  }
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

export async function getProduction(orgId: string): Promise<ProductionResponse> {
  const admin = createAdminClient()

  const { data: items, error } = await admin
    .from("campaign_pipeline_items")
    .select("id, title, subject_line, description, stage, copy_data, deploy_config, target_stores, tags, created_at")
    .eq("org_id", orgId)
    .contains("tags", ["central"])
    .order("created_at", { ascending: false })

  if (error) throw error
  const rows = items ?? []

  // Metadados das lojas referenciadas (país/idioma) — uma query só.
  const storeIds = new Set<string>()
  for (const it of rows) {
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

  const productions: ProductionCampaign[] = rows.map((it) => {
    const copy = (it.copy_data ?? {}) as Record<string, unknown>
    const deploy = (it.deploy_config ?? {}) as Record<string, unknown>
    const tags = (it.tags as string[] | null) ?? []
    const fallbackStage = stageToProdIndex(it.stage as CampaignStage)

    const type =
      (tags.find((t) => CENTRAL_TYPES.has(t as CampaignSuggestionType)) as
        | CampaignSuggestionType
        | undefined) ?? "avulsa"

    const sendDate = (deploy.send_date as string | null) ?? null

    const stores: ProductionStore[] = (
      (it.target_stores as RawTargetStore[] | null) ?? []
    ).map((t) => {
      const meta = storeMeta.get(t.store_id) ?? { country: "BR", lang: "pt" }
      const prodStage = typeof t.prod_stage === "number" ? t.prod_stage : fallbackStage
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

    return {
      id: it.id as string,
      suggestion_id: (copy.suggestion_id as string | null) ?? null,
      type,
      title: it.title as string,
      subject: (it.subject_line as string | null) ?? null,
      angle: (copy.angle as string | null) ?? (it.description as string | null) ?? null,
      channel: (copy.channel as string | null) ?? "Email",
      send_date: sendDate,
      send_in: daysUntil(sendDate),
      stores,
    }
  })

  return { productions, designers }
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

/**
 * Atualiza o estágio e/ou designer de UMA loja dentro de um pipeline item
 * (mutação cirúrgica no JSONB target_stores).
 */
export async function updateProductionStore(params: {
  orgId: string
  itemId: string
  storeId: string
  prodStage?: number
  designerId?: string | null
}): Promise<ProductionStore> {
  const { orgId, itemId, storeId, prodStage, designerId } = params
  const admin = createAdminClient()

  const { data: item, error: fetchErr } = await admin
    .from("campaign_pipeline_items")
    .select("id, target_stores, stage")
    .eq("id", itemId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (fetchErr) throw fetchErr
  if (!item) throw new NotFoundError("Campanha em produção")

  const fallbackStage = stageToProdIndex(item.stage as CampaignStage)
  const targets = ((item.target_stores as RawTargetStore[] | null) ?? []).slice()
  const idx = targets.findIndex((t) => t.store_id === storeId)
  if (idx < 0) throw new NotFoundError("Loja na campanha")

  const current = targets[idx]
  const nextStage =
    prodStage != null
      ? Math.max(0, Math.min(4, prodStage))
      : typeof current.prod_stage === "number"
        ? current.prod_stage
        : fallbackStage

  targets[idx] = {
    ...current,
    prod_stage: nextStage,
    designer_id: designerId !== undefined ? designerId : (current.designer_id ?? null),
  }

  const { error: updateErr } = await admin
    .from("campaign_pipeline_items")
    .update({ target_stores: targets })
    .eq("id", itemId)
    .eq("org_id", orgId)

  if (updateErr) throw updateErr

  log.info("production.store_updated", { itemId, storeId, prodStage: nextStage })

  return {
    store_id: storeId,
    store_name: current.store_name ?? "Loja",
    country: "BR",
    lang: "pt",
    region_label: "Brasil",
    prod_stage: nextStage,
    designer_id: targets[idx].designer_id ?? null,
    deploy_status: (current.status as ProductionStore["deploy_status"]) ?? "pending",
  }
}
