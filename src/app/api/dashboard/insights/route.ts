import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  getUnifiedRevenue,
  getUnifiedCampaigns,
  getUnifiedFlows,
} from "@/lib/services/unified-metrics.service"
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

    const [revenueRows, campaignRows, flowRows, { data: alerts }, { data: storesMeta }] = await Promise.all([
      getUnifiedRevenue(supabase, orgId, [period]),
      getUnifiedCampaigns(supabase, orgId, period),
      getUnifiedFlows(supabase, orgId, period, undefined, true),
      supabase
        .from("store_alerts")
        .select("type, severity, title, message, store:client_stores(store_name)")
        .eq("status", "active")
        .limit(20),
      supabase
        .from("client_stores")
        .select("id, store_name, email_platform")
        .eq("org_id", orgId)
        .eq("is_active", true),
    ])

    const storeNames = new Map<string, string>()
    const platformCount = { klaviyo: 0, omnisend: 0, none: 0 }
    for (const s of storesMeta || []) {
      storeNames.set(s.id, s.store_name || "Loja")
      const p = (s.email_platform as string) || "none"
      if (p === "klaviyo" || p === "omnisend" || p === "none") {
        platformCount[p as keyof typeof platformCount]++
      }
    }

    const totalStores = revenueRows.length
    const totalRevenue = revenueRows.reduce((s, r) => s + r.total_revenue, 0)
    const totalCampRevenue = revenueRows.reduce((s, r) => s + r.campaign_revenue, 0)
    const totalFlowRevenue = revenueRows.reduce((s, r) => s + r.flow_revenue, 0)

    const totalRecipients = campaignRows.reduce((s, c) => s + c.recipients, 0)
    const totalDelivered = campaignRows.reduce((s, c) => s + c.delivered, 0)
    const totalOpened = campaignRows.reduce((s, c) => s + c.opened, 0)
    const totalClicked = campaignRows.reduce((s, c) => s + c.clicked, 0)
    const totalBounced = campaignRows.reduce((s, c) => s + c.bounced, 0)
    const totalUnsubs = campaignRows.reduce((s, c) => s + c.unsubscribed, 0)

    const avgOpenRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0
    const avgClickRate = totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0
    const avgBounceRate = totalRecipients > 0 ? (totalBounced / totalRecipients) * 100 : 0
    const avgUnsubRate = totalDelivered > 0 ? (totalUnsubs / totalDelivered) * 100 : 0

    const flowSummary = flowRows.slice(0, 10).map((f) => {
      const storeName = storeNames.get(f.store_id) || "Loja"
      return `${storeName} [${f.platform}] — ${f.flow_name || "Flow"}: conv ${f.conversion_rate.toFixed(1)}%, receita R$${Math.round(f.conversion_value)}`
    }).join("\n")

    const alertsSummary = (alerts || []).slice(0, 10).map((a) => {
      const store = Array.isArray(a.store) ? a.store[0] : a.store
      return `[${a.severity}] ${store?.store_name || "Loja"}: ${a.title} — ${a.message}`
    }).join("\n")

    const dataContext = `
Periodo: ultimos ${period}

Plataformas em uso:
  - Klaviyo: ${platformCount.klaviyo} loja(s)
  - Omnisend: ${platformCount.omnisend} loja(s)
  - Sem plataforma conectada: ${platformCount.none} loja(s)

Total de lojas com receita: ${totalStores}
Receita total (agregada Klaviyo + Omnisend): R$ ${Math.round(totalRevenue).toLocaleString("pt-BR")}
  - Campanhas: R$ ${Math.round(totalCampRevenue).toLocaleString("pt-BR")}
  - Automacoes/Flows: R$ ${Math.round(totalFlowRevenue).toLocaleString("pt-BR")}

Metricas de envio (cross-plataforma):
  Open Rate medio: ${avgOpenRate.toFixed(1)}%
  Click Rate medio: ${avgClickRate.toFixed(1)}%
  Bounce Rate medio: ${avgBounceRate.toFixed(2)}%
  Unsub Rate medio: ${avgUnsubRate.toFixed(2)}%
  Total enviados: ${totalRecipients.toLocaleString("pt-BR")}

Flows ativos (top 10, incluindo Klaviyo + Omnisend):
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
          content: `Voce e um analista senior de email marketing para e-commerce. Analise os dados da agencia (que gerencia lojas usando Klaviyo OU Omnisend) e gere EXATAMENTE 4 insights acionaveis em JSON.

Cada insight deve ter:
- type: "positive" | "warning" | "critical" | "opportunity"
- title: frase curta (max 60 chars)
- description: 1-2 frases explicando o dado e o impacto (max 200 chars)
- action: 1 frase com a acao recomendada (max 100 chars)

Responda APENAS com o array JSON, sem markdown.`,
        },
        { role: "user", content: dataContext },
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
      platformBreakdown: platformCount,
    })
  } catch (error) {
    log.error("Insights error:", error)
    return errorResponse(request, error, "insights")
  }
}
