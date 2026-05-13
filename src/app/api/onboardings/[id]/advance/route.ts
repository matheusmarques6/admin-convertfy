import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { advanceColumn } from "@/lib/services/onboarding-pipeline.service"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const body = await request.json().catch(() => ({}))

    const result = await advanceColumn({
      onboardingId: id,
      actorId: user.id,
      forceOverride: body.override
        ? {
            justification: body.override.justification,
            itemsSkipped: body.override.items_skipped ?? [],
          }
        : undefined,
    })
    if (!result.ok) throw new AppError(result.error ?? "Falha ao avancar", 409)
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "onboarding-advance")
  }
}
