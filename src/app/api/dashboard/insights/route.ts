import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import OpenAI from "openai"
import { logger } from "@/lib/logger"

const log = logger.child("Insights")

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET(request: NextRequest) {
  try {
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)
    const supabase = await createAdminClient()

    const period = request.nextUrl.searchParams.get("period") || "30d"

    const [{ data: revRows }, { data: campRows }, { data: flowRows }, { data: alerts }] = await Promise.all([
      supabase
        .from("store_revenue_summary")
        .select("store_id, klaviyo_total_revenue, klaviyo_campaign_revenue, klaviyo_flow_revenue, total_leads, engaged_leads, engagement_rate, client_stores!inner(store_name)")
        .eq("org_id", orgId)
        .eq("period_label", period),
      supabase
        .from("klaviyo_campaign_metrics")
        .select("store_id, recipients, delivered, opened, clicked, bounced, unsubscribed, conversion_value, client_stores!inner(store_name)")
        .eq("org_id", orgId)
        .eq("period_label", period),
      supabase
        .from("klaviyo_flow_metrics")
        .select("store_id, flow_name, recipients, delivered, conversions, conversion_rate, conversion_value, client_stores!inner(store_name)")
        .eq("org_id", orgId)
        .eq("period_label", period)
        .eq("flow_status", "live"),
      supabase
        .from("store_alerts")
        .select("type, severity, title, message, store:client_stores(store_name)")
        .eq("status", "active")
        .limit(20),
    ])

    const totalStores = new Set((revRows || []).map((r) => r.store_id)).size
    const totalRevenue = (revRows || []).reduce((s, r) => s + Number(r.klaviyo_total_revenue), 0)
    const totalCampRevenue = (revRows || []).reduce((s, r) => s + Number(r.klaviyo_campaign_revenue), 0)
    const totalFlowRevenue = (revRows || []).reduce((s, r) => s + Number(r.klaviyo_flow_revenue), 0)

    const totalRecipients = (campRows || []).reduce((s, c) => s + (Number(c.recipients) || 0), 0)
    const totalDelivered = (campRows || []).reduce((s, c) => s + (Number(c.delivered) || 0), 0)
    const totalOpened = (campRows || []).reduce((s, c) => s + (Number(c.opened) || 0), 0)
    const totalClicked = (campRows || []).reduce((s, c) => s + (Number(c.clicked) || 0), 0)
    const totalBounced = (campRows || []).reduce((s, c) => s + (Number(c.bounced) || 0), 0)
    const totalUnsubs = (campRows || []).reduce((s, c) => s + (Number(c.unsubscribed) || 0), 0)

    const avgOpenRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0
    const avgClickRate = totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0
    const avgBounceRate = totalRecipients > 0 ? (totalBounced / totalRecipients) * 100 : 0
    const avgUnsubRate = totalDelivered > 0 ? (totalUnsubs / totalDelivered) * 100 : 0

    const flowSummary = (flowRows || []).slice(0, 10).map((f) => {
      const store = (f.client_stores as unknown as { store_name: string })
      return `${store?.store_name || "Loja"} — ${f.flow_name}: conv ${(Number(f.conversion_rate) || 0).toFixed(1)}%, receita R$${Math.round(Number(f.conversion_value) || 0)}`
    }).join("\n")

    const alertsSummary = (alerts || []).slice(0, 10).map((a) => {
      const store = Array.isArray(a.store) ? a.store[0] : a.store
      return `[${a.severity}] ${store?.store_name || "Loja"}: ${a.title} — ${a.message}`
    }).join("\n")

    const dataContext = `
Periodo: ultimos ${period}
Total de lojas ativas: ${totalStores}
Receita total Klaviyo: R$ ${Math.round(totalRevenue).toLocaleString("pt-BR")}
  - Campanhas: R$ ${Math.round(totalCampRevenue).toLocaleString("pt-BR")}
  - Automacoes/Flows: R$ ${Math.round(totalFlowRevenue).toLocaleString("pt-BR")}
Open Rate medio: ${avgOpenRate.toFixed(1)}%
Click Rate medio: ${avgClickRate.toFixed(1)}%
Bounce Rate medio: ${avgBounceRate.toFixed(2)}%
Unsub Rate medio: ${avgUnsubRate.toFixed(2)}%
Total enviados: ${totalRecipients.toLocaleString("pt-BR")}

Flows ativos (top 10):
${flowSummary || "Sem dados de flows"}

Alertas ativos:
${alertsSummary || "Nenhum alerta ativo"}
`.trim()

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return successResponse(request, {
        insights: [{
          type: "info",
          title: "IA nao configurada",
          description: "Configure OPENAI_API_KEY no .env para habilitar insights automaticos.",
          action: null,
        }],
        period,
        generatedAt: new Date().toISOString(),
      })
    }

    const openai = new OpenAI({ apiKey })
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: `Voce e um analista senior de email marketing para e-commerce. Analise os dados da agencia e gere EXATAMENTE 4 insights acionaveis em JSON.

Cada insight deve ter:
- type: "positive" | "warning" | "critical" | "opportunity"
- title: frase curta (max 60 chars)
- description: 1-2 frases explicando o dado e o impacto (max 200 chars)
- action: 1 frase com a acao recomendada (max 100 chars)

Responda APENAS com o array JSON, sem markdown.`,
        },
        {
          role: "user",
          content: dataContext,
        },
      ],
    })

    let insights
    try {
      const text = response.choices[0]?.message?.content?.trim() || "[]"
      insights = JSON.parse(text)
    } catch {
      log.warn("Failed to parse AI response, using fallback")
      insights = [{
        type: "info",
        title: "Analise em andamento",
        description: "Nao foi possivel gerar insights neste momento. Tente novamente.",
        action: null,
      }]
    }

    return successResponse(request, {
      insights,
      period,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    log.error("Insights error:", error)
    return errorResponse(request, error, "insights")
  }
}
