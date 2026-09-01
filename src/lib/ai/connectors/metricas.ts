/**
 * Conector "Métricas" — os dados internos unificados da Convertfy
 * (mesmas fontes do dashboard: store_revenue_summary + caches de
 * campanhas/flows Klaviyo/Omnisend + client_stores). Sempre
 * disponível; escopo automático pela loja da conversa quando há uma.
 */

import {
  getUnifiedCampaigns,
  getUnifiedFlows,
  getUnifiedRevenue,
} from "@/lib/services/unified-metrics.service"
import { convertToBRL } from "@/lib/services/exchange-rate.service"
import { toolJson, type ConnectorTool, type ResolvedConnector } from "./types"

const PERIODS = ["7d", "15d", "30d", "60d", "90d"]

function periodOf(args: Record<string, unknown>): string {
  const p = String(args.period ?? "30d")
  return PERIODS.includes(p) ? p : "30d"
}

const receitaTool: ConnectorTool = {
  label: "Receita unificada",
  def: {
    type: "function",
    function: {
      name: "metricas_receita",
      description:
        "Receita por loja no período: receita total da loja, receita atribuída a email (Klaviyo/Omnisend unificados), % de atribuição e moeda. Se a conversa tem uma loja selecionada, retorna só ela; senão, todas as lojas da organização.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: PERIODS, description: "Janela (default 30d)" },
        },
        required: [],
      },
    },
  },
  execute: async (args, ctx) => {
    const period = periodOf(args)
    const rows = await getUnifiedRevenue(
      ctx.admin,
      ctx.orgId,
      [period],
      ctx.storeId ? [ctx.storeId] : undefined,
    )
    const out = await Promise.all(
      rows.map(async (r) => ({
        store_id: r.store_id,
        periodo: period,
        receita_atribuida_brl: Math.round(
          await convertToBRL(r.total_revenue ?? 0, r.currency || "BRL"),
        ),
        receita_total_loja_brl: Math.round(
          await convertToBRL(r.store_total_revenue ?? 0, r.currency || "BRL"),
        ),
        moeda_original: r.currency,
      })),
    )
    return {
      content: toolJson(out),
      summary: `${out.length} loja${out.length === 1 ? "" : "s"} · ${period}`,
    }
  },
}

const campanhasTool: ConnectorTool = {
  label: "Campanhas de email",
  def: {
    type: "function",
    function: {
      name: "metricas_campanhas",
      description:
        "Campanhas de email enviadas no período (Klaviyo + Omnisend unificados): nome, data de envio, destinatários, open rate, click rate e receita. Ordenadas por receita.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: PERIODS },
          limit: { type: "number", description: "Máx. de campanhas (default 20)" },
        },
        required: [],
      },
    },
  },
  execute: async (args, ctx) => {
    const period = periodOf(args)
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50)
    const rows = await getUnifiedCampaigns(
      ctx.admin,
      ctx.orgId,
      period,
      ctx.storeId ? [ctx.storeId] : undefined,
    )
    const sorted = [...rows]
      .sort((a, b) => (b.conversion_value ?? 0) - (a.conversion_value ?? 0))
      .slice(0, limit)
    return {
      content: toolJson(sorted),
      summary: `${sorted.length} campanhas · ${period}`,
    }
  },
}

const flowsTool: ConnectorTool = {
  label: "Flows / automações",
  def: {
    type: "function",
    function: {
      name: "metricas_flows",
      description:
        "Automações (flows) de email no período (Klaviyo + Omnisend): nome, status, destinatários, open/click rate e receita.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: PERIODS },
        },
        required: [],
      },
    },
  },
  execute: async (args, ctx) => {
    const period = periodOf(args)
    const rows = await getUnifiedFlows(
      ctx.admin,
      ctx.orgId,
      period,
      ctx.storeId ? [ctx.storeId] : undefined,
    )
    return { content: toolJson(rows.slice(0, 50)), summary: `${rows.length} flows · ${period}` }
  },
}

const lojasTool: ConnectorTool = {
  label: "Visão das lojas",
  def: {
    type: "function",
    function: {
      name: "metricas_lojas",
      description:
        "Lista as lojas ativas da organização com health score, MRR, plataforma de email e cliente. Use para saber quais lojas existem e o estado geral da carteira.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  execute: async (_args, ctx) => {
    const { data } = await ctx.admin
      .from("client_stores")
      .select(
        "id, store_name, health_score, mrr_cents, email_platform, is_active, last_feedback_date, client:clients(name)",
      )
      .eq("org_id", ctx.orgId)
      .eq("is_active", true)
      .order("store_name")
      .limit(200)
    const rows = (data ?? []).map((s) => ({
      store_id: s.id,
      loja: s.store_name,
      cliente: (Array.isArray(s.client) ? s.client[0] : s.client)?.name ?? null,
      health_score: s.health_score,
      mrr_brl: ((s.mrr_cents as number | null) ?? 0) / 100,
      plataforma_email: s.email_platform,
      ultima_call: s.last_feedback_date,
    }))
    return { content: toolJson(rows), summary: `${rows.length} lojas` }
  },
}

export const METRICAS_CONNECTOR: ResolvedConnector = {
  key: "metricas",
  name: "Métricas",
  tools: [receitaTool, campanhasTool, flowsTool, lojasTool],
}
