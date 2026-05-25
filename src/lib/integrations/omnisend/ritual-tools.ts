/**
 * Omnisend tool definitions for the ritual chat AI.
 *
 * When the chat's Claude instance needs live Omnisend data, it calls these
 * tools. The server executes the actual API call using the store's
 * omnisend_api_key and returns the result.
 */

import { omnisendRequest } from "@/lib/integrations/omnisend/client"
import type { Tool } from "@anthropic-ai/sdk/resources/messages"

export const OMNISEND_TOOLS: Tool[] = [
  {
    name: "omnisend_list_campaigns",
    description: "Lista campanhas recentes da loja no Omnisend. Retorna nome, status, data de envio, métricas (enviados, abertos, clicados, receita). Use para analisar performance de campanhas.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["sent", "draft", "scheduled", "sending", "archive"],
          description: "Filtrar por status. Default: sent (enviadas).",
        },
        limit: {
          type: "number",
          description: "Quantidade de campanhas a retornar (max 25). Default: 10.",
        },
      },
      required: [],
    },
  },
  {
    name: "omnisend_get_campaign",
    description: "Busca detalhes de uma campanha específica pelo ID. Retorna subject, HTML preview, métricas detalhadas, segmento alvo.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: {
          type: "string",
          description: "ID da campanha no Omnisend.",
        },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "omnisend_list_automations",
    description: "Lista automações (flows) ativas e pausadas da loja. Retorna nome, status, trigger type, e estatísticas de performance.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Quantidade de automações a retornar (max 25). Default: 10.",
        },
      },
      required: [],
    },
  },
  {
    name: "omnisend_list_segments",
    description: "Lista segmentos de contatos da loja. Retorna nome, tamanho, tipo, última atualização. Use para analisar saúde da lista e segmentação.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Quantidade de segmentos a retornar (max 50). Default: 20.",
        },
      },
      required: [],
    },
  },
  {
    name: "omnisend_segment_stats",
    description: "Busca estatísticas de um segmento específico (tamanho, growth, engagement). Use quando quiser analisar a saúde de um segmento.",
    input_schema: {
      type: "object" as const,
      properties: {
        segment_id: {
          type: "string",
          description: "ID do segmento no Omnisend.",
        },
      },
      required: ["segment_id"],
    },
  },
  {
    name: "omnisend_campaign_analytics",
    description: "Gera relatório de analytics de campanhas (receita, opens, clicks) agrupado por data de envio. Use para comparar performance ao longo do tempo.",
    input_schema: {
      type: "object" as const,
      properties: {
        date_from: {
          type: "string",
          description: "Data início no formato YYYY-MM-DD.",
        },
        date_to: {
          type: "string",
          description: "Data fim no formato YYYY-MM-DD.",
        },
      },
      required: ["date_from", "date_to"],
    },
  },
  {
    name: "omnisend_brand_info",
    description: "Retorna informações da conta/marca no Omnisend: nome, plano, total de contatos, domínio, status de verificação.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "omnisend_list_contacts",
    description: "Lista contatos da loja com filtros. Use para analisar base de contatos, verificar segmentação, ou encontrar contatos específicos.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["subscribed", "nonSubscribed", "unsubscribed"],
          description: "Filtrar por status de inscrição.",
        },
        limit: {
          type: "number",
          description: "Quantidade de contatos a retornar (max 50). Default: 10.",
        },
      },
      required: [],
    },
  },
]

