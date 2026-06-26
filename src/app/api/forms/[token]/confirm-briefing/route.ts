import { NextRequest, NextResponse, after } from "next/server"
import { dispatchBriefingWebhook } from "@/lib/services/briefing-webhook.service"
import { autoCompleteOnBriefingApproved } from "@/lib/services/onboarding-auto-checklist.service"
import { attemptOnboardingHandoff } from "@/lib/services/onboarding-task-completion.service"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const body = await request.json()
    if (!body.briefing || typeof body.briefing !== "object") {
      return NextResponse.json(
        { error: "briefing obrigatorio" },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const { data: onboarding } = await admin
      .from("onboardings")
      .select(
        "id, org_id, created_by, briefing_confirmed_by_client, status",
      )
      .eq("form_token", token)
      .maybeSingle()
    if (!onboarding || onboarding.status !== "in_progress") {
      return NextResponse.json(
        { error: "Onboarding nao encontrado" },
        { status: 404 },
      )
    }
    if (onboarding.briefing_confirmed_by_client) {
      return NextResponse.json({ success: true, already_confirmed: true })
    }

    const now = new Date().toISOString()
    const { data: confirmed, error } = await admin
      .from("onboardings")
      .update({
        briefing: { ...body.briefing, confirmed_at: now },
        briefing_status: "approved",
        briefing_confirmed_at: now,
        briefing_confirmed_by_client: true,
      })
      .eq("id", onboarding.id)
      .eq("briefing_confirmed_by_client", false)
      .select("id")
      .maybeSingle()
    if (error) throw error
    if (!confirmed) {
      return NextResponse.json({ success: true, already_confirmed: true })
    }

    await admin.from("events").insert({
      event_type: "onboarding.briefing_confirmed",
      entity_type: "onboarding",
      entity_id: onboarding.id,
      actor_id: null,
      actor_type: "client",
      payload: { onboarding_id: onboarding.id, briefing: body.briefing },
      metadata: { org_id: onboarding.org_id },
    })
    await autoCompleteOnBriefingApproved(onboarding.id as string)

    let handoff = "not_ready"
    if (onboarding.created_by) {
      handoff = await attemptOnboardingHandoff({
        onboardingId: onboarding.id as string,
        actorId: onboarding.created_by as string,
      })
    }
    after(dispatchBriefingWebhook(onboarding.id as string))

    return NextResponse.json({ success: true, handoff })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha" },
      { status: 500 },
    )
  }
}
