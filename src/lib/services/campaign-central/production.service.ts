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
import type { CampaignSuggestion, CampaignSuggestionType } from "@/types/campaign-central"
import type {
  ProductionCampaign,
  ProductionDesigner,
  ProductionResponse,
  ProductionStore,
  ProductionStorePreview,
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
  /** Vínculo opcional com email_flow_emails.id (HTML real do pipeline AE).
   *  Hoje sempre ausente — reservado pro "email-espelho" futuro. */
  email_flow_email_id?: string | null
}

interface StoreMeta {
  country: string
  lang: string
}

interface SuggestionDraftMeta {
  status: string
  copy_results: { test?: Record<string, { quality?: "good" | null }> } | null
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
  const suggestionIds = new Set<string>()
  for (const it of rows) {
    for (const t of (it.target_stores as RawTargetStore[] | null) ?? []) {
      if (t?.store_id) storeIds.add(t.store_id)
    }
    const sid = ((it.copy_data ?? {}) as Record<string, unknown>).suggestion_id as
      | string
      | undefined
    if (sid) suggestionIds.add(sid)
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

  // Status das sugestões referenciadas, pra derivar is_draft.
  // Rascunho = pipeline_item existe mas a sugestão ainda está em 'suggested'
  // (e por consequência sem piloto 'good' marcado).
  const suggestionMeta = new Map<string, SuggestionDraftMeta>()
  if (suggestionIds.size > 0) {
    const { data: sugs } = await admin
      .from("campaign_suggestions")
      .select("id, status, copy_results")
      .in("id", [...suggestionIds])
    for (const s of sugs ?? []) {
      suggestionMeta.set(s.id as string, {
        status: s.status as string,
        copy_results: (s.copy_results as SuggestionDraftMeta["copy_results"]) ?? null,
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
        email_flow_email_id: t.email_flow_email_id ?? null,
      }
    })

    const sid = (copy.suggestion_id as string | null) ?? null
    const sMeta = sid ? suggestionMeta.get(sid) : null
    // Rascunho = ainda não há piloto marcado como "Boa" em copy_results.test.
    // Mesma regra do gate em approveSuggestion(): sem piloto good, não vai
    // pros designers. Cobre cards novos (saveAsDraft) e legados criados antes
    // do gate (que nunca passaram por aprovação real, mas entraram direto em
    // pipeline porque o fluxo antigo aprovava na criação).
    const tests = sMeta?.copy_results?.test ?? {}
    const hasPilotGood = Object.values(tests).some((t) => t?.quality === "good")
    const isDraft = !hasPilotGood

    return {
      id: it.id as string,
      suggestion_id: sid,
      type,
      title: it.title as string,
      subject: (it.subject_line as string | null) ?? null,
      angle: (copy.angle as string | null) ?? (it.description as string | null) ?? null,
      channel: (copy.channel as string | null) ?? "Email",
      send_date: sendDate,
      send_in: daysUntil(sendDate),
      stores,
      is_draft: isDraft,
    }
  })

  return { productions, designers, count: productions.length }
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
    email_flow_email_id: current.email_flow_email_id ?? null,
  }
}

/**
 * Garante uma campaign_suggestion em status='suggested' atrelada ao
 * pipeline_item, pra abrir o CopyPanel a partir de "Em produção" e
 * percorrer o fluxo de teste→aprovação. Cobre dois casos:
 *
 *   - pipeline_item LEGADO (sem suggestion_id em copy_data, criado antes
 *     do gate): cria uma suggestion nova herdando os campos do item.
 *
 *   - pipeline_item já com suggestion atrelada (status approved/dismissed):
 *     reverte status pra 'suggested' (sem apagar nada).
 *
 * Em ambos os casos, NÃO altera stage do pipeline_item nem target_stores —
 * o card continua em "Em produção" como rascunho até o COO aprovar de novo.
 */
