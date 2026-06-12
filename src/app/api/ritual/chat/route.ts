import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import type { MessageParam, ContentBlockParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { OMNISEND_TOOLS, executeOmnisendTool } from "@/lib/integrations/omnisend/ritual-tools"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { recordAiUsage } from "@/lib/services/ai-usage.service"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

const log = logger.child("RitualChat")

export const maxDuration = 90

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

const SYSTEM_PROMPT = `Você é o copiloto da Convertfy durante o ritual semanal de sexta-feira.
Sua função: ajudar o time (Bruno, Jean, Ryan) a diagnosticar performance
de email marketing de uma loja e sugerir ações concretas.

DADOS DO ADMIN CONVERTFY (pré-carregados):
Você já recebe no contexto dados REAIS do nosso sistema:
- Cadastro da loja (nome, nicho, MRR, NPS, health score, contrato)
- Estado no pipeline semanal (health_state, flag_reason)
- Resumo de receita (total, campanhas, flows, pedidos)
- Últimos 3 relatórios semanais (métricas, highlights, alertas)
- Tasks pendentes atribuídas à loja
- Solicitações abertas do cliente
- Status do onboarding
- Últimas 3 calls de feedback
- Campanhas Omnisend dos últimos 30d (cache)
- Automações Omnisend dos últimos 30d (cache)

FERRAMENTAS OMNISEND (ao vivo):
Quando precisar de dados MAIS RECENTES ou detalhados do Omnisend,
use estas ferramentas que consultam a API ao vivo:
- omnisend_list_campaigns: campanhas recentes com métricas
- omnisend_get_campaign: detalhes de uma campanha específica
- omnisend_list_automations: flows/automações ativas
- omnisend_list_segments: segmentos de contatos
- omnisend_segment_stats: estatísticas de um segmento
- omnisend_campaign_analytics: relatório de analytics por período
- omnisend_brand_info: informações da conta Omnisend
- omnisend_list_contacts: listar contatos com filtros

QUANDO USAR FERRAMENTAS vs CONTEXTO:
- Se o contexto pré-carregado já responde → NÃO chame ferramenta
- Perguntas sobre campanhas específicas → omnisend_get_campaign
- Dados de HOJE (não nos últimos 30d do cache) → use ferramentas
- "Qual o tamanho da lista?" → omnisend_list_segments
- "Compara campanhas do mês" → omnisend_campaign_analytics

REGRAS:
- Responda em português brasileiro, direto e prático
- Use bullet points quando listar coisas
- Cite números específicos dos dados fornecidos — nunca invente
- Quando sugerir ações, seja específico com responsável: Mariana (Designer), Pedro (Ops), Jean (Estrategista), Ryan (CS)
- Se a ferramenta retornar erro, informe ao time e sugira alternativa
- Referência de dados do admin: [Admin: métrica] e do Omnisend: [Omnisend: nome-do-item]
- Se a loja tem tasks pendentes ou solicitações abertas, MENCIONE no diagnóstico
- Formato para diagnóstico:
  1. Diagnóstico (1-2 frases)
  2. Evidências (bullets com números reais)
  3. Ações sugeridas (2-3 com responsável e prazo)
  4. Métrica pra acompanhar`

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

const MAX_TOOL_ROUNDS = 3

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

    const [
      storeRes, reportsRes, pipelineRes, callsRes,
      campaignsRes, automationsRes,
      revenueRes, tasksRes, requestsRes, onbRes,
    ] = await Promise.all([
      admin
        .from("client_stores")
        .select(
          "id, store_name, niche, country, mrr_cents, created_at, email_platform, currency, contract_end_date, org_id, " +
            "health_score, nps_last_score, nps_last_at, " +
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

      admin
        .from("store_revenue_summary")
        .select("omnisend_total_revenue, omnisend_campaign_revenue, omnisend_flow_revenue, omnisend_total_orders, updated_at")
        .eq("store_id", body.store_id)
        .eq("period_label", "30d")
        .maybeSingle(),

      admin
        .from("tasks")
        .select("id, title, status, priority, due_date, assignee_id")
        .eq("store_id", body.store_id)
        .in("status", ["pending", "in_progress", "blocked"])
        .order("due_date", { ascending: true })
        .limit(10),

      admin
        .from("client_store_requests")
        .select("id, title, status, priority, created_at")
        .eq("store_id", body.store_id)
        .in("status", ["open", "in_progress"])
        .limit(5),

      admin
        .from("onboardings")
        .select("id, status, briefing_status, completed_at, created_at")
        .eq("store_id", body.store_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
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
      org_id: string
      health_score: number | null
      nps_last_score: number | null
      nps_last_at: string | null
      client: { name: string } | { name: string }[] | null
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new AppError("ANTHROPIC_API_KEY não configurada", 500)

    let omnisendApiKey: string | null = null
    try {
      const creds = await getStoreCredentials(body.store_id, store.org_id)
      omnisendApiKey = creds.omnisend_api_key ?? null
    } catch { /* store may not have Omnisend configured */ }

    const ageDays = Math.floor((Date.now() - new Date(store.created_at).getTime()) / 86_400_000)

    const rawCampaigns = (campaignsRes.data ?? []) as unknown as Array<Record<string, unknown>>
    const rawAutomations = (automationsRes.data ?? []) as unknown as Array<Record<string, unknown>>

    const revData = revenueRes.data as unknown as {
      omnisend_total_revenue?: number | null
      omnisend_campaign_revenue?: number | null
      omnisend_flow_revenue?: number | null
      omnisend_total_orders?: number | null
      updated_at?: string | null
    } | null

    const pendingTasks = ((tasksRes.data ?? []) as unknown as Array<{
      id: string; title: string; status: string; priority: string; due_date: string | null
    }>).map((t) => ({
      titulo: t.title,
      status: t.status,
      prioridade: t.priority,
      vencimento: t.due_date,
    }))

    const openRequests = ((requestsRes.data ?? []) as unknown as Array<{
      id: string; title: string; status: string; priority: string; created_at: string
    }>).map((r) => ({
      titulo: r.title,
      status: r.status,
      prioridade: r.priority,
      criada_em: r.created_at,
    }))

    const onb = onbRes.data as unknown as {
      id?: string; status?: string; briefing_status?: string
      completed_at?: string | null; created_at?: string
    } | null

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
        health_score: store.health_score,
        nps_ultimo: store.nps_last_score,
        nps_data: store.nps_last_at,
        omnisend_conectado: !!omnisendApiKey,
      },
      cliente: store.client,
      pipeline: pipelineRes.data,
      receita_resumo: revData ? {
        receita_total: revData.omnisend_total_revenue,
        receita_campanhas: revData.omnisend_campaign_revenue,
        receita_flows: revData.omnisend_flow_revenue,
        total_pedidos: revData.omnisend_total_orders,
        atualizado_em: revData.updated_at,
      } : null,
      onboarding: onb ? {
        status: onb.status,
        briefing_status: onb.briefing_status,
        concluido_em: onb.completed_at,
      } : null,
      tasks_pendentes: pendingTasks,
      solicitacoes_abertas: openRequests,
      ultimos_3_reports: reportsRes.data,
      ultimas_3_calls: callsRes.data,
      omnisend_campanhas_30d_cache: rawCampaigns.map((c) => ({
        nome: c.campaign_name, data: c.send_time, subject: c.subject,
        enviados: c.recipients, abertura: c.open_rate ? `${c.open_rate}%` : null,
        ctr: c.click_rate ? `${c.click_rate}%` : null, receita: c.conversion_value,
      })),
      omnisend_automacoes_30d_cache: rawAutomations.map((a) => ({
        nome: a.flow_name, status: a.flow_status, trigger: a.trigger_type,
        enviados: a.recipients, abertura: a.open_rate ? `${a.open_rate}%` : null,
        ctr: a.click_rate ? `${a.click_rate}%` : null, receita: a.conversion_value,
      })),
    }

    const systemWithCtx = `${SYSTEM_PROMPT}\n\n=== CONTEXTO DA LOJA (DADOS REAIS DO ADMIN CONVERTFY + OMNISEND) ===\n${JSON.stringify(ctx, null, 2)}`

    const tools = omnisendApiKey ? OMNISEND_TOOLS : []

    const ai = new Anthropic({ apiKey })

    let apiMessages: MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    let finalText = ""
    const sources: string[] = []
    let totalInputTokens = 0
    let totalOutputTokens = 0
    const llmT0 = Date.now()

    if (rawCampaigns.length > 0) sources.push("omnisend.campaigns.cache")
    if (rawAutomations.length > 0) sources.push("omnisend.automations.cache")
    if (reportsRes.data && reportsRes.data.length > 0) sources.push("admin.weekly_reports")
    if (pipelineRes.data) sources.push("admin.pipeline")
    if (callsRes.data && callsRes.data.length > 0) sources.push("admin.feedback_calls")
    if (revData) sources.push("admin.revenue_summary")
    if (pendingTasks.length > 0) sources.push("admin.tasks")
    if (openRequests.length > 0) sources.push("admin.requests")
    if (onb) sources.push("admin.onboarding")

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await ai.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: systemWithCtx,
        messages: apiMessages,
        ...(tools.length > 0 ? { tools } : {}),
      })

      totalInputTokens += response.usage?.input_tokens ?? 0
      totalOutputTokens += response.usage?.output_tokens ?? 0

      if (response.stop_reason === "end_turn" || response.stop_reason !== "tool_use") {
        for (const block of response.content) {
          if (block.type === "text") {
            finalText += block.text
          }
        }
        break
      }

      const toolResults: ToolResultBlockParam[] = []
      const assistantContent: ContentBlockParam[] = []

      for (const block of response.content) {
        if (block.type === "text") {
          assistantContent.push(block)
          finalText += block.text
        } else if (block.type === "tool_use") {
          assistantContent.push(block)

          if (!omnisendApiKey) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify({ error: "Omnisend não configurado para esta loja" }),
            })
            continue
          }

          log.info("[RitualChat] tool_use", {
            tool: block.name,
            input: block.input,
            storeId: body.store_id,
          })

          const result = await executeOmnisendTool(
            block.name,
            block.input as Record<string, unknown>,
            omnisendApiKey,
          )

          if (!sources.includes(`omnisend.${block.name}.live`)) {
            sources.push(`omnisend.${block.name}.live`)
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          })
        }
      }

      apiMessages = [
        ...apiMessages,
        { role: "assistant", content: assistantContent },
        { role: "user", content: toolResults },
      ]
    }

    log.info("[RitualChat] response", {
      storeId: body.store_id,
      messageCount: messages.length,
      textLength: finalText.length,
      sources,
      toolCalls: sources.filter((s) => s.includes(".live")).length,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    })

    void recordAiUsage({
      feature: "ritual_chat",
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      tokensInput: totalInputTokens,
      tokensOutput: totalOutputTokens,
      durationMs: Date.now() - llmT0,
      storeId: body.store_id ?? null,
      context: {
        tool_calls: sources.filter((s) => s.includes(".live")).length,
      },
    })

    return successResponse(request, {
      message: { role: "assistant", content: finalText },
      sources,
      tokens: { input: totalInputTokens, output: totalOutputTokens },
    })
  } catch (error) {
    return errorResponse(request, error, "RitualChat")
  }
}
