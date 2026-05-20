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
   * Default false (skip lojas sem motivo, como o cron real).
   */
  force?: boolean
}

export async function flagStoresForWeek({
  admin,
  week,
  orgId,
  force = false,
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
      "id, org_id, store_name, created_at, contract_end_date, health_score, nps_last_score, nps_last_at",
    )
    .eq("is_active", true)
    .limit(500)
  if (orgId) storesQuery = storesQuery.eq("org_id", orgId)

  const { data: storesRaw, error: storesErr } = await storesQuery
  if (storesErr) {
    log.error("Erro buscando lojas", { error: storesErr.message })
    throw new Error(`Erro buscando lojas: ${storesErr.message}`)
  }

  const stores = (storesRaw ?? []) as StoreRow[]
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
      reasons.push("Sinalizado manualmente (modo demo)")
      healthState = "attention"
      healthScore = 70
    }

    const { error } = await admin
      .from("weekly_pipeline_states")
      .upsert(
        {
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
        },
        { onConflict: "store_id,week_start", ignoreDuplicates: false },
      )

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
