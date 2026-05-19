/**
 * Cron domingo 22:00 UTC: reseta pipeline semanal e flag automaticamente
 * lojas que precisam atenção pra Etapa 1.
 *
 * Lógica de flag:
 *  1. Lojas em risco (health_score < 50)
 *  2. Lojas em atenção (50-69)
 *  3. Lojas em rampup (< 60 dias na Convertfy)
 *  4. Lojas com renovação próxima (contract_end_date <= 30 dias)
 *  5. Lojas com solicitações abertas (client_store_requests status=open)
 *
 * Idempotente: se já rodou pra essa semana, soft-deactiva os estados
 * anteriores e cria novos.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("WeeklyAcompanhamentoResetCron")

export const dynamic = "force-dynamic"
export const maxDuration = 120

function nextMonday(): string {
  // Próxima segunda (em UTC). Domingo 22h → segunda do dia seguinte.
  const now = new Date()
  const dow = now.getUTCDay()
  const daysUntilMonday = dow === 0 ? 1 : (8 - dow) % 7 || 7
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() + daysUntilMonday)
  monday.setUTCHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

function thisMonday(): string {
  const now = new Date()
  const dow = now.getUTCDay()
  const offset = dow === 0 ? 6 : dow - 1
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - offset)
  monday.setUTCHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

interface StoreRow {
  id: string
  org_id: string
  store_name: string
  created_at: string
  contract_end_date: string | null
  mrr_cents: number | null
}

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()

    // Determina semana alvo (próxima segunda). Se rodar manualmente em
    // outro dia, usa segunda da semana corrente.
    const now = new Date()
    const isSunday = now.getUTCDay() === 0
    const week = isSunday ? nextMonday() : thisMonday()

    // 1. Soft-deactivate estados ativos das semanas anteriores
    await admin
      .from("weekly_pipeline_states")
      .update({ is_active: false })
      .neq("week_start", week)
      .eq("is_active", true)

    // 2. Pega todas as lojas ativas
    const { data: storesRaw } = await admin
      .from("client_stores")
      .select("id, org_id, store_name, created_at, contract_end_date, mrr_cents")
      .eq("is_active", true)
      .limit(500)

    const stores = (storesRaw ?? []) as StoreRow[]
    if (stores.length === 0) {
      return NextResponse.json({ success: true, week, flagged: 0, message: "Sem lojas ativas" })
    }

    let flagged = 0
    let skipped = 0

    for (const store of stores) {
      const reasons: string[] = []
      let healthState: "rampup" | "healthy" | "attention" | "risk" | "renewal" = "healthy"
      let healthScore = 70

      // 1) Rampup
      const ageDays = Math.floor((Date.now() - new Date(store.created_at).getTime()) / 86_400_000)
      if (ageDays < 60) {
        healthState = "rampup"
        healthScore = 60
        reasons.push(`Loja há ${ageDays}d na Convertfy (ramp-up)`)
      }

      // 2) Renovação próxima
      if (store.contract_end_date) {
        const daysToEnd = Math.floor(
          (new Date(store.contract_end_date).getTime() - Date.now()) / 86_400_000,
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
        reasons.push(`Solicitações abertas`)
        if (healthState === "healthy") {
          healthState = "attention"
          healthScore = 65
        }
      }

      // 4) Weekly report latest — sinaliza se highlights == 0 e concerns > 0
      const { data: latestReport } = await admin
        .from("weekly_reports")
        .select("highlights, concerns, metrics")
        .eq("store_id", store.id)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestReport) {
        const concernsCount = Array.isArray(latestReport.concerns) ? latestReport.concerns.length : 0
        const highlightsCount = Array.isArray(latestReport.highlights) ? latestReport.highlights.length : 0
        if (concernsCount >= 3) {
          healthState = "risk"
          healthScore = Math.min(healthScore, 40)
          reasons.push(`${concernsCount} alertas no último report`)
        } else if (concernsCount >= 1 && highlightsCount === 0) {
          healthState = healthState === "rampup" ? "rampup" : "attention"
          healthScore = Math.min(healthScore, 60)
          reasons.push(`Sem destaques + ${concernsCount} alertas`)
        }
      }

      // Só flag se há motivo (saudável + sem flags = skip)
      if (reasons.length === 0 && healthState === "healthy") {
        skipped++
        continue
      }

      // Upsert estado pra essa semana
      const { error } = await admin
        .from("weekly_pipeline_states")
        .upsert(
          {
            org_id: store.org_id,
            store_id: store.id,
            week_start: week,
            current_stage: 1,
            health_state: healthState,
            health_score: healthScore,
            flag_reason: reasons.join(" · "),
            flagged_by: "system",
            flagged_at: new Date().toISOString(),
            is_active: true,
          },
          { onConflict: "store_id,week_start", ignoreDuplicates: false },
        )

      if (error) {
        log.error("Erro upsert weekly_pipeline_states", { storeId: store.id, error: error.message })
      } else {
        flagged++
      }
    }

    log.info("[WeeklyAcompanhamentoReset] done", { week, total: stores.length, flagged, skipped })

    return NextResponse.json({
      success: true,
      week,
      total_stores: stores.length,
      flagged,
      skipped,
    })
  } catch (e) {
    log.error("Reset cron failed", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
