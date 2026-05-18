/**
 * Briefing Generation Service
 *
 * Gera o briefing a partir das respostas do formulario via Claude
 * (Anthropic SDK) e persiste em `onboardings.briefing`.
 *
 * Marca status como "generating" antes da chamada e "generated_pending_review"
 * quando salva. Se a IA falhar, volta pra "not_started" com mensagem de erro
 * em `briefing.error`.
 */

import Anthropic from "@anthropic-ai/sdk"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { BriefingContent } from "@/types/onboarding-pipeline"

const log = logger.child("BriefingGeneration")

const SYSTEM_PROMPT = `Você é assistente da Convertfy (agência de email marketing). Sua tarefa: a partir das respostas do formulário de onboarding de uma loja, gerar um BRIEFING estruturado em JSON com a forma:

{
  "about_brand": "...",
  "audience": "...",
  "language_tone": "...",
  "visual_identity": {
    "palette": "...",
    "fonts": "...",
    "references": "..."
  },
  "offers_and_differentials": "..."
}

Cada campo deve ter 2-5 frases em português, direto e prático. Use os dados das respostas. Se algum dado faltar, use bom senso. NÃO inclua nenhum texto fora do JSON.`

export async function generateBriefing(onboardingId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: onb } = await admin
    .from("onboardings")
    .select(
      "id, org_id, form_responses, client_id, store_id, client:clients!onboardings_client_id_fkey(name), store:client_stores(store_name, store_url, platform)",
    )
    .eq("id", onboardingId)
    .maybeSingle()
  if (!onb) {
    log.warn("Onboarding nao encontrado pra gerar briefing", { onboardingId })
    return
  }

  await admin
    .from("onboardings")
    .update({ briefing_status: "generating" })
    .eq("id", onboardingId)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    log.error("ANTHROPIC_API_KEY nao configurada — briefing nao pode ser gerado")
    await markBriefingFailed(onboardingId, "API key da IA nao configurada")
    return
  }

  try {
    const client = new Anthropic({ apiKey })
    const userPrompt = `Respostas do formulario:\n${JSON.stringify(onb.form_responses, null, 2)}\n\nLoja:\n${JSON.stringify(onb.store, null, 2)}\n\nCliente:\n${JSON.stringify(onb.client, null, 2)}\n\nGere o briefing em JSON.`

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    })

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : ""

    // Extrai JSON do response (Claude as vezes envolve em ```json)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      await markBriefingFailed(onboardingId, "Resposta da IA invalida")
      return
    }

    const briefing = JSON.parse(jsonMatch[0]) as BriefingContent
    await saveBriefing(onboardingId, briefing)
  } catch (e) {
    log.error("Geracao do briefing falhou", e)
    await markBriefingFailed(onboardingId, (e as Error).message)
  }
}

async function markBriefingFailed(
  onboardingId: string,
  reason: string,
): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from("onboardings")
    .update({
      briefing_status: "not_started",
      briefing: { error: reason } as unknown as BriefingContent,
    })
    .eq("id", onboardingId)
}

async function saveBriefing(
  onboardingId: string,
  briefing: BriefingContent,
): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  await admin
    .from("onboardings")
    .update({
      briefing: { ...briefing, generated_at: now },
      briefing_status: "generated_pending_review",
      briefing_generated_at: now,
    })
    .eq("id", onboardingId)

  const { data: onb } = await admin
    .from("onboardings")
    .select("org_id")
    .eq("id", onboardingId)
    .maybeSingle()
  await admin.from("events").insert({
    event_type: "onboarding.briefing_generated",
    entity_type: "onboarding",
    entity_id: onboardingId,
    actor_id: null,
    actor_type: "system",
    payload: { onboarding_id: onboardingId },
    metadata: { org_id: onb?.org_id },
  })
}
