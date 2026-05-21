/**
 * Vercel Cron — Daily renewal opportunity detection.
 *
 * Schedule: 0 7 * * * (7h UTC = 04h America/Sao_Paulo)
 *
 * Cria lead CS com category='renewal_opportunity' pra cada loja ativa
 * cujo contract_end_date entra na janela de 60 dias. Idempotente:
 * skip lojas que ja tem lead aberto na mesma categoria.
 *
 * Workflow esperado:
 *   1. Cron flagga -> lead aparece em /admin/operacional/leads
 *   2. CSM tria -> converte em deal no pipeline "Renovacao de Contrato"
 *   3. Deal segue stages ate Renovado/Cancelado
 *
 * Janela de 60d foi escolhida pra dar tempo de:
 *   - 1 reuniao de diagnostico de resultado
 *   - 1 ciclo de proposta + negociacao
 *   - Buffer pra reducao de plano ou cancelamento (extit interview)
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"

const log = logger.child("CronRenewalOpportunities")

export const dynamic = "force-dynamic"
export const maxDuration = 300

const RENEWAL_WINDOW_DAYS = 60

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const result = await detectRenewalOpportunities()
    log.info("Renewal opportunity cron completed", result)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    log.error("Renewal opportunity cron failed:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    )
  }
}

interface RenewalResult {
  scanned: number
  in_window: number
  created: number
  skipped: number
  errors: number
}

async function detectRenewalOpportunities(): Promise<RenewalResult> {
  const admin = createAdminClient()

  const now = new Date()
  const todayISO = now.toISOString().slice(0, 10)
  const windowEnd = new Date(now)
  windowEnd.setDate(windowEnd.getDate() + RENEWAL_WINDOW_DAYS)
  const windowEndISO = windowEnd.toISOString().slice(0, 10)

  // Lojas ativas com contract_end_date na janela [hoje, hoje+60d]
  type StoreRow = {
    id: string
    client_id: string
    org_id: string
    store_name: string
    contract_end_date: string
    mrr_cents: number | null
  }

  const { data: storesRaw, error } = await admin
    .from("client_stores")
    .select("id, client_id, org_id, store_name, contract_end_date, mrr_cents")
    .eq("is_active", true)
    .not("contract_end_date", "is", null)
    .gte("contract_end_date", todayISO)
    .lte("contract_end_date", windowEndISO)
    .returns<StoreRow[]>()

  if (error) {
    throw new Error(`Erro buscando lojas: ${error.message}`)
  }

  const stores = storesRaw ?? []
  let created = 0
  let skipped = 0
  let errors = 0

  for (const store of stores) {
    try {
      // Ja existe alert ativo pra essa loja?
      const { data: existing } = await admin
        .from("store_alerts")
        .select("id")
        .eq("store_id", store.id)
        .eq("type", "renewal_due")
        .eq("status", "active")
        .limit(1)
        .maybeSingle()

      if (existing) {
        skipped += 1
        continue
      }

      if (!store.client_id) {
        // FK requerida em store_alerts
        skipped += 1
        continue
      }

      const daysToEnd = Math.ceil(
        (new Date(store.contract_end_date).getTime() - now.getTime()) /
          86_400_000,
      )

      // Severidade pela urgencia: <=7d critical, <=30d warning, resto info
      const severity =
        daysToEnd <= 7
          ? "critical"
          : daysToEnd <= 30
            ? "warning"
            : "info"

      const mrrLabel = store.mrr_cents
        ? `R$ ${(store.mrr_cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
        : "—"

      const { error: insertErr } = await admin.from("store_alerts").insert({
        store_id: store.id,
        client_id: store.client_id,
        type: "renewal_due",
        severity,
        title: `Renovacao em ${daysToEnd} dia${daysToEnd === 1 ? "" : "s"}`,
        message: `Contrato vence em ${store.contract_end_date}. MRR ${mrrLabel}. Acionar renovacao antes do vencimento.`,
        status: "active",
        metadata: {
          contract_end_date: store.contract_end_date,
          days_to_end: daysToEnd,
          mrr_cents: store.mrr_cents,
          source: "cron:renewal-opportunities",
        },
      })

      if (insertErr) {
        log.warn("Erro criando renewal_due alert", {
          store_id: store.id,
          error: insertErr.message,
        })
        errors += 1
      } else {
        created += 1
      }
    } catch (err) {
      log.error("Store error", { store_id: store.id, err })
      errors += 1
    }
  }

  return {
    scanned: stores.length,
    in_window: stores.length,
    created,
    skipped,
    errors,
  }
}
