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
      org_id: string
      store_name: string
      contract_end_date: string
      mrr_cents: number | null
      client:
        | {
            id: string
            name: string
            email: string | null
            phone: string | null
            owner_id: string | null
          }
        | Array<{
            id: string
            name: string
            email: string | null
            phone: string | null
            owner_id: string | null
          }>
        | null
    }

    const { data: storesRaw, error } = await admin
      .from("client_stores")
      .select(
        `id, org_id, store_name, contract_end_date, mrr_cents,
         client:clients(id, name, email, phone, owner_id)`,
      )
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
          .from("crm_leads")
          .select("id")
          .eq("store_id", store.id)
          .eq("scope", "cs")
          .eq("category", "renewal_opportunity")
          .in("status", ["new", "qualified"])
          .limit(1)
          .maybeSingle()

        if (existing) {
          skipped += 1
          continue
        }

        const daysToEnd = Math.ceil(
          (new Date(store.contract_end_date).getTime() - now.getTime()) /
            86_400_000,
        )

        const client = Array.isArray(store.client) ? store.client[0] : store.client

        const urgencyScore = Math.min(
          100,
          Math.round(
            ((RENEWAL_WINDOW_DAYS - daysToEnd) / RENEWAL_WINDOW_DAYS) * 100,
          ),
        )

        const { error: insertErr } = await admin.from("crm_leads").insert({
          org_id: store.org_id,
          name: store.store_name,
          email: client?.email ?? null,
          phone: client?.phone ?? null,
          company: client?.name ?? null,
          source: "manual:renewal-detect",
          status: "new",
          scope: "cs",
          category: "renewal_opportunity",
          store_id: store.id,
          assigned_to: client?.owner_id ?? null,
          notes: `Contrato vence em ${daysToEnd} dia${daysToEnd === 1 ? "" : "s"} (${store.contract_end_date}). MRR ${
            store.mrr_cents
              ? `R$ ${(store.mrr_cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
              : "—"
          }. Acionar renovacao antes do vencimento.`,
          ai_qualification_score: urgencyScore,
          ai_qualification_reason: `Auto-flag por contract_end_date em ${daysToEnd}d`,
        })

        if (insertErr) {
          log.warn("Erro criando renewal lead", {
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
