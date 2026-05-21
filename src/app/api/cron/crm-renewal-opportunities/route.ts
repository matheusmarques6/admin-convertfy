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
    org_id: string
    store_name: string
    contract_end_date: string
    mrr_cents: number | null
    client: {
      id: string
      name: string
      email: string | null
      phone: string | null
      owner_id: string | null
    } | Array<{
      id: string
      name: string
      email: string | null
      phone: string | null
      owner_id: string | null
    }> | null
  }

  const { data: storesRaw, error } = await admin
    .from("client_stores")
    .select(
      `id, org_id, store_name, contract_end_date, mrr_cents,
       client:clients(id, name, email, phone, owner_id)`,
    )
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
      // Ja existe lead aberto pra essa loja na categoria?
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

      // ai_qualification_score: urgencia = janela menor -> mais urgente
      // 60d = 50 pts, 30d = 75 pts, 7d = 95 pts
      const urgencyScore = Math.min(
        100,
        Math.round(((RENEWAL_WINDOW_DAYS - daysToEnd) / RENEWAL_WINDOW_DAYS) * 100),
      )

      const { error: insertErr } = await admin.from("crm_leads").insert({
        org_id: store.org_id,
        name: store.store_name,
        email: client?.email ?? null,
        phone: client?.phone ?? null,
        company: client?.name ?? null,
        source: "cron:renewal-opportunities",
        status: "new",
        scope: "cs",
        category: "renewal_opportunity",
        store_id: store.id,
        assigned_to: client?.owner_id ?? null,
        notes: `Contrato vence em ${daysToEnd} dia${daysToEnd === 1 ? "" : "s"} (${store.contract_end_date}). MRR ${
          store.mrr_cents ? `R$ ${(store.mrr_cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` : "—"
        }. Acionar renovacao antes do vencimento.`,
        ai_qualification_score: urgencyScore,
        ai_qualification_reason: `Auto-flag por contract_end_date em ${daysToEnd}d`,
      })

      if (insertErr) {
        log.warn("Erro criando renewal_opportunity lead", {
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
