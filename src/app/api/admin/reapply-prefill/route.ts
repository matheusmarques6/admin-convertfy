/**
 * POST /api/admin/reapply-prefill
 *
 * Re-aplica o pre-fill 03->05 (pilotos do preview -> sub_items da Etapa 05 +
 * email_flow_emails como `ready`) sob demanda, sem reavancar a fase. Owner/
 * manager only.
 *
 * Use para lojas legadas que ja estavam em `emails_finais` antes do pre-fill
 * existir, ou que tiveram os pilotos preenchidos depois da transicao.
 *
 * Body (opcional):
 *   { "onboarding_ids": ["uuid", ...] }  -> roda so nesses
 *   (vazio/ausente)                       -> todos in_progress em emails_finais
 *
 * Idempotente e nao-destrutivo: nao sobrescreve sub_items editados manualmente.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { requireOnboardingPermission } from "@/lib/api/onboarding-permissions"
import { reapplyPreFillForOnboardings } from "@/lib/services/onboarding-pre-fill.service"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const bodySchema = z.object({
  onboarding_ids: z.array(z.string().uuid()).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    await requireOnboardingPermission(user.id, "admin")

    const raw = await request.json().catch(() => ({}))
    const { onboarding_ids } = bodySchema.parse(raw ?? {})

    const result = await reapplyPreFillForOnboardings(
      onboarding_ids ?? null,
      user.id,
    )
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "reapply-prefill")
  }
}
