/**
 * GET /api/admin/campaign-central/cycle
 *
 * Retorna:
 *   - cycle: ciclo atual (último ready/partial, ou último gerando)
 *   - suggestions: sugestões desse ciclo (status suggested + approved + dismissed)
 *   - trends: temas em alta do ciclo
 *   - counts: agregados pras tab badges
 *
 * Query params:
 *   ?cycle_id=<uuid> — histórico (carrega ciclo específico)
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "campaign-central:cycle")

    const admin = createAdminClient()
    const cycleId = request.nextUrl.searchParams.get("cycle_id")

    let cycle = null
    if (cycleId) {
      const { data } = await admin
        .from("campaign_cycles")
        .select("*")
        .eq("org_id", ctx.orgId)
        .eq("id", cycleId)
        .maybeSingle()
      cycle = data
    } else {
      // Último ciclo terminal (ready/partial); se nenhum, pega o último generating
      const { data: terminal } = await admin
        .from("campaign_cycles")
        .select("*")
        .eq("org_id", ctx.orgId)
        .in("status", ["ready", "partial"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (terminal) {
        cycle = terminal
      } else {
        const { data: latest } = await admin
          .from("campaign_cycles")
          .select("*")
          .eq("org_id", ctx.orgId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        cycle = latest
      }
    }

    if (!cycle) {
      return successResponse(request, {
        cycle: null,
        suggestions: [],
        trends: [],
        counts: { pending: 0, approved: 0, dismissed: 0, dates_upcoming: 0, attention: 0 },
      })
    }

    const [suggestionsRes, trendsRes, datesRes] = await Promise.all([
      admin
        .from("campaign_suggestions")
        .select("*")
        .eq("org_id", ctx.orgId)
        .eq("cycle_id", cycle.id)
        .order("created_at", { ascending: false }),
      admin
        .from("campaign_trends")
        .select("*")
        .eq("cycle_id", cycle.id)
        .order("created_at", { ascending: false }),
      admin
        .from("commemorative_dates")
        .select("country", { count: "exact", head: true })
        .eq("is_active", true),
    ])

    if (suggestionsRes.error) throw suggestionsRes.error
    if (trendsRes.error) throw trendsRes.error

    const suggestions = suggestionsRes.data ?? []
    const counts = {
      pending: suggestions.filter((s) => s.status === "suggested").length,
      approved: suggestions.filter((s) => s.status === "approved").length,
      dismissed: suggestions.filter((s) => s.status === "dismissed").length,
      dates_upcoming:
        (cycle.context as { dates_in_window?: number } | null)?.dates_in_window ??
        datesRes.count ??
        0,
      attention:
        (cycle.context as { attention_count?: number } | null)?.attention_count ?? 0,
    }

    return successResponse(request, {
      cycle,
      suggestions,
      trends: trendsRes.data ?? [],
      counts,
    })
  } catch (error) {
    return errorResponse(request, error, "campaign-central:cycle")
  }
}
