/**
 * GET /api/admin/campaign-central/automations
 *
 * Lista as runs de automação por transição de coluna (campaign_automation_runs)
 * da org, mais recentes primeiro, + contagem por integração (cards do topo da
 * aba Automações). A escrita das runs é feita fire-and-forget pelo motor
 * (central-automation.service.ts) quando um card avança no board.
 *
 * Padrão das rotas vizinhas: createAdminClient (via service-role) + requireAuth
 * + org membership + errorResponse/successResponse.
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import type {
  AutomationIntegration,
  CampaignAutomationRun,
} from "@/types/campaign-automation"

export const dynamic = "force-dynamic"

/** Quantas runs trazer no histórico (a aba mostra um log enxuto). */
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
      .select("*")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false })
      .limit(RUNS_LIMIT)

    if (error) return errorResponse(request, error, "automations:list")

    const runs = (data ?? []) as CampaignAutomationRun[]

    // Contagem por integração pros cards do topo.
    const counts: Record<AutomationIntegration, number> = {
      clickup: 0,
      slack: 0,
      omnisend: 0,
      ga: 0,
      internal: 0,
    }
    for (const r of runs) {
      counts[r.integration] = (counts[r.integration] ?? 0) + 1
    }

    return successResponse(request, { runs, counts, count: runs.length })
  } catch (error) {
    return errorResponse(request, error, "automations:list")
  }
}
