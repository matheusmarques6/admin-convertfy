/**
 * GET /api/admin/campaign-central/automations
 *
 * Lista o REGISTRO INTERNO de transições do board (campaign_automation_runs)
 * da org, mais recentes primeiro. Cada linha é um avanço de coluna de um card
 * (integration='internal'); a aba mostra um histórico de auditoria. A escrita é
 * feita fire-and-forget pelo motor (central-automation.service.ts) quando um
 * card avança no board.
 *
 * NÃO há vendors externos: o envio/agendamento é manual na Omnisend. Aqui só
 * resolvemos o nome de quem moveu (join best-effort com profiles).
 *
 * Padrão das rotas vizinhas: createAdminClient (via service-role) + requireAuth
 * + org membership + errorResponse/successResponse.
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import type {
  CampaignAutomationRun,
  CampaignAutomationRunView,
} from "@/types/campaign-automation"

export const dynamic = "force-dynamic"

/** Quantas transições trazer no histórico (a aba mostra um log enxuto). */
const RUNS_LIMIT = 200

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "automations:list")

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("campaign_automation_runs")
      .select(
        "id, org_id, suggestion_id, pipeline_item_id, from_column, to_column, integration, status, error_message, triggered_by, duration_ms, created_at",
      )
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false })
      .limit(RUNS_LIMIT)

    if (error) return errorResponse(request, error, "automations:list")

    const runs = (data ?? []) as CampaignAutomationRun[]

    // Resolve o nome de quem moveu cada card (best-effort, 1 query agregada).
    const moverIds = Array.from(
      new Set(runs.map((r) => r.triggered_by).filter((id): id is string => Boolean(id))),
    )
    const nameById = new Map<string, string>()
    if (moverIds.length > 0) {
      const { data: profs } = await admin
        .from("profiles")
        .select("id, name, email")
        .in("id", moverIds)
      for (const p of profs ?? []) {
        const display = (p.name as string | null) || (p.email as string | null) || null
        if (display) nameById.set(p.id as string, display)
      }
    }

    const views: CampaignAutomationRunView[] = runs.map((r) => ({
      ...r,
      moved_by_name: r.triggered_by ? nameById.get(r.triggered_by) ?? null : null,
    }))

    return successResponse(request, { runs: views, count: views.length })
  } catch (error) {
    return errorResponse(request, error, "automations:list")
  }
}
