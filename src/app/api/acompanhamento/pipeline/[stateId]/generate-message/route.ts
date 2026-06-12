import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { recordAiUsage } from "@/lib/services/ai-usage.service"
import { logger } from "@/lib/logger"

const log = logger.child("AcompanhamentoGenerateMessage")

export const maxDuration = 60

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

const SYSTEM_PROMPT = `Você é Customer Success Manager da Convertfy, escrevendo
mensagem semanal pro cliente via WhatsApp. Tom: direto, próximo, focado em valor.

Estrutura:
1. Saudação personalizada (nome + dia da semana)
2. Resumo do que foi feito na semana (1-2 frases)
3. Insight ou destaque (1 número específico)
4. Próximo passo claro (1 ação)
5. Encerramento curto

Regras:
- Máximo 800 caracteres
- Português brasileiro
- Sem emojis exceto se contexto pedir (ex: comemoração)
- Sem clichês ("imperdível", "única chance", "transforme")
- Foco no específico, não no genérico
- Termina convidando resposta ou colocando-se à disposição

Retorne APENAS o texto da mensagem, sem prefixo, sem assinaturas extras.`

/**
 * POST /api/acompanhamento/pipeline/[stateId]/generate-message
 *
 * Gera mensagem IA personalizada pro WhatsApp do cliente baseada em:
 *  - Ações aprovadas na call
 *  - Brand brain do onboarding (se houver)
 *  - Latest weekly report
 *  - Health state e MRR
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stateId: string }> },
) {
  try {
    const { stateId } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const admin = createAdminClient()
    const { data: stateRaw } = await admin
      .from("weekly_pipeline_states")
      .select(
        "id, store_id, health_state, health_score, approved_actions, flag_reason, " +
          "store:client_stores(id, store_name, niche, " +
          "client:clients!client_stores_client_id_fkey(name, " +
          "owner:profiles!clients_owner_id_fkey(name)))",
      )
      .eq("id", stateId)
      .maybeSingle()

    if (!stateRaw) throw new AppError("Estado não encontrado", 404)

    const state = stateRaw as unknown as {
      id: string
      store_id: string
      health_state: string
      health_score: number
      approved_actions: unknown[]
      flag_reason: string | null
      store: {
        id: string
        store_name: string
        niche: string | null
        client: { name: string; owner: { name: string } | null } | null
      } | null
    }

    if (!state.store) throw new AppError("Loja não vinculada", 400)

    // Latest weekly report pro contexto
    const { data: latestReport } = await admin
      .from("weekly_reports")
      .select("highlights, concerns, metrics, ai_summary")
      .eq("store_id", state.store_id)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new AppError("ANTHROPIC_API_KEY não configurada", 500)

    const clientName = state.store.client?.name ?? state.store.store_name
    const csName = state.store.client?.owner?.name ?? "Time Convertfy"

    const ctx = {
      cliente: clientName,
      loja: state.store.store_name,
      nicho: state.store.niche ?? "—",
      health: `${state.health_state} (${state.health_score})`,
      motivo_flag: state.flag_reason ?? "monitoramento regular",
      acoes_aprovadas: state.approved_actions,
      destaques_semana: latestReport?.highlights ?? [],
      preocupacoes_semana: latestReport?.concerns ?? [],
      ai_summary_anterior: latestReport?.ai_summary ?? null,
      cs_assinatura: csName,
    }

    const userPrompt = `Gere a mensagem semanal pra esse cliente:\n\n${JSON.stringify(ctx, null, 2)}`

    const ai = new Anthropic({ apiKey })
    const llmT0 = Date.now()
    const response = await ai.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    })

    void recordAiUsage({
      feature: "acompanhamento_message",
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      tokensInput: response.usage?.input_tokens ?? 0,
      tokensOutput: response.usage?.output_tokens ?? 0,
      durationMs: Date.now() - llmT0,
      storeId: state.store_id,
      context: { state_id: stateId },
    })

    const text = response.content[0]?.type === "text" ? response.content[0].text : ""
    const cleaned = text.trim()

    if (!cleaned) {
      throw new AppError("IA retornou resposta vazia", 500)
    }

    // Salva no state
    await admin
      .from("weekly_pipeline_states")
      .update({
        ai_message: cleaned,
        ai_message_generated_at: new Date().toISOString(),
      })
      .eq("id", stateId)

    log.info("[Acompanhamento] Mensagem IA gerada", {
      stateId,
      storeName: state.store.store_name,
      length: cleaned.length,
    })

    return successResponse(request, { message: cleaned })
  } catch (error) {
    return errorResponse(request, error, "AcompanhamentoGenerateMessage")
  }
}
