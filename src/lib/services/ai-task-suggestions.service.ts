/**
 * AI Task Suggestions Service
 *
 * Gera 3 variações de copy para tasks de email-marketing (welcome, cart,
 * checkout, post-purchase, etc) usando o Brand Brain do cliente.
 *
 * Mesma stack do briefing-generation.service.ts:
 *  - Anthropic SDK (claude-sonnet-4-6)
 *  - Resposta em JSON estruturado
 *  - Cache em tasks.ai_suggestions
 *
 * Variações geradas: "direto" | "beneficio" | "pergunta"
 */

import Anthropic from "@anthropic-ai/sdk"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("AITaskSuggestions")

const MODEL = "claude-sonnet-4-6"

export interface AIVariation {
  label: "direto" | "beneficio" | "pergunta"
  headline: string
  body: string
  cta: string
}

export interface AISuggestionsResult {
  generated_at: string
  model: string
  target_block: string
  variations: AIVariation[]
}

const SYSTEM_PROMPT = `Você é copywriter especialista em email marketing e-commerce brasileiro da Convertfy.

Sua tarefa: gerar 3 variações de copy para um email/bloco específico, baseado no Brand Brain do cliente. Cada variação usa uma abordagem diferente:

1. **direto** — assertivo, foco em ação imediata, frases curtas
2. **beneficio** — destaca o que cliente ganha, valor concreto
3. **pergunta** — engaja por curiosidade, abre dúvida na mente

Retorne APENAS JSON válido (sem markdown, sem texto extra) na forma:

{
  "variations": [
    { "label": "direto", "headline": "...", "body": "...", "cta": "..." },
    { "label": "beneficio", "headline": "...", "body": "...", "cta": "..." },
    { "label": "pergunta", "headline": "...", "body": "...", "cta": "..." }
  ]
}

Regras:
- Headline: máx 60 chars, sem ponto final
- Body: 2-4 frases, ~200-400 chars
- CTA: 2-4 palavras (ex: "Conheça agora", "Quero garantir")
- Português brasileiro
- Tom alinhado ao Brand Brain do cliente
- Sem clichês como "transforme sua vida", "única chance", "imperdível"
- Foco no problema real do cliente, não em features genéricas`

export async function generateAISuggestions(
  taskId: string,
  targetBlock: string = "hero",
): Promise<AISuggestionsResult | null> {
  const admin = createAdminClient()

  // Busca task com onboarding (pra acessar Brand Brain)
  const { data: taskRaw, error: taskErr } = await admin
    .from("tasks")
    .select(
      "id, title, description, onboarding_id, org_id, " +
        "onboarding:onboardings(id, briefing, visual_assets, " +
        "client:clients!onboardings_client_id_fkey(name), " +
        "store:client_stores(store_name, niche, language))",
    )
    .eq("id", taskId)
    .maybeSingle()

  if (taskErr || !taskRaw) {
    log.warn("Task nao encontrada", { taskId, error: taskErr?.message })
    return null
  }

  const task = taskRaw as unknown as {
    id: string
    title: string
    description: string | null
    onboarding_id: string | null
    org_id: string
    onboarding:
      | {
          id: string
          briefing: Record<string, unknown> | null
          visual_assets: Record<string, unknown> | null
          client: { name: string } | { name: string }[] | null
          store: { store_name: string; niche: string | null; language: string | null } | null
        }
      | Array<{
          id: string
          briefing: Record<string, unknown> | null
          visual_assets: Record<string, unknown> | null
          client: { name: string } | { name: string }[] | null
          store: { store_name: string; niche: string | null; language: string | null } | null
        }>
      | null
  }

  const onb = Array.isArray(task.onboarding) ? task.onboarding[0] : task.onboarding
  if (!onb) {
    log.warn("Task sem onboarding linkado", { taskId })
    return null
  }

  const briefing = onb.briefing as Record<string, unknown> | null
  if (!briefing) {
    log.warn("Onboarding sem briefing (Brand Brain). IA precisa do contexto", {
      taskId,
      onboardingId: onb.id,
    })
    return null
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    log.error("ANTHROPIC_API_KEY nao configurada")
    return null
  }

  const client = Array.isArray(onb.client) ? onb.client[0] : onb.client
  const store = Array.isArray(onb.store) ? onb.store[0] : onb.store

  const userPrompt = `Contexto da loja:
- Marca: ${client?.name ?? "—"}
- Loja: ${store?.store_name ?? "—"} (${store?.niche ?? "—"})
- Idioma: ${store?.language ?? "pt-BR"}

Brand Brain:
${JSON.stringify(briefing, null, 2)}

Task atual:
- Título: ${task.title}
- Descrição: ${task.description ?? "(sem descrição)"}
- Bloco do email: ${targetBlock}

Gere 3 variações de copy em JSON conforme o formato especificado.`

  try {
    const ai = new Anthropic({ apiKey })
    const response = await ai.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    })

    const text = response.content[0]?.type === "text" ? response.content[0].text : ""
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      log.error("Resposta da IA sem JSON identificavel", { taskId, text: text.slice(0, 200) })
      return null
    }

    const parsed = JSON.parse(jsonMatch[0]) as { variations: AIVariation[] }
    if (!Array.isArray(parsed.variations) || parsed.variations.length !== 3) {
      log.error("Resposta da IA sem 3 variacoes", { taskId, parsed })
      return null
    }

    const result: AISuggestionsResult = {
      generated_at: new Date().toISOString(),
      model: MODEL,
      target_block: targetBlock,
      variations: parsed.variations,
    }

    // Cache em tasks.ai_suggestions
    await admin
      .from("tasks")
      .update({ ai_suggestions: result })
      .eq("id", taskId)

    log.info("[AITaskSuggestions] 3 variacoes geradas com sucesso", {
      taskId,
      targetBlock,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    })

    return result
  } catch (e) {
    log.error("Geracao de variacoes falhou", e)
    return null
  }
}
