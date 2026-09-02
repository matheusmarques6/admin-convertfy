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

  // ── EXECUÇÃO (write) — Klaviyo API 2025-10-15, só GET/POST ───────
  const inscrever: ConnectorTool = {
    label: "Inscrever perfis em lista",
    write: true,
    def: {
      type: "function",
      function: {
        name: "klaviyo_inscrever_perfis",
        description:
          "EXECUTA: inscreve emails numa lista do Klaviyo (bulk subscribe job, consentimento de email marketing). Use klaviyo_segmentos antes para achar o list_id.",
        parameters: {
          type: "object",
          properties: {
            list_id: { type: "string" },
            emails: { type: "array", items: { type: "string" }, description: "Até 100 emails" },
          },
          required: ["list_id", "emails"],
        },
      },
    },
    execute: async (args) => {
      const emails = (Array.isArray(args.emails) ? args.emails : []).map(String).slice(0, 100)
      const res = await klaviyoRequest<unknown>(apiKey, "/profile-subscription-bulk-create-jobs/", {
        method: "POST",
        logTag: "convertia",
        body: {
          data: {
            type: "profile-subscription-bulk-create-job",
            attributes: {
              profiles: {
                data: emails.map((email) => ({
                  type: "profile",
                  attributes: {
                    email,
                    subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } },
                  },
                })),
              },
            },
            relationships: { list: { data: { type: "list", id: String(args.list_id) } } },
          },
        },
      })
      return {
        content: res ? toolJson(res, 1500) : `Job de inscrição enviado (${emails.length} emails).`,
        summary: `${emails.length} inscritos`,
      }
    },
  }

  const suprimir: ConnectorTool = {
    label: "Suprimir perfis",
    write: true,
    def: {
      type: "function",
      function: {
        name: "klaviyo_suprimir_perfis",
        description:
          "EXECUTA: suprime emails no Klaviyo (param de receber marketing). Use para limpeza de lista/pedidos de descadastro.",
        parameters: {
          type: "object",
          properties: {
            emails: { type: "array", items: { type: "string" }, description: "Até 100 emails" },
          },
          required: ["emails"],
        },
      },
    },
    execute: async (args) => {
      const emails = (Array.isArray(args.emails) ? args.emails : []).map(String).slice(0, 100)
      const res = await klaviyoRequest<unknown>(apiKey, "/profile-suppression-bulk-create-jobs/", {
        method: "POST",
        logTag: "convertia",
        body: {
          data: {
            type: "profile-suppression-bulk-create-job",
            attributes: {
              profiles: {
                data: emails.map((email) => ({ type: "profile", attributes: { email } })),
              },
            },
          },
        },
      })
      return {
        content: res ? toolJson(res, 1500) : `Job de supressão enviado (${emails.length}).`,
        summary: `${emails.length} suprimidos`,
      }
    },
  }

  const criarLista: ConnectorTool = {
    label: "Criar lista",
    write: true,
    def: {
      type: "function",
      function: {
        name: "klaviyo_criar_lista",
        description: "EXECUTA: cria uma lista nova no Klaviyo da loja.",
        parameters: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
      },
    },
    execute: async (args) => {
      const res = await klaviyoRequest<unknown>(apiKey, "/lists/", {
        method: "POST",
        logTag: "convertia",
        body: { data: { type: "list", attributes: { name: String(args.name) } } },
      })
      return { content: toolJson(res ?? {}, 1500), summary: `lista "${String(args.name)}"` }
    },
  }

  const operacao: ConnectorTool = {
    label: "Operação Klaviyo (avançada)",
    write: true,
    def: {
      type: "function",
      function: {
        name: "klaviyo_operacao",
        description:
          "EXECUTA: chama qualquer endpoint da API do Klaviyo (developers.klaviyo.com, revision 2025-10-15) via GET ou POST — flows, campanhas, templates, eventos etc. Passe o path começando com / (ex.: /campaigns/) e o body JSON:API quando POST.",
        parameters: {
          type: "object",
          properties: {
            method: { type: "string", enum: ["GET", "POST"] },
            path: { type: "string", description: "Ex.: /campaigns/?filter=..." },
            body: { type: "object" },
          },
          required: ["method", "path"],
        },
      },
    },
    execute: async (args) => {
      const path = String(args.path ?? "")
      if (!path.startsWith("/")) return { content: "Path precisa começar com /." }
      const method = args.method === "POST" ? "POST" : "GET"
      const res = await klaviyoRequest<unknown>(apiKey, path, {
        method,
        logTag: "convertia",
        body:
          method === "POST" && typeof args.body === "object" && args.body !== null
            ? (args.body as Record<string, unknown>)
            : undefined,
      })
      return { content: toolJson(res ?? {}, 8000), summary: `${method} ${path.slice(0, 40)}` }
    },
  }

  return {
    key: "klaviyo",
    name: "Klaviyo",
    tools: [performance, segmentos, inscrever, suprimir, criarLista, operacao],
  }
}
