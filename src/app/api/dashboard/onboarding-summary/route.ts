import { withTiming } from "@/lib/api/with-timing"
/**
 * GET /api/dashboard/onboarding-summary
 *
 * Resumo agregado do onboarding pro Dashboard Operacional: em
 * andamento, tempo médio, CONCLUÍDOS em 30d (nenhuma query fazia esse
 * count — o kanban filtra .neq completed), atrasados por SLA da
 * coluna, distribuição pelas fases e os mais antigos parados.
 *
 * Linhas magras (id + datas + coluna + nome da loja) em vez da lista
 * completa com tasks aninhadas que o kanban baixa.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  summarizeOnboardings,
  type OnboardingRow,
  type PipelineColumnRow,
} from "@/lib/services/ops-dashboard/onboarding"

export const dynamic = "force-dynamic"

interface RawOnboarding {
  id: string
  current_column_id: string | null
  entered_at: string | null
  last_column_change_at: string | null
  store: { store_name: string | null } | { store_name: string | null }[] | null
}

async function handleGet(request: NextRequest) {
  try {
    const uc = await createClient()
    const user = await requireAuth(uc)
    await resolveOrgId(user.id) // 403 sem org — premissa single-org do módulo (igual /api/onboardings)
    const admin = createAdminClient()

    const completedSince = new Date(Date.now() - 30 * 86_400_000).toISOString()

    const [colsQ, rowsQ, completedQ] = await Promise.all([
      admin
        .from("operational_pipeline_columns")
        .select("id, name, slug, position, color, sla_hours")
        .order("position"),
      admin
        .from("onboardings")
        .select("id, current_column_id, entered_at, last_column_change_at, store:client_stores(store_name)")
        .eq("status", "in_progress")
        .limit(1000),
      admin
        .from("onboardings")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("completed_at", completedSince),
    ])
    if (colsQ.error) throw colsQ.error
    if (rowsQ.error) throw rowsQ.error
    if (completedQ.error) throw completedQ.error

    const rows: OnboardingRow[] = ((rowsQ.data ?? []) as unknown as RawOnboarding[]).map((r) => {
      const store = Array.isArray(r.store) ? r.store[0] : r.store
      return {
        id: r.id,
        current_column_id: r.current_column_id,
        entered_at: r.entered_at,
        last_column_change_at: r.last_column_change_at,
        store_name: store?.store_name ?? null,
      }
    })

    const summary = summarizeOnboardings(rows, (colsQ.data ?? []) as PipelineColumnRow[])

    return successResponse(request, {
      ...summary,
      completed_30d: completedQ.count ?? 0,
    })
  } catch (error) {
    return errorResponse(request, error, "dashboard-onboarding-summary")
  }
}

export const GET = withTiming("dashboard/onboarding-summary", handleGet)
