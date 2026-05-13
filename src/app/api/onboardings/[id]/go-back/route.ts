import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { goBackToColumn } from "@/lib/services/onboarding-pipeline.service"
import { requireOnboardingPermission } from "@/lib/api/onboarding-permissions"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    await requireOnboardingPermission(user.id, "go_back")
    const body = await request.json()
    if (!body.target_column_slug || !body.feedback || !body.severity) {
      throw new AppError(
        "target_column_slug, feedback e severity sao obrigatorios",
        400,
      )
    }
    const result = await goBackToColumn({
      onboardingId: id,
      targetColumnSlug: body.target_column_slug,
      feedback: body.feedback,
      severity: body.severity,
      actorId: user.id,
    })
    if (!result.ok) throw new AppError(result.error ?? "Falha", 400)
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "onboarding-go-back")
  }
}
