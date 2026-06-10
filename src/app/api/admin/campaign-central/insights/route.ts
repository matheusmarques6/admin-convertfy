/**
 * GET /api/admin/campaign-central/insights
 *
 * Rail da tela: lojas em atenção + emails campeões (benchmark Omnisend).
 * `ideas` de cada loja em atenção = count de sugestões pendentes que a
 * incluem nos targets.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { loadAttentionStores } from "@/lib/services/campaign-central/attention-stores.service"
import { loadBenchmarkEmails } from "@/lib/services/campaign-central/benchmark.service"
import type { SuggestionTarget } from "@/types/campaign-central"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "campaign-central:insights")

    const admin = createAdminClient()

    const [attention, benchmark, suggestionsRes] = await Promise.all([
      loadAttentionStores(ctx.orgId),
      loadBenchmarkEmails(ctx.orgId).catch(() => []),
      admin
        .from("campaign_suggestions")
        .select("id, targets, status")
        .eq("org_id", ctx.orgId)
        .eq("status", "suggested"),
    ])

    // ideas por loja = sugestões pendentes que incluem a loja nos targets
    const ideasByStore = new Map<string, number>()
    for (const s of suggestionsRes.data ?? []) {
      for (const t of (s.targets ?? []) as SuggestionTarget[]) {
        ideasByStore.set(t.store_id, (ideasByStore.get(t.store_id) ?? 0) + 1)
      }
    }
    const attentionWithIdeas = attention.map((a) => ({
      ...a,
      ideas: ideasByStore.get(a.store_id) ?? 0,
    }))

    return successResponse(request, {
      attention: attentionWithIdeas,
      benchmark,
    })
  } catch (error) {
    return errorResponse(request, error, "campaign-central:insights")
  }
}
