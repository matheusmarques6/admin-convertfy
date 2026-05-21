/**
 * POST /api/admin/crm-renewal/detect-now
 *
 * Dispara manualmente a deteccao de oportunidades de renovacao
 * (mesma logica do cron /api/cron/crm-renewal-opportunities). Util
 * pra testar sem esperar o cron das 7h UTC ou pra re-rodar apos
 * ajustes manuais em contract_end_date.
 *
 * Limita ao org_id do user autenticado.
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  requireAuth,
  successResponse,
  AppError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("AdminRenewalDetectNow")

export const dynamic = "force-dynamic"
export const maxDuration = 300

const RENEWAL_WINDOW_DAYS = 60

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: member } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!member) throw new AppError("Usuario sem organizacao ativa", 403)

    const now = new Date()
    const todayISO = now.toISOString().slice(0, 10)
    const windowEnd = new Date(now)
    windowEnd.setDate(windowEnd.getDate() + RENEWAL_WINDOW_DAYS)
    const windowEndISO = windowEnd.toISOString().slice(0, 10)

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
      .eq("org_id", member.org_id)
      .eq("is_active", true)
      .not("contract_end_date", "is", null)
      .gte("contract_end_date", todayISO)
      .lte("contract_end_date", windowEndISO)
      .returns<StoreRow[]>()

    if (error) throw new AppError(error.message, 500)

    const stores = storesRaw ?? []
    let created = 0
    let skipped = 0
    let errors = 0

    for (const store of stores) {
      try {
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
          skipped += 1
          continue
        }

        const daysToEnd = Math.ceil(
          (new Date(store.contract_end_date).getTime() - now.getTime()) /
            86_400_000,
        )

        const severity =
          daysToEnd <= 7 ? "critical" : daysToEnd <= 30 ? "warning" : "info"

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
            source: "manual:renewal-detect",
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

    log.info("Renewal detection manual", {
      org_id: member.org_id,
      scanned: stores.length,
      created,
      skipped,
      errors,
    })

    return successResponse(request, {
      scanned: stores.length,
      created,
      skipped,
      errors,
    })
  } catch (error) {
    return errorResponse(request, error, "admin-renewal-detect-now")
  }
}
