/**
 * POST /api/admin/campaign-central/production/[id]/reopen
 *
 * Reabre um pipeline_item em rascunho — garante uma campaign_suggestion
 * 'suggested' atrelada e a retorna pra UI abrir o CopyPanel. Cobre cards
 * legados (sem suggestion) e cards aprovados que voltam pra retrabalho.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { reopenAsDraft } from "@/lib/services/campaign-central/production.service"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "production:reopen")

    const suggestion = await reopenAsDraft({
      orgId: ctx.orgId,
      pipelineItemId: id,
      userId: user.id,
    })

    return successResponse(request, { suggestion })
  } catch (error) {
    return errorResponse(request, error, "production:reopen")
  }
}
