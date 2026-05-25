/**
 * Service: flagging semanal do Acompanhamento.
 *
 * Centraliza a logica que decide quais lojas entram no pipeline da
 * semana corrente (Etapa 1 = "Precisa atenção") e qual seu health_state.
 *
 * Reusado por:
 *  - Cron domingo 22h UTC (auto)    → /api/cron/weekly-acompanhamento-reset
 *  - Rota admin "Sinalizar agora"   → /api/admin/acompanhamento/flag-now
 *
 * Idempotente: re-rodar pra mesma semana faz upsert (não duplica).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { getCsPipeline } from "@/lib/cs-pipelines"

const log = logger.child("AcompanhamentoFlagging")

export interface FlagResult {
  week: string
  total_stores: number
  flagged: number
  skipped: number
  errors: number
}

interface StoreRow {
  id: string
  org_id: string
  store_name: string
  created_at: string
  contract_end_date: string | null
  health_score: number | null
  nps_last_score: number | null
  nps_last_at: string | null
  mrr_cents: number | null
}

export function thisMonday(): string {
  const now = new Date()
  const dow = now.getUTCDay()
  const offset = dow === 0 ? 6 : dow - 1
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - offset)
  monday.setUTCHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

export function nextMonday(): string {
  const now = new Date()
  const dow = now.getUTCDay()
  const daysUntilMonday = dow === 0 ? 1 : (8 - dow) % 7 || 7
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() + daysUntilMonday)
  monday.setUTCHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

interface FlagStoresOptions {
  admin: SupabaseClient
  /** Semana alvo (YYYY-MM-DD). Default: this monday. */
  week?: string
  /** Limita ao org_id especifico (usado pelo admin). undefined = todas. */
  orgId?: string
  /**
   * Se true, força flag em TODAS as lojas mesmo as healthy (pra demo/teste).
   * Default true: o ritual cobre o portfolio inteiro — saudaveis entram com
   * health_state="healthy" e ficam disponiveis pra pular Etapa 1→3 no front.
   * Lojas com motivo ainda recebem flag_reason explicando entrada.
   */
  force?: boolean
}

