import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { OnboardingSyncService } from "@/lib/services/onboarding-sync.service"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingSeedTasks")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * POST /api/onboarding/[id]/seed-tasks
 *
 * Creates board tasks for all pending onboarding steps that don't have
 * a linked task yet. Used for backfill on existing onboardings.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: onboardingId } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    // Verify the onboarding exists and is accessible
    const { data: onboarding, error } = await supabase
      .from("client_onboardings")
      .select("id, status")
      .eq("id", onboardingId)
      .single()

    if (error || !onboarding) {
      throw new AppError("Onboarding não encontrado", 404)
    }

    if (onboarding.status === "cancelled") {
      throw new AppError("Onboarding cancelado — não é possível criar tasks", 400)
    }

    const result = await OnboardingSyncService.seedTasks(onboardingId)

    log.info("Seed tasks completed", { onboardingId, ...result })

    return successResponse(request, {
      ...result,
      message: `${result.created} tasks criadas, ${result.skipped} ignoradas, ${result.errors} erros`,
    })
  } catch (err) {
    return errorResponse(request, err, "OnboardingSeedTasks")
  }
}
