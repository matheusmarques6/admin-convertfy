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
    const raw = await request.text()
    // Limite 64KB pro body — protege contra DOS via payload gigante
    if (raw.length > 64 * 1024) {
      return NextResponse.json(
        { error: "Payload muito grande (max 64KB)" },
        { status: 413 },
      )
    }
    let body: { responses?: Record<string, unknown> }
    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: "JSON invalido" }, { status: 400 })
    }
    if (!body.responses || typeof body.responses !== "object") {
      return NextResponse.json(
        { error: "responses obrigatorio (objeto)" },
        { status: 400 },
      )
    }
    // Limite por valor — cada resposta no maximo 5000 chars
    for (const [k, v] of Object.entries(body.responses)) {
      if (typeof v === "string" && v.length > 5000) {
        return NextResponse.json(
          { error: `Resposta "${k}" muito longa (max 5000 chars)` },
          { status: 400 },
        )
      }
    }

    const { data: onb } = await admin
      .from("onboardings")
      .select("id, briefing_status, briefing_confirmed_by_client")
      .eq("form_token", token)
      .maybeSingle()

    if (!onb) {
      return NextResponse.json(
        { error: "Token inválido" },
        { status: 404 },
      )
    }

    // Briefing ja aprovado pelo cliente — nao permite mais submit
    if (onb.briefing_confirmed_by_client) {
      return NextResponse.json(
        { error: "Briefing ja confirmado, nao pode ser alterado" },
        { status: 409 },
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

    // Dispara generateBriefing somente se nao esta gerando OU ja gerado
    // (evita spam e re-geracoes desnecessarias)
    const shouldGenerate = !["generating", "approved"].includes(
      onb.briefing_status as string,
    )
    if (shouldGenerate) {
      // Fire-and-forget — não aguarda a IA terminar.
      void generateBriefing(onb.id)
    }

    return NextResponse.json({
      success: true,
      onboarding_id: onb.id,
      regenerating: shouldGenerate,
    })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}
