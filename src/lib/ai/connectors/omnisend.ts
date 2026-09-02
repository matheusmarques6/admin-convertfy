/**
 * Conector "Omnisend" — MCP da loja sobre a omnisend_api_key dela.
 *
 * Leitura: as 8 tools do ritual chat (OMNISEND_TOOLS/executeOmnisendTool,
 * já batalhadas em produção), com o schema Anthropic convertido pro
 * formato OpenAI/OpenRouter.
 *
 * EXECUÇÃO (write): ações de maior valor do catálogo público da
 * Omnisend (validado contra o catálogo real da API 2026-03-15) —
 * contatos/tags, ligar/desligar automação, copiar/editar/testar/enviar/
 * cancelar campanha — mais o escape-hatch `omnisend_operacao`, que
 * expõe QUALQUER operação do catálogo (GET/POST/PATCH/PUT; DELETE fora
 * de propósito). O guard de uso é o contrato do system prompt: tools
 * EXECUTA só com pedido explícito do usuário.
 */

import {
  OMNISEND_TOOLS,
  executeOmnisendTool,
} from "@/lib/integrations/omnisend/ritual-tools"
import { omnisendRequest } from "@/lib/integrations/omnisend/client"
import { toolJson, type ConnectorTool, type ResolvedConnector } from "./types"

function writeTool(
  name: string,
  label: string,
  description: string,
  parameters: Record<string, unknown>,
  run: (args: Record<string, unknown>) => Promise<{ content: string; summary?: string }>,
): ConnectorTool {
  return {
    label,
    write: true,
    def: { type: "function", function: { name, description, parameters } },
    execute: run,
  }
}

