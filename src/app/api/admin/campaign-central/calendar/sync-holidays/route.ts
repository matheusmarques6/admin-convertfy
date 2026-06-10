/**
 * POST /api/admin/campaign-central/calendar/sync-holidays
 *
 * Botão "Sincronizar feriados" na tab Calendário. Puxa os feriados
 * oficiais (Public) dos países das lojas ativas pros 2 anos correntes
 * via Nager.Date e faz upsert no catálogo commemorative_dates. Curadoria
 * comercial manual (Black Friday, Dia do Consumidor, etc.) NÃO é tocada.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { syncHolidaysForOrg } from "@/lib/services/campaign-central/nager-sync.service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "sync-holidays")

    const results = await syncHolidaysForOrg(ctx.orgId)
    const totals = results.reduce(
      (acc, r) => ({
        fetched: acc.fetched + r.fetched,
        inserted: acc.inserted + r.inserted,
        skipped_manual: acc.skipped_manual + r.skipped_manual,
        skipped_existing: acc.skipped_existing + r.skipped_existing,
        failed: acc.failed + (r.error ? 1 : 0),
      }),
      { fetched: 0, inserted: 0, skipped_manual: 0, skipped_existing: 0, failed: 0 },
    )

    return successResponse(request, { results, totals })
  } catch (error) {
    return errorResponse(request, error, "sync-holidays")
  }
}
