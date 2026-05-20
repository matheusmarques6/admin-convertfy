import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("RitualChat")

export const maxDuration = 60

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

const SYSTEM_PROMPT = `Você é assistente de Customer Success da Convertfy.
Sua função: ajudar o time (Bruno, Jean, Ryan) a diagnosticar performance
de uma loja durante o ritual semanal de sexta-feira.

Você tem acesso a:
- Dados da loja (nome, nicho, MRR, idade)
- Health state e score
- Latest weekly_report (métricas, highlights, concerns)
- Onboarding briefing (se houver)
- Histórico de calls anteriores

Responda em português brasileiro, direto e prático.

Use bullet points quando listar coisas. Cite números específicos quando os tiver.
Sugira ações concretas (não vagas). Se não souber algo, diga "não tenho esse dado"
em vez de inventar.

Quando o time pergunta "o que fazer?" ou "qual a próxima ação?", retorne:
- Diagnóstico curto (1 frase)
- 2-3 ações específicas com responsável sugerido (Mariana Designer, Pedro Ops, etc)
- Métrica pra acompanhar`

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

/**
 * POST /api/ritual/chat
 *
 * Chat IA contextualizado pra uma loja específica durante o ritual.
 * Body: { store_id, messages: ChatMessage[] }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    if (!body.store_id) throw new AppError("store_id obrigatório", 400)
    if (!Array.isArray(body.messages)) throw new AppError("messages obrigatório (array)", 400)

    const messages = body.messages as ChatMessage[]
    if (messages.length === 0) throw new AppError("messages não pode ser vazio", 400)

    const admin = createAdminClient()

    // Coleta contexto
    const { data: storeRaw } = await admin
      .from("client_stores")
      .select(
        "id, store_name, niche, country, mrr_cents, created_at, " +
          "client:clients!client_stores_client_id_fkey(name)",
      )
      .eq("id", body.store_id)
      .maybeSingle()

    if (!storeRaw) throw new AppError("Loja não encontrada", 404)

    const store = storeRaw as unknown as {
      id: string
      store_name: string
      niche: string | null
      country: string | null
      mrr_cents: number | null
      created_at: string
      client: { name: string } | { name: string }[] | null
    }

    const { data: latestReport } = await admin
      .from("weekly_reports")
      .select("week_start, metrics, highlights, concerns, ai_summary")
      .eq("store_id", body.store_id)
      .order("week_start", { ascending: false })
      .limit(3)

    const { data: pipelineState } = await admin
      .from("weekly_pipeline_states")
      .select("health_state, health_score, flag_reason, current_stage")
      .eq("store_id", body.store_id)
      .eq("is_active", true)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: latestCalls } = await admin
      .from("store_feedback_calls")
      .select("conducted_at, notes, action_items, total_revenue")
      .eq("store_id", body.store_id)
      .order("conducted_at", { ascending: false })
      .limit(3)

    const { data: onb } = await admin
      .from("onboardings")
      .select("briefing, briefing_status, visual_assets")
      .eq("store_id", body.store_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new AppError("ANTHROPIC_API_KEY não configurada", 500)

    const ageDays = Math.floor((Date.now() - new Date(store.created_at).getTime()) / 86_400_000)

    const ctx = {
      loja: {
        nome: store.store_name,
        nicho: store.niche,
        pais: store.country,
        mrr:
          store.mrr_cents && store.mrr_cents > 0
            ? Math.round(store.mrr_cents / 100)
            : null,
        dias_na_convertfy: ageDays,
      },
      cliente: store.client,
      pipeline: pipelineState,
      ultimos_3_reports: latestReport,
      ultimas_3_calls: latestCalls,
      briefing: onb?.briefing,
    }

    const systemWithCtx = `${SYSTEM_PROMPT}\n\n=== CONTEXTO DA LOJA ===\n${JSON.stringify(ctx, null, 2)}`

    const ai = new Anthropic({ apiKey })
    const response = await ai.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: systemWithCtx,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })

    const text = response.content[0]?.type === "text" ? response.content[0].text : ""

    log.info("[RitualChat] response", {
      storeId: body.store_id,
      messageCount: messages.length,
      length: text.length,
    })

    return successResponse(request, {
      message: { role: "assistant", content: text },
      tokens: {
        input: response.usage?.input_tokens,
        output: response.usage?.output_tokens,
      },
    })
  } catch (error) {
    return errorResponse(request, error, "RitualChat")
  }
}
