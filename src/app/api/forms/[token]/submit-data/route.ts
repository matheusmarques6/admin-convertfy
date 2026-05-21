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
import { autoCompleteChecklistsForFormSections } from "@/lib/services/onboarding-auto-checklist.service"

// Slugs validos das secoes do wizard (form-tela1-client.tsx SECTIONS).
// Usados pra normalizar form_sections_completed e evitar lixo no JSONB.
const VALID_SECTION_SLUGS = new Set([
  "empresa",
  "loja",
  "marca",
  "cliente",
  "objetivos",
  "materiais",
])

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
    let body: {
      responses?: Record<string, unknown>
      completed_section_slug?: string
    }
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
    // completed_section_slug e opcional (frontend pode nao enviar em submits
    // legados). So validamos quando vier.
    if (
      body.completed_section_slug !== undefined &&
      (typeof body.completed_section_slug !== "string" ||
        !VALID_SECTION_SLUGS.has(body.completed_section_slug))
    ) {
      return NextResponse.json(
        { error: "completed_section_slug invalido" },
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
        "id, briefing_status, briefing_confirmed_by_client, briefing_started_at, form_responses, form_sections_completed",
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

    // Compara form_responses antigo vs novo. Se idênticos, não regenera
    // (evita tokens + 30s+ de espera por nada quando cliente clica next
    // sem ter alterado nada).
    const responsesChanged =
      JSON.stringify(onb.form_responses ?? {}) !==
      JSON.stringify(body.responses)

    // Set-union de form_sections_completed (idempotente: re-submeter mesma
    // secao nao duplica). Apenas atualiza quando completed_section_slug e
    // novo, evitando UPDATE desnecessario.
    const existingSections = (onb.form_sections_completed ?? []) as string[]
    let updatedSections = existingSections
    if (
      body.completed_section_slug &&
      !existingSections.includes(body.completed_section_slug)
    ) {
      updatedSections = [...existingSections, body.completed_section_slug]
    }

    await admin
      .from("onboardings")
      .update({
        form_responses: body.responses,
        form_submitted_at: new Date().toISOString(),
        briefing_status: "form_partially_filled",
        form_sections_completed: updatedSections,
      })
      .eq("id", onb.id)

    // Fire-and-forget: marca task_checklists com auto_complete_on que
    // batem com as secoes completadas (AUTO·CLIENTE da Etapa 02).
    if (body.completed_section_slug) {
      after(autoCompleteChecklistsForFormSections(onb.id, updatedSections))
    }

    // Detecta geração stuck: status="generating" mas briefing_started_at
    // foi há muito tempo (function morreu, Anthropic não respondeu).
    // Trata como se status fosse "not_started" — libera re-disparo.
    const isStuck =
      onb.briefing_status === "generating" &&
      onb.briefing_started_at &&
      Date.now() - new Date(onb.briefing_started_at).getTime() >
        BRIEFING_STUCK_THRESHOLD_MS

    // Dispara generateBriefing somente se:
    //   - está stuck (libera retry), OU
    //   - status não bloqueia (≠ generating/approved) E
    //   - houve mudança real nas respostas (evita regeneração inútil)
    // Exceção: se briefing nunca foi gerado (status=not_started/
    // form_partially_filled), sempre tenta — primeira geração precisa rodar.
    const isFirstGeneration = [
      "not_started",
      "form_partially_filled",
    ].includes(onb.briefing_status as string)
    const statusAllowsGeneration = !["generating", "approved"].includes(
      onb.briefing_status as string,
    )
    const shouldGenerate =
      isStuck ||
      (statusAllowsGeneration && (isFirstGeneration || responsesChanged))

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
