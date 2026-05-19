/**
 * POST /api/forms/[token]/retry-briefing
 *
 * Dispara generateBriefing novamente sem mexer em form_responses.
 * Usado quando o cliente vê "demorou demais" e quer tentar de novo.
 *
 * Só dispara se: briefing ainda não foi confirmado E
 * (status != "generating" OU briefing_started_at > 90s atrás).
 */

import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { generateBriefing } from "@/lib/services/briefing-generation.service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const BRIEFING_STUCK_THRESHOLD_MS = 90_000

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const admin = createAdminClient()

    const { data: onb } = await admin
      .from("onboardings")
      .select(
        "id, briefing_status, briefing_confirmed_by_client, briefing_started_at, form_responses",
      )
      .eq("form_token", token)
      .maybeSingle()

    if (!onb) {
      return NextResponse.json({ error: "Token inválido" }, { status: 404 })
    }

    if (onb.briefing_confirmed_by_client) {
      return NextResponse.json(
        { error: "Briefing já confirmado" },
        { status: 409 },
      )
    }

    if (!onb.form_responses || Object.keys(onb.form_responses).length === 0) {
      return NextResponse.json(
        { error: "Formulário ainda não foi preenchido" },
        { status: 400 },
      )
    }

    // Permite retry apenas se não está gerando agora OU se está stuck
    const isStuck =
      onb.briefing_status === "generating" &&
      onb.briefing_started_at &&
      Date.now() - new Date(onb.briefing_started_at).getTime() >
        BRIEFING_STUCK_THRESHOLD_MS

    if (onb.briefing_status === "generating" && !isStuck) {
      return NextResponse.json(
        {
          error:
            "Briefing ainda está sendo gerado. Aguarde mais alguns segundos.",
        },
        { status: 409 },
      )
    }

    after(generateBriefing(onb.id))

    return NextResponse.json({
      success: true,
      onboarding_id: onb.id,
      recovered_from_stuck: isStuck,
    })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}