export async function flagStoresForWeek({
  admin,
  week,
  orgId,
  force = true,
}: FlagStoresOptions): Promise<FlagResult> {
  const targetWeek = week ?? thisMonday()

  // 1. Soft-deactivate estados ativos das semanas anteriores
  let deactivateQuery = admin
    .from("weekly_pipeline_states")
    .update({ is_active: false })
    .neq("week_start", targetWeek)
    .eq("is_active", true)
  if (orgId) deactivateQuery = deactivateQuery.eq("org_id", orgId)
  await deactivateQuery

  // 2. Pega lojas ativas (filtradas por org se aplicavel)
  let storesQuery = admin
    .from("client_stores")
    .select(
      "id, org_id, store_name, created_at, contract_end_date, health_score, nps_last_score, nps_last_at, mrr_cents",
    )
    .eq("is_active", true)
    .limit(500)
  if (orgId) storesQuery = storesQuery.eq("org_id", orgId)

  const { data: storesRaw, error: storesErr } = await storesQuery
  if (storesErr) {
    log.error("Erro buscando lojas", { error: storesErr.message })
    throw new Error(`Erro buscando lojas: ${storesErr.message}`)
  }

  // Filtra lojas com receita nos últimos 7 dias (store_revenue_summary)
  const allStoreIds = (storesRaw ?? []).map((s) => (s as { id: string }).id)
  const recentRevenueStoreIds = new Set<string>()
  if (allStoreIds.length > 0) {
    const { data: revRows } = await admin
      .from("store_revenue_summary")
      .select("store_id, omnisend_total_revenue, updated_at")
      .in("store_id", allStoreIds)
      .eq("period_label", "7d")
    for (const r of (revRows ?? []) as Array<{ store_id: string; omnisend_total_revenue: number | null }>) {
      if (r.omnisend_total_revenue != null && r.omnisend_total_revenue > 0) {
        recentRevenueStoreIds.add(r.store_id)
      }
    }
    // Também incluir lojas com MRR > 0 (pagam mensalidade = ativas)
    for (const s of (storesRaw ?? []) as StoreRow[]) {
      if (s.mrr_cents && s.mrr_cents > 0) {
        recentRevenueStoreIds.add(s.id)
      }
    }
  }

  const stores = ((storesRaw ?? []) as StoreRow[]).filter(
    (s) => recentRevenueStoreIds.has(s.id),
  )
  if (stores.length === 0) {
    return {
      week: targetWeek,
      total_stores: 0,
      flagged: 0,
      skipped: 0,
      errors: 0,
    }
  }

  let flagged = 0
  let skipped = 0
  let errors = 0

  for (const store of stores) {
    const reasons: string[] = []
    let healthState: "rampup" | "healthy" | "attention" | "risk" | "renewal" =
      "healthy"
    let healthScore = 70

    // 1) Rampup (< 60 dias na Convertfy)
    const ageDays = Math.floor(
      (Date.now() - new Date(store.created_at).getTime()) / 86_400_000,
    )
    if (ageDays < 60) {
      healthState = "rampup"
      healthScore = 60
      reasons.push(`Loja há ${ageDays}d na Convertfy (ramp-up)`)
    }

    // 2) Renovação próxima (<= 30 dias)
    if (store.contract_end_date) {
      const daysToEnd = Math.floor(
        (new Date(store.contract_end_date).getTime() - Date.now()) /
          86_400_000,
      )
      if (daysToEnd <= 30 && daysToEnd >= 0) {
        healthState = "renewal"
        reasons.push(`Contrato vence em ${daysToEnd}d`)
      }
    }

    // 3) Solicitações abertas
    const { data: openRequests } = await admin
      .from("client_store_requests")
      .select("id")
      .eq("store_id", store.id)
      .in("status", ["open", "in_progress"])
      .limit(1)

    if (openRequests && openRequests.length > 0) {
      reasons.push("Solicitações abertas")
      if (healthState === "healthy") {
        healthState = "attention"
        healthScore = 65
      }
    }

    // 4) Weekly report — concerns vs highlights
    const { data: latestReport } = await admin
      .from("weekly_reports")
      .select("highlights, concerns, metrics, week_start")
      .eq("store_id", store.id)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestReport) {
      const concernsCount = Array.isArray(latestReport.concerns)
        ? latestReport.concerns.length
        : 0
      const highlightsCount = Array.isArray(latestReport.highlights)
        ? latestReport.highlights.length
        : 0
      if (concernsCount >= 3) {
        healthState = "risk"
        healthScore = Math.min(healthScore, 40)
        reasons.push(`${concernsCount} alertas no último report`)
      } else if (concernsCount >= 1 && highlightsCount === 0) {
        healthState = healthState === "rampup" ? "rampup" : "attention"
        healthScore = Math.min(healthScore, 60)
        reasons.push(`Sem destaques + ${concernsCount} alertas`)
      }

      // 4b) Report antigo (> 14 dias) = sinal de gap de cobertura
      const reportAgeDays = Math.floor(
        (Date.now() - new Date(latestReport.week_start).getTime()) / 86_400_000,
      )
      if (reportAgeDays > 14) {
        if (healthState === "healthy") {
          healthState = "attention"
          healthScore = Math.min(healthScore, 65)
        }
        reasons.push(`Último report há ${reportAgeDays}d`)
      }
    } else {
      // Sem nenhum report -> precisa atenção (loja sem cobertura)
      if (healthState === "healthy") {
        healthState = "attention"
        healthScore = Math.min(healthScore, 60)
      }
      reasons.push("Nenhum relatório semanal gerado ainda")
    }

    // 5) Última call de feedback há > 30 dias (CSM sem contato com cliente)
    const { data: lastCall } = await admin
      .from("store_feedback_calls")
      .select("conducted_at")
      .eq("store_id", store.id)
      .order("conducted_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastCall?.conducted_at) {
      const callAgeDays = Math.floor(
        (Date.now() - new Date(lastCall.conducted_at).getTime()) / 86_400_000,
      )
      if (callAgeDays > 30) {
        if (healthState === "healthy") {
          healthState = "attention"
          healthScore = Math.min(healthScore, 65)
        }
        reasons.push(`Sem call de feedback há ${callAgeDays}d`)
      }
    } else {
      // Nunca teve call — relevante pra lojas com > 30d
      if (ageDays > 30) {
        if (healthState === "healthy") {
          healthState = "attention"
          healthScore = Math.min(healthScore, 60)
        }
        reasons.push("Sem histórico de calls de feedback")
      }
    }

    // 6) Health score baixo em client_stores
    if (store.health_score !== null && store.health_score !== undefined) {
      if (store.health_score < 50) {
        healthState = "risk"
        healthScore = Math.min(healthScore, store.health_score)
        reasons.push(`Health score baixo (${store.health_score}/100)`)
      } else if (store.health_score < 70 && healthState === "healthy") {
        healthState = "attention"
        healthScore = Math.min(healthScore, store.health_score)
        reasons.push(`Health score em atenção (${store.health_score}/100)`)
      }
    }

    // 7) NPS baixo (detrator/passivo) nos últimos 90 dias
    if (
      store.nps_last_score !== null &&
      store.nps_last_score !== undefined &&
      store.nps_last_at
    ) {
      const npsAgeDays = Math.floor(
        (Date.now() - new Date(store.nps_last_at).getTime()) / 86_400_000,
      )
      if (npsAgeDays <= 90 && store.nps_last_score <= 6) {
        // Detrator (0-6)
        healthState = "risk"
        healthScore = Math.min(healthScore, 45)
        reasons.push(`NPS detrator (${store.nps_last_score}/10)`)
      } else if (
        npsAgeDays <= 90 &&
        store.nps_last_score <= 8 &&
        healthState === "healthy"
      ) {
        // Passivo (7-8)
        healthState = "attention"
        healthScore = Math.min(healthScore, 65)
        reasons.push(`NPS passivo (${store.nps_last_score}/10)`)
      }
    }

    // Só flag se há motivo (saudável + sem flags = skip), exceto modo force
    if (reasons.length === 0 && healthState === "healthy" && !force) {
      skipped++
      continue
    }

    if (force && reasons.length === 0) {
      reasons.push("Performance estável · sem ações pendentes")
    }

    // Delete-then-insert ao invés de upsert: o partial unique index
    // (store_id, week_start WHERE is_active = TRUE) nao funciona bem
    // com upsert via PostgREST.
    await admin
      .from("weekly_pipeline_states")
      .delete()
      .eq("store_id", store.id)
      .eq("week_start", targetWeek)

    const { error } = await admin
      .from("weekly_pipeline_states")
      .insert({
        org_id: store.org_id,
        store_id: store.id,
        week_start: targetWeek,
        current_stage: 1,
        health_state: healthState,
        health_score: healthScore,
        flag_reason: reasons.join(" · "),
        flagged_by: force ? "manual" : "system",
        flagged_at: new Date().toISOString(),
        is_active: true,
      })

    if (!error) {
      // Dual-write: tambem cria/atualiza deal no pipeline CS
      // "Acompanhamento Semanal" pra UX nova (PipelineBoardView).
      // Idempotente — busca deal existente por (pipeline_id, store_id,
      // week_start em custom_fields) e move stage se necessario.
      await syncFlaggingToDeal({
        admin,
        storeId: store.id,
        orgId: store.org_id,
        storeName: store.store_name,
        mrrCents: null,
        week: targetWeek,
        healthState,
        healthScore,
        flagReason: reasons.join(" · "),
        flaggedBy: force ? "manual" : "system",
      }).catch((err) => {
        log.warn("Falha sync acompanhamento->deal (nao bloqueia)", {
          storeId: store.id,
          err: err instanceof Error ? err.message : String(err),
        })
      })
    }

    if (error) {
      log.error("Erro upsert weekly_pipeline_states", {
        storeId: store.id,
        error: error.message,
      })
      errors++
    } else {
      flagged++
    }
  }

  log.info("Flagging concluido", {
    week: targetWeek,
    total: stores.length,
    flagged,
    skipped,
    errors,
    orgId,
    force,
  })

  return {
    week: targetWeek,
    total_stores: stores.length,
    flagged,
    skipped,
    errors,
  }
}

