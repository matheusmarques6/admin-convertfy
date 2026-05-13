/**
 * POST /api/forms/[token]/submit-data
 *
 * Endpoint público (sem auth). Recebe respostas da Tela 1 e dispara
 * geração de briefing assíncrona via n8n ou fallback Claude.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { generateBriefing } from "@/lib/services/briefing-generation.service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const admin = createAdminClient()
    const body = await request.json()
    if (!body.responses || typeof body.responses !== "object") {
      return NextResponse.json(
        { error: "responses obrigatorio (objeto)" },
        { status: 400 },
      )
    }

    const { data: onb } = await admin
      .from("onboardings")
      .select("id, briefing_status")
      .eq("form_token", token)
      .maybeSingle()

    if (!onb) {
      return NextResponse.json(
        { error: "Token inválido" },
        { status: 404 },
      )
    }

    await admin
      .from("onboardings")
      .update({
        form_responses: body.responses,
        form_submitted_at: new Date().toISOString(),
        briefing_status: "form_partially_filled",
      })
      .eq("id", onb.id)

    // Fire-and-forget — não aguarda a IA terminar.
    void generateBriefing(onb.id)

    return NextResponse.json({ success: true, onboarding_id: onb.id })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}
