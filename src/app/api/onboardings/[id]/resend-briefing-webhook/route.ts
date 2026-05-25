import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { requireOnboardingPermission } from "@/lib/api/onboarding-permissions"
import { dispatchBriefingWebhook } from "@/lib/services/briefing-webhook.service"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    await requireOnboardingPermission(user.id, "advance")

    const admin = createAdminClient()
    const { data: onb } = await admin
      .from("onboardings")
      .select("id, briefing_confirmed_by_client")
      .eq("id", id)
      .maybeSingle()

    if (!onb) throw new AppError("Onboarding nao encontrado", 404)
    if (!onb.briefing_confirmed_by_client) {
      throw new AppError(
        "Briefing ainda nao foi confirmado pelo cliente",
        400,
      )
    }

    await admin.from("events").insert({
      event_type: "onboarding.briefing_webhook_resent",
      entity_type: "onboarding",
      entity_id: id,
      actor_id: user.id,
      actor_type: "user",
      payload: { onboarding_id: id },
    })

    await dispatchBriefingWebhook(id)

    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "resend-briefing-webhook")
  }
}
