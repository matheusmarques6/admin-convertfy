/**
 * POST /api/forms/[token]/submit-data
 *
 * Endpoint público (sem auth). Recebe respostas da Tela 1 e dispara
 * geração de briefing via Claude.
 *
 * Uso de `after()` (Next 15) pra garantir que generateBriefing termina
 * em ambiente serverless — o void cru morre quando a function congela.
 */

import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { generateBriefing } from "@/lib/services/briefing-generation.service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Briefing parado em "generating" por mais que isso é considerado stuck
// (function morreu / Anthropic 5xx). Libera retry no próximo submit-data.
const BRIEFING_STUCK_THRESHOLD_MS = 90_000

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
      .select(
        "id, briefing_status, briefing_confirmed_by_client, briefing_started_at",
      )
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

    // Detecta geração stuck: status="generating" mas briefing_started_at
    // foi há muito tempo (function morreu, Anthropic não respondeu).
    // Trata como se status fosse "not_started" — libera re-disparo.
    const isStuck =
      onb.briefing_status === "generating" &&
      onb.briefing_started_at &&
      Date.now() - new Date(onb.briefing_started_at).getTime() >
        BRIEFING_STUCK_THRESHOLD_MS

    // Dispara generateBriefing somente se nao esta gerando OU ja gerado
    // (evita spam e re-geracoes desnecessarias) — a menos que esteja stuck
    const shouldGenerate =
      isStuck ||
      !["generating", "approved"].includes(onb.briefing_status as string)

    if (shouldGenerate) {
      // after() do Next 15: garante que a Promise termina antes da function
      // congelar em ambiente serverless. Substitui o "void" cru que era
      // descartado pelo runtime.
      after(generateBriefing(onb.id))
    }

    return NextResponse.json({
      success: true,
      onboarding_id: onb.id,
      regenerating: shouldGenerate,
      recovered_from_stuck: isStuck,
    })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}