/**
 * Sincroniza um flagging com o pipeline CS "Acompanhamento Semanal".
 * Cria deal novo se nao existe pra essa (store, week_start). Move
 * stage se ja existe e current_stage mudou.
 *
 * Idempotente. Falha nao bloqueia o flagging principal (weekly_pipeline_states).
 */
async function syncFlaggingToDeal(args: {
  admin: SupabaseClient
  storeId: string
  orgId: string
  storeName: string
  mrrCents: number | null
  week: string
  healthState: string
  healthScore: number
  flagReason: string
  flaggedBy: string
}): Promise<void> {
  const pipeline = await getCsPipeline("acompanhamento")
  if (!pipeline) return // seed nao aplicado, skip silenciosamente

  const stage = pipeline.stages.find((s) => s.order === 1)
  if (!stage) return

  // Busca dados extras da store (client_id, mrr, owner)
  const { data: storeFull } = await args.admin
    .from("client_stores")
    .select("client_id, mrr_cents, client:clients(owner_id)")
    .eq("id", args.storeId)
    .maybeSingle()
  if (!storeFull?.client_id) return

  const owner = Array.isArray(storeFull.client)
    ? storeFull.client[0]
    : storeFull.client
  const mrrCents = storeFull.mrr_cents ?? 0

  // Existe deal aberto pra (pipeline, store, week_start)?
  const { data: existing } = await args.admin
    .from("deals")
    .select("id")
    .eq("pipeline_id", pipeline.id)
    .eq("store_id", args.storeId)
    .eq("status", "open")
    .contains("custom_fields", { week_start: args.week })
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Atualiza custom_fields (mantem stage atual do deal — CS pode ter
    // movido manualmente; nao reverte).
    await args.admin
      .from("deals")
      .update({
        custom_fields: {
          week_start: args.week,
          health_state: args.healthState,
          health_score: args.healthScore,
          flag_reason: args.flagReason,
          flagged_by: args.flaggedBy,
        },
      })
      .eq("id", existing.id)
    return
  }

  // Insert deal novo
  await args.admin.from("deals").insert({
    pipeline_id: pipeline.id,
    stage_id: stage.id,
    title: args.storeName,
    status: "open",
    source: args.flaggedBy === "manual" ? "manual_flag" : "cron_flag",
    store_id: args.storeId,
    client_id: storeFull.client_id,
    owner_id: owner?.owner_id ?? null,
    currency: "BRL",
    value: mrrCents / 100,
    custom_fields: {
      week_start: args.week,
      health_state: args.healthState,
      health_score: args.healthScore,
      flag_reason: args.flagReason,
      flagged_by: args.flaggedBy,
    },
  })
}