export async function reopenAsDraft(params: {
  orgId: string
  pipelineItemId: string
  userId: string
}): Promise<CampaignSuggestion> {
  const { orgId, pipelineItemId, userId } = params
  const admin = createAdminClient()

  const { data: item, error: itemErr } = await admin
    .from("campaign_pipeline_items")
    .select("*")
    .eq("id", pipelineItemId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (itemErr) throw itemErr
  if (!item) throw new NotFoundError("Campanha em produção")

  const copy = (item.copy_data ?? {}) as Record<string, unknown>
  const deploy = (item.deploy_config ?? {}) as Record<string, unknown>
  const tags = (item.tags as string[] | null) ?? []
  const existingSid = (copy.suggestion_id as string | null) ?? null

  let suggestionId: string | null = null

  if (existingSid) {
    const { data: existing } = await admin
      .from("campaign_suggestions")
      .select("id, status")
      .eq("id", existingSid)
      .eq("org_id", orgId)
      .maybeSingle()
    if (existing) {
      if (existing.status !== "suggested") {
        const { error: revertErr } = await admin
          .from("campaign_suggestions")
          .update({
            status: "suggested",
            decided_by: null,
            decided_at: null,
          })
          .eq("id", existing.id)
        if (revertErr) throw revertErr
      }
      suggestionId = existing.id as string
    }
  }

  if (!suggestionId) {
    const type =
      (tags.find((t) => CENTRAL_TYPES.has(t as CampaignSuggestionType)) as
        | CampaignSuggestionType
        | undefined) ?? "avulsa"
    const rawTargets = (item.target_stores as Array<Record<string, unknown>>) ?? []
    const targets = rawTargets.map((t) => ({
      store_id: t.store_id as string,
      store_name: (t.store_name as string) ?? "Loja",
      country: (t.country as string) ?? "BR",
    }))
    const blocks = (copy.blocks as unknown[] | null) ?? null

    const { data: created, error: insertErr } = await admin
      .from("campaign_suggestions")
      .insert({
        org_id: orgId,
        cycle_id: null,
        source: "manual",
        status: "suggested",
        type,
        title: item.title as string,
        confidence: null,
        trigger: { label: "Reabertura", detail: "Campanha em produção" },
        trend_id: null,
        commemorative_date_id: null,
        angle: (copy.angle as string | null) ?? (item.description as string | null) ?? null,
        subject: (item.subject_line as string | null) ?? null,
        channel: (copy.channel as string | null) ?? "Email",
        targets,
        target_summary: `${targets.length} loja(s)`,
        est_revenue: null,
        low_perf: false,
        send_date: (deploy.send_date as string | null) ?? null,
        email_draft:
          blocks && blocks.length > 0
            ? {
                subject: item.subject_line ?? null,
                preheader: null,
                strategy: null,
                blocks,
              }
            : null,
        copy_results: (copy.copy_results as Record<string, unknown>) ?? {},
        pipeline_item_id: pipelineItemId,
        audience_label: null,
        pilot_store_ids: [],
        design_task_id: null,
        created_by: userId,
      })
      .select("id")
      .single()
    if (insertErr) throw insertErr
    suggestionId = created.id as string

    const { error: linkErr } = await admin
      .from("campaign_pipeline_items")
      .update({ copy_data: { ...copy, suggestion_id: suggestionId } })
      .eq("id", pipelineItemId)
      .eq("org_id", orgId)
    if (linkErr) throw linkErr
  }

  const { data: full, error: fullErr } = await admin
    .from("campaign_suggestions")
    .select("*")
    .eq("id", suggestionId)
    .single()
  if (fullErr) throw fullErr

  log.info("production.reopened", { pipelineItemId, suggestionId })
  return full as CampaignSuggestion
}

/**
 * Lê o HTML real (pipeline AE) de UMA loja dentro de uma campanha em produção.
 *
 * CONSOME, não enfileira: a Central nunca dispara o pipeline AE; só LÊ o que já
 * existir. O vínculo é o campo opcional `email_flow_email_id` no JSONB
 * target_stores — hoje SEMPRE vazio (será populado pelo "email-espelho" futuro).
 *
 * Retorna `available=true` + `html` SÓ quando:
 *   1. a loja tem `email_flow_email_id` setado, E
 *   2. o email_flow_emails correspondente está em status 'ready', E
 *   3. há HTML não-vazio.
 * Qualquer outro caso → `available=false` (fallback gracioso no workspace).
 * Nunca lança por "não encontrado"; só por erro de DB ou item fora da org.
 */
export async function getProductionStorePreview(params: {
  orgId: string
  itemId: string
  storeId: string
}): Promise<ProductionStorePreview> {
  const { orgId, itemId, storeId } = params
  const admin = createAdminClient()

  const empty: ProductionStorePreview = {
    available: false,
    html: null,
    email_flow_email_id: null,
    status: null,
  }

  const { data: item, error: fetchErr } = await admin
    .from("campaign_pipeline_items")
    .select("id, target_stores")
    .eq("id", itemId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (fetchErr) throw fetchErr
  if (!item) throw new NotFoundError("Campanha em produção")

  const targets = (item.target_stores as RawTargetStore[] | null) ?? []
  const target = targets.find((t) => t.store_id === storeId)
  // Loja não está na campanha, ou ainda não tem vínculo com HTML real:
  // fallback gracioso (não é erro — é o caminho esperado hoje).
  const emailId = target?.email_flow_email_id ?? null
  if (!emailId) return empty

  const { data: email, error: emailErr } = await admin
    .from("email_flow_emails")
    .select("id, status, html")
    .eq("id", emailId)
    .maybeSingle()

  if (emailErr) throw emailErr
  if (!email) return { ...empty, email_flow_email_id: emailId }

  const status = (email.status as string | null) ?? null
  const html = (email.html as string | null) ?? null
  const ready = status === "ready" && !!html && html.trim().length > 0

  return {
    available: ready,
    html: ready ? html : null,
    email_flow_email_id: emailId,
    status,
  }
}
