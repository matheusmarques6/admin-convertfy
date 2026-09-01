/**
 * Conector "Klaviyo" — MCP da loja sobre a klaviyo_api_key dela.
 * Performance consolidada via fetchKlaviyoPerformance (o MESMO service
 * do dashboard — números batem por construção) + listas/segmentos via
 * klaviyoRequest cru.
 */

import { klaviyoRequest } from "@/lib/integrations/klaviyo/client"
import { fetchKlaviyoPerformance } from "@/lib/services/klaviyo-performance.service"
import { toolJson, type ConnectorTool, type ResolvedConnector } from "./types"

const PERIODS = ["7d", "15d", "30d", "60d", "90d"]

export function buildKlaviyoConnector(apiKey: string, storeId: string | null): ResolvedConnector {
  const performance: ConnectorTool = {
    label: "Performance Klaviyo",
    def: {
      type: "function",
      function: {
        name: "klaviyo_performance",
        description:
          "Performance consolidada da conta Klaviyo da loja no período: receita atribuída, campanhas e flows com métricas (recipients, open, click, receita). Mesma fonte do dashboard.",
        parameters: {
          type: "object",
          properties: {
            period: { type: "string", enum: PERIODS, description: "Default 30d" },
          },
          required: [],
        },
      },
    },
    execute: async (args) => {
      const period = PERIODS.includes(String(args.period)) ? String(args.period) : "30d"
      const data = await fetchKlaviyoPerformance(
        apiKey,
        period,
        undefined,
        null,
        null,
        storeId ?? undefined,
      )
      return { content: toolJson(data), summary: `performance ${period}` }
    },
  }

  const segmentos: ConnectorTool = {
    label: "Segmentos e listas",
    def: {
      type: "function",
      function: {
        name: "klaviyo_segmentos",
        description:
          "Lista os segmentos e listas da conta Klaviyo da loja (nome, id, criação). Use para entender a segmentação disponível.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    execute: async () => {
      const [segments, lists] = await Promise.all([
        klaviyoRequest<{ data: Array<{ id: string; attributes: { name: string; created: string } }> }>(
          apiKey,
          "/segments/?page[size]=50",
          { logTag: "convertia" },
        ),
        klaviyoRequest<{ data: Array<{ id: string; attributes: { name: string; created: string } }> }>(
          apiKey,
          "/lists/?page[size]=50",
          { logTag: "convertia" },
        ),
      ])
      const out = {
        segmentos: (segments?.data ?? []).map((s) => ({ id: s.id, nome: s.attributes.name })),
        listas: (lists?.data ?? []).map((l) => ({ id: l.id, nome: l.attributes.name })),
      }
      return {
        content: toolJson(out),
        summary: `${out.segmentos.length} segmentos · ${out.listas.length} listas`,
      }
    },
  }

  return { key: "klaviyo", name: "Klaviyo", tools: [performance, segmentos] }
}
