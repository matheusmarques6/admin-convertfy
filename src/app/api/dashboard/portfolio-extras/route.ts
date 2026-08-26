import { withTiming } from "@/lib/api/with-timing"
/**
 * GET /api/dashboard/portfolio-extras
 *
 * Métricas de carteira que nenhuma rota agregava (cards novos do
 * Dashboard Operacional — sem mock, então nasceram aqui):
 *
 * - churn_30d: assinaturas canceladas nos últimos 30 dias (clientes
 *   distintos + MRR mensalizado perdido). A tabela não tem
 *   cancelled_at; updated_at da linha cancelada é o proxy — a
 *   transição de status é o último write no fluxo normal.
 * - no_send_14d: lojas ATIVAS sem campanha enviada há 14+ dias
 *   (inclui quem nunca enviou), via send_time das tabelas de métricas
 *   Klaviyo + Omnisend.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  storesWithoutRecentSend,
  summarizeChurn,
  type ChurnedSubRow,
} from "@/lib/services/ops-dashboard/portfolio"

export const dynamic = "force-dynamic"

const CHURN_DAYS = 30
const NO_SEND_DAYS = 14

async function handleGet(request: NextRequest) {
  try {
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const now = Date.now()
    const churnSince = new Date(now - CHURN_DAYS * 86_400_000).toISOString()
    const sendCutoff = new Date(now - NO_SEND_DAYS * 86_400_000).toISOString()

    const [storesQ, subsQ] = await Promise.all([
      admin
        .from("client_stores")
        .select("id, store_name")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .limit(500),
      admin
        .from("client_subscriptions")
        .select("client_id, value, cycle, updated_at, clients!inner(org_id)")
        .eq("clients.org_id", orgId)
        .eq("status", "cancelled")
        .gte("updated_at", churnSince),
    ])
    if (storesQ.error) throw storesQ.error
    if (subsQ.error) throw subsQ.error

    const activeStores = storesQ.data ?? []
    const storeIds = activeStores.map((s) => s.id)

    // Quem ENVIOU na janela (Klaviyo + Omnisend). Duas queries pequenas
    // com o índice de send_time; o complemento são as lojas paradas.
    const recentSenders = new Set<string>()
    if (storeIds.length > 0) {
      const [kQ, oQ] = await Promise.all([
        admin
          .from("klaviyo_campaign_metrics")
          .select("store_id")
          .in("store_id", storeIds)
          .gte("send_time", sendCutoff)
          .limit(5000),
        admin
          .from("omnisend_campaign_metrics")
          .select("store_id")
          .in("store_id", storeIds)
          .gte("send_time", sendCutoff)
          .limit(5000),
      ])
      // Loja Omnisend não deve sumir do card por erro na tabela Klaviyo
      // (e vice-versa) — mas erro de schema aqui é fatal mesmo.
      if (kQ.error) throw kQ.error
      if (oQ.error) throw oQ.error
      for (const r of kQ.data ?? []) recentSenders.add(r.store_id as string)
      for (const r of oQ.data ?? []) recentSenders.add(r.store_id as string)
    }

    const silent = storesWithoutRecentSend(activeStores, recentSenders)
    const churn = summarizeChurn((subsQ.data ?? []) as unknown as ChurnedSubRow[])

    return successResponse(request, {
      churn_30d: { clients: churn.clients, mrr_cents: churn.mrr_cents, window_days: CHURN_DAYS },
      no_send_14d: {
        count: silent.length,
        store_names: silent.slice(0, 10).map((s) => s.store_name),
        window_days: NO_SEND_DAYS,
      },
    })
  } catch (error) {
    return errorResponse(request, error, "dashboard-portfolio-extras")
  }
}

export const GET = withTiming("dashboard/portfolio-extras", handleGet)