export async function executeOmnisendTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  apiKey: string,
): Promise<string> {
  try {
    switch (toolName) {
      case "omnisend_list_campaigns": {
        const status = (toolInput.status as string) || "sent"
        const limit = Math.min(Number(toolInput.limit) || 10, 25)
        const data = await omnisendRequest<{ campaigns: unknown[] }>(
          apiKey,
          `/api/campaigns?status=${status}&limit=${limit}&sort=createdAt&sortDirection=desc`,
          { logTag: "RitualMCP" },
        )
        if (!data) return JSON.stringify({ error: "Sem dados retornados" })
        const campaigns = (data.campaigns ?? data)
        return JSON.stringify(Array.isArray(campaigns) ? campaigns.slice(0, limit) : campaigns, null, 2)
      }

      case "omnisend_get_campaign": {
        const id = toolInput.campaign_id as string
        if (!id) return JSON.stringify({ error: "campaign_id obrigatório" })
        const data = await omnisendRequest<Record<string, unknown>>(
          apiKey,
          `/api/campaigns/${id}`,
          { logTag: "RitualMCP" },
        )
        return JSON.stringify(data, null, 2)
      }

      case "omnisend_list_automations": {
        const limit = Math.min(Number(toolInput.limit) || 10, 25)
        const data = await omnisendRequest<{ automations: unknown[] }>(
          apiKey,
          `/v5/automations?limit=${limit}`,
          { logTag: "RitualMCP" },
        )
        if (!data) return JSON.stringify({ error: "Sem dados retornados" })
        const automations = (data.automations ?? data)
        return JSON.stringify(Array.isArray(automations) ? automations.slice(0, limit) : automations, null, 2)
      }

      case "omnisend_list_segments": {
        const limit = Math.min(Number(toolInput.limit) || 20, 50)
        const data = await omnisendRequest<{ segments: unknown[] }>(
          apiKey,
          `/api/segments?limit=${limit}`,
          { logTag: "RitualMCP" },
        )
        if (!data) return JSON.stringify({ error: "Sem dados retornados" })
        const segments = (data.segments ?? data)
        return JSON.stringify(Array.isArray(segments) ? segments.slice(0, limit) : segments, null, 2)
      }

      case "omnisend_segment_stats": {
        const id = toolInput.segment_id as string
        if (!id) return JSON.stringify({ error: "segment_id obrigatório" })
        const data = await omnisendRequest<Record<string, unknown>>(
          apiKey,
          `/api/segments/${id}/statistics`,
          { logTag: "RitualMCP" },
        )
        return JSON.stringify(data, null, 2)
      }

      case "omnisend_campaign_analytics": {
        const dateFrom = toolInput.date_from as string
        const dateTo = toolInput.date_to as string
        if (!dateFrom || !dateTo) return JSON.stringify({ error: "date_from e date_to obrigatórios" })
        const data = await omnisendRequest<Record<string, unknown>>(
          apiKey,
          "/api/analytics/reports",
          {
            method: "POST",
            body: {
              dateFrom: `${dateFrom}T00:00:00-03:00`,
              dateTo: `${dateTo}T23:59:59-03:00`,
              filter: "Campaign",
            },
            authStyle: "bearer",
            logTag: "RitualMCP",
          },
        )
        return JSON.stringify(data, null, 2)
      }

      case "omnisend_brand_info": {
        const data = await omnisendRequest<Record<string, unknown>>(
          apiKey,
          "/api/brands/current",
          { logTag: "RitualMCP" },
        )
        return JSON.stringify(data, null, 2)
      }

      case "omnisend_list_contacts": {
        const status = toolInput.status as string | undefined
        const limit = Math.min(Number(toolInput.limit) || 10, 50)
        let url = `/api/contacts?limit=${limit}`
        if (status) url += `&status=${status}`
        const data = await omnisendRequest<{ contacts: unknown[] }>(
          apiKey,
          url,
          { logTag: "RitualMCP" },
        )
        if (!data) return JSON.stringify({ error: "Sem dados retornados" })
        const contacts = (data.contacts ?? data)
        return JSON.stringify(Array.isArray(contacts) ? contacts.slice(0, limit) : contacts, null, 2)
      }

      default:
        return JSON.stringify({ error: `Ferramenta desconhecida: ${toolName}` })
    }
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Erro ao executar ferramenta Omnisend",
    })
  }
}
