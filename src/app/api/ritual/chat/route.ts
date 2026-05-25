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

const SYSTEM_PROMPT = `Você é o copiloto da Convertfy durante o ritual semanal de sexta-feira.
Sua função: ajudar o time (Bruno, Jean, Ryan) a diagnosticar performance
de email marketing de uma loja e sugerir ações concretas.

Você tem acesso a dados REAIS da loja:
- Dados cadastrais (nome, nicho, MRR, tempo na Convertfy)
- Health state e score do pipeline semanal
- Últimos relatórios semanais (métricas, highlights, alertas)
- Campanhas recentes do Omnisend (nome, subject, open rate, CTR, receita)
- Automações ativas do Omnisend (status, performance, receita)
- Histórico de calls anteriores
- Briefing do onboarding

REGRAS:
- Responda em português brasileiro, direto e prático
- Use bullet points quando listar coisas
- Cite números específicos dos dados fornecidos — nunca invente números
- Quando sugerir ações, seja específico: "Trocar subject do welcome flow para X" não "melhorar o welcome flow"
- Sugira responsável: Mariana (Designer), Pedro (Ops), Jean (Estrategista), Ryan (CS)
- Se não tiver dado, diga "não tenho esse dado" — nunca invente
- Quando citar dados de campanha/automação, referencie pelo nome: [Omnisend: nome-da-campanha]
- Formato de resposta para diagnóstico:
  1. Diagnóstico (1-2 frases)
  2. Evidências (bullets com números)
  3. Ações sugeridas (2-3 com responsável e prazo)
  4. Métrica pra acompanhar`

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

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

    const [storeRes, reportsRes, pipelineRes, callsRes, onbRes, campaignsRes, automationsRes] = await Promise.all([
      admin
        .from("client_stores")
        .select(
          "id, store_name, niche, country, mrr_cents, created_at, email_platform, currency, contract_end_date, " +
            "client:clients!client_stores_client_id_fkey(name)",
        )
        .eq("id", body.store_id)
        .maybeSingle(),

      admin
        .from("weekly_reports")
        .select("week_start, metrics, highlights, concerns, ai_summary")
        .eq("store_id", body.store_id)
        .order("week_start", { ascending: false })
        .limit(3),

      admin
        .from("weekly_pipeline_states")
        .select("health_state, health_score, flag_reason, current_stage")
        .eq("store_id", body.store_id)
        .eq("is_active", true)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle(),

      admin
        .from("store_feedback_calls")
        .select("conducted_at, notes, action_items, total_revenue")
        .eq("store_id", body.store_id)
        .order("conducted_at", { ascending: false })
        .limit(3),

      admin
        .from("onboardings")
        .select("briefing, briefing_status")
        .eq("store_id", body.store_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      admin
        .from("omnisend_campaign_metrics")
        .select(
          "campaign_name, send_time, subject, recipients, delivered, " +
            "opened, clicked, conversions, conversion_value, " +
            "open_rate, click_rate, bounce_rate, unsubscribe_rate",
        )
        .eq("store_id", body.store_id)
        .eq("period_label", "30d")
        .order("send_time", { ascending: false })
        .limit(10),

      admin
        .from("omnisend_flow_metrics")
        .select(
          "flow_name, flow_status, trigger_type, recipients, delivered, " +
            "opened, clicked, conversions, conversion_value, " +
            "open_rate, click_rate",
        )
        .eq("store_id", body.store_id)
        .eq("period_label", "30d")
        .order("conversion_value", { ascending: false })
        .limit(10),
    ])

    if (!storeRes.data) throw new AppError("Loja não encontrada", 404)

    const store = storeRes.data as unknown as {
      id: string
      store_name: string
      niche: string | null
      country: string | null
      mrr_cents: number | null
      created_at: string
      email_platform: string | null
      currency: string | null
      contract_end_date: string | null
      client: { name: string } | { name: string }[] | null
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new AppError("ANTHROPIC_API_KEY não configurada", 500)

    const ageDays = Math.floor((Date.now() - new Date(store.created_at).getTime()) / 86_400_000)

    const rawCampaigns = (campaignsRes.data ?? []) as unknown as Array<Record<string, unknown>>
    const campaignsSummary = rawCampaigns.map((c) => ({
      nome: c.campaign_name,
      data: c.send_time,
      subject: c.subject,
      enviados: c.recipients,
      abertura: c.open_rate ? `${c.open_rate}%` : null,
      ctr: c.click_rate ? `${c.click_rate}%` : null,
      receita: c.conversion_value,
      bounce: c.bounce_rate ? `${c.bounce_rate}%` : null,
    }))

    const rawAutomations = (automationsRes.data ?? []) as unknown as Array<Record<string, unknown>>
    const automationsSummary = rawAutomations.map((a) => ({
      nome: a.flow_name,
      status: a.flow_status,
      trigger: a.trigger_type,
      enviados: a.recipients,
      abertura: a.open_rate ? `${a.open_rate}%` : null,
      ctr: a.click_rate ? `${a.click_rate}%` : null,
      conversoes: a.conversions,
      receita: a.conversion_value,
    }))

    const ctx = {
      loja: {
        nome: store.store_name,
        nicho: store.niche,
        pais: store.country,
        plataforma_email: store.email_platform,
        moeda: store.currency,
        mrr: store.mrr_cents && store.mrr_cents > 0 ? Math.round(store.mrr_cents / 100) : null,
        dias_na_convertfy: ageDays,
        vencimento_contrato: store.contract_end_date,
      },
      cliente: store.client,
      pipeline: pipelineRes.data,
      ultimos_3_reports: reportsRes.data,
      ultimas_3_calls: callsRes.data,
      briefing: onbRes.data?.briefing,
      omnisend_campanhas_30d: campaignsSummary,
      omnisend_automacoes_30d: automationsSummary,
    }

    const systemWithCtx = `${SYSTEM_PROMPT}\n\n=== CONTEXTO DA LOJA (DADOS REAIS) ===\n${JSON.stringify(ctx, null, 2)}`

    const ai = new Anthropic({ apiKey })
    const response = await ai.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemWithCtx,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })

    const text = response.content[0]?.type === "text" ? response.content[0].text : ""

    const sources: string[] = []
    if (campaignsSummary.length > 0) sources.push("omnisend.campaigns")
    if (automationsSummary.length > 0) sources.push("omnisend.automations")
    if (reportsRes.data && reportsRes.data.length > 0) sources.push("admin.weekly_reports")
    if (pipelineRes.data) sources.push("admin.pipeline")
    if (callsRes.data && callsRes.data.length > 0) sources.push("admin.feedback_calls")

    log.info("[RitualChat] response", {
      storeId: body.store_id,
      messageCount: messages.length,
      textLength: text.length,
      sources,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    })

    return successResponse(request, {
      message: { role: "assistant", content: text },
      sources,
      tokens: {
        input: response.usage?.input_tokens,
        output: response.usage?.output_tokens,
      },
    })
  } catch (error) {
    return errorResponse(request, error, "RitualChat")
  }
}