export function buildOmnisendConnector(apiKey: string): ResolvedConnector {
  const readTools: ConnectorTool[] = OMNISEND_TOOLS.map((t) => ({
    label: t.name.replace(/^omnisend_/, "").replace(/_/g, " "),
    def: {
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description ?? t.name,
        parameters: (t.input_schema as unknown as Record<string, unknown>) ?? {
          type: "object",
          properties: {},
        },
      },
    },
    execute: async (args) => {
      const content = await executeOmnisendTool(t.name, args, apiKey)
      return { content }
    },
  }))

  const call = async (
    method: "GET" | "POST" | "PATCH" | "PUT",
    path: string,
    body?: Record<string, unknown>,
  ) => {
    const res = await omnisendRequest<unknown>(apiKey, path, {
      method,
      body,
      logTag: "ConvertIA",
    })
    return res
  }

  const writeTools: ConnectorTool[] = [
    writeTool(
      "omnisend_upsert_contato",
      "Criar/atualizar contato",
      "EXECUTA: cria ou atualiza um contato no Omnisend (email, nome, tags, consentimento). Use para inscrever alguém ou marcar tags.",
      {
        type: "object",
        properties: {
          email: { type: "string", description: "Email do contato" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          tags: { type: "array", items: { type: "string" }, description: "Tags a aplicar" },
          subscribed: {
            type: "boolean",
            description: "true = canal email como subscribed; false = nonSubscribed",
          },
        },
        required: ["email"],
      },
      async (args) => {
        const res = await call("POST", "/v3/contacts", {
          identifiers: [
            {
              type: "email",
              id: String(args.email),
              channels: {
                email: {
                  status: args.subscribed === false ? "nonSubscribed" : "subscribed",
                  statusDate: new Date().toISOString(),
                },
              },
            },
          ],
          ...(args.first_name ? { firstName: String(args.first_name) } : {}),
          ...(args.last_name ? { lastName: String(args.last_name) } : {}),
          ...(Array.isArray(args.tags) ? { tags: args.tags.map(String) } : {}),
        })
        return {
          content: res ? toolJson(res, 2000) : "Omnisend não confirmou — verifique o contato.",
          summary: `contato ${String(args.email)}`,
        }
      },
    ),
    writeTool(
      "omnisend_automacao_toggle",
      "Ligar/desligar automação",
      "EXECUTA: ativa ou pausa uma automação (flow) do Omnisend pelo id. Use omnisend_list_automations antes para achar o id.",
      {
        type: "object",
        properties: {
          automation_id: { type: "string" },
          enable: { type: "boolean", description: "true = ativar, false = pausar" },
        },
        required: ["automation_id", "enable"],
      },
      async (args) => {
        const id = String(args.automation_id)
        const action = args.enable === true ? "enable" : "disable"
        const res = await call("POST", `/api/automations/${id}/${action}`, {})
        return {
          content: res ? toolJson(res, 1500) : `Automação ${id} → ${action} enviado.`,
          summary: `automação ${action === "enable" ? "ativada" : "pausada"}`,
        }
      },
    ),
    writeTool(
      "omnisend_copiar_campanha",
      "Copiar campanha",
      "EXECUTA: duplica uma campanha existente como rascunho (o jeito certo de criar campanha nova a partir de uma que performou). Retorna o id do novo rascunho para editar assunto/agendar.",
      {
        type: "object",
        properties: { campaign_id: { type: "string" } },
        required: ["campaign_id"],
      },
      async (args) => {
        const res = await call("POST", `/api/campaigns/${String(args.campaign_id)}/copy`, {})
        return { content: toolJson(res ?? {}, 2000), summary: "rascunho criado" }
      },
    ),
    writeTool(
      "omnisend_editar_campanha_rascunho",
      "Editar rascunho de campanha",
      "EXECUTA: edita uma campanha em RASCUNHO (assunto, preheader, nome). Só funciona em draft — campanha enviada é imutável.",
      {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
          subject: { type: "string" },
          preheader: { type: "string" },
          name: { type: "string", description: "Nome interno da campanha" },
        },
        required: ["campaign_id"],
      },
      async (args) => {
        const body: Record<string, unknown> = {}
        if (typeof args.subject === "string") body.subject = args.subject
        if (typeof args.preheader === "string") body.preheader = args.preheader
        if (typeof args.name === "string") body.name = args.name
        const res = await call("PATCH", `/api/campaigns/${String(args.campaign_id)}`, body)
        return { content: toolJson(res ?? {}, 2000), summary: "rascunho editado" }
      },
    ),
    writeTool(
      "omnisend_enviar_teste_campanha",
      "Enviar teste de campanha",
      "EXECUTA: envia um email de TESTE de uma campanha para endereços internos (não vai pra lista).",
      {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
          emails: { type: "array", items: { type: "string" }, description: "Destinatários do teste" },
        },
        required: ["campaign_id", "emails"],
      },
      async (args) => {
        const res = await call("POST", `/api/campaigns/${String(args.campaign_id)}/test-email`, {
          emails: Array.isArray(args.emails) ? args.emails.map(String) : [],
        })
        return { content: toolJson(res ?? {}, 1200), summary: "teste enviado" }
      },
    ),
    writeTool(
      "omnisend_enviar_campanha",
      "ENVIAR campanha (lista real)",
      "EXECUTA E É IRREVERSÍVEL: dispara a campanha para a lista/segmento REAL configurado nela. Use SOMENTE depois que o usuário confirmar explicitamente o envio, nomeando a campanha. Prefira antes omnisend_enviar_teste_campanha.",
      {
        type: "object",
        properties: { campaign_id: { type: "string" } },
        required: ["campaign_id"],
      },
      async (args) => {
        const res = await call("POST", `/api/campaigns/${String(args.campaign_id)}/send`, {})
        return { content: toolJson(res ?? {}, 1200), summary: "CAMPANHA ENVIADA" }
      },
    ),
    writeTool(
      "omnisend_cancelar_campanha",
      "Cancelar campanha agendada",
      "EXECUTA: cancela uma campanha agendada/na fila antes do envio.",
      {
        type: "object",
        properties: { campaign_id: { type: "string" } },
        required: ["campaign_id"],
      },
      async (args) => {
        const res = await call("POST", `/api/campaigns/${String(args.campaign_id)}/cancel`, {})
        return { content: toolJson(res ?? {}, 1200), summary: "campanha cancelada" }
      },
    ),
    writeTool(
      "omnisend_operacao",
      "Operação Omnisend (avançada)",
      "EXECUTA: chama QUALQUER operação da API pública do Omnisend (api-docs.omnisend.com) — criar segmento (POST /api/segments), formulários, templates, produtos etc. Passe method, path (começando com /api/ ou /v3/) e body JSON conforme a documentação. Use quando não existir tool específica.",
      {
        type: "object",
        properties: {
          method: { type: "string", enum: ["GET", "POST", "PATCH", "PUT"] },
          path: { type: "string", description: "Ex.: /api/segments" },
          body: { type: "object", description: "Corpo JSON da requisição (quando aplicável)" },
        },
        required: ["method", "path"],
      },
      async (args) => {
        const path = String(args.path ?? "")
        if (!/^\/(api|v3|v5)\//.test(path)) {
          return { content: "Path inválido — precisa começar com /api/, /v3/ ou /v5/." }
        }
        const method = ["GET", "POST", "PATCH", "PUT"].includes(String(args.method))
          ? (args.method as "GET")
          : "GET"
        const res = await call(
          method,
          path,
          typeof args.body === "object" && args.body !== null
            ? (args.body as Record<string, unknown>)
            : undefined,
        )
        return { content: toolJson(res ?? {}, 8000), summary: `${method} ${path}` }
      },
    ),
  ]

  return { key: "omnisend", name: "Omnisend", tools: [...readTools, ...writeTools] }
}
