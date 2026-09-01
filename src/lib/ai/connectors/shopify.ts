/**
 * Conector "Shopify" — MCP da loja sobre as credenciais que a própria
 * loja já tem cadastradas (shopify_store_domain + shopify_access_token,
 * descriptografadas por getStoreCredentials). Só existe quando a
 * conversa tem UMA loja selecionada e ela está conectada.
 *
 * Leitura via ShopifyService (client REST da casa). Escrita: criar
 * cupom de desconto (price rule + discount code) — a execução de menor
 * risco e maior pedido do dia a dia; nada de editar produto/pedido.
 */

import { createShopifyService } from "@/lib/integrations/shopify"
import { toolJson, type ConnectorTool, type ResolvedConnector } from "./types"

export interface ShopifyConnCreds {
  domain: string
  accessToken: string
}

function svc(creds: ShopifyConnCreds) {
  return createShopifyService({ store_url: creds.domain, access_token: creds.accessToken })
}

const API_VERSION = "2024-10"

function apiBase(domain: string): string {
  const clean = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  return `https://${clean}/admin/api/${API_VERSION}`
}

export function buildShopifyConnector(creds: ShopifyConnCreds): ResolvedConnector {
  const pedidos: ConnectorTool = {
    label: "Pedidos da loja",
    def: {
      type: "function",
      function: {
        name: "shopify_pedidos",
        description:
          "Lista pedidos da loja Shopify com filtros de data e status financeiro. Retorna número, data, cliente, valor, status e itens. Datas em ISO 8601.",
        parameters: {
          type: "object",
          properties: {
            created_at_min: { type: "string", description: "Data mínima ISO (ex.: 2026-08-01)" },
            created_at_max: { type: "string", description: "Data máxima ISO" },
            financial_status: { type: "string", enum: ["pending", "paid", "refunded", "voided"] },
            limit: { type: "number", description: "Máx. 50 (default 20)" },
          },
          required: [],
        },
      },
    },
    execute: async (args) => {
      const orders = await svc(creds).listOrders({
        status: "any",
        created_at_min: typeof args.created_at_min === "string" ? args.created_at_min : undefined,
        created_at_max: typeof args.created_at_max === "string" ? args.created_at_max : undefined,
        financial_status: ["pending", "paid", "refunded", "voided"].includes(
          String(args.financial_status),
        )
          ? (args.financial_status as "paid")
          : undefined,
        limit: Math.min(Math.max(Number(args.limit) || 20, 1), 50),
      })
      const slim = orders.map((o) => ({
        pedido: o.name,
        data: o.created_at,
        cliente: o.email,
        total: o.total_price,
        moeda: o.currency,
        status_financeiro: o.financial_status,
        itens: o.line_items?.slice(0, 8).map((i) => ({
          produto: i.title,
          qtd: i.quantity,
          preco: i.price,
        })),
      }))
      return { content: toolJson(slim), summary: `${slim.length} pedidos` }
    },
  }

  const metricasLoja: ConnectorTool = {
    label: "Métricas Shopify",
    def: {
      type: "function",
      function: {
        name: "shopify_metricas",
        description:
          "Métricas agregadas da loja Shopify no intervalo: total de pedidos, receita, ticket médio, clientes novos vs recorrentes e top 10 produtos por receita.",
        parameters: {
          type: "object",
          properties: {
            start_date: { type: "string", description: "Início ISO (ex.: 2026-08-01)" },
            end_date: { type: "string", description: "Fim ISO (ex.: 2026-08-31)" },
          },
          required: ["start_date", "end_date"],
        },
      },
    },
    execute: async (args) => {
      const m = await svc(creds).getDashboardMetrics({
        startDate: String(args.start_date),
        endDate: String(args.end_date),
      })
      return {
        content: toolJson(m),
        summary: `R$ ${Math.round(m.totalRevenue).toLocaleString("pt-BR")} · ${m.totalOrders} pedidos`,
      }
    },
  }

  const clientes: ConnectorTool = {
    label: "Clientes da loja",
    def: {
      type: "function",
      function: {
        name: "shopify_clientes",
        description:
          "Busca clientes da loja Shopify por nome/email, ou lista os mais recentes quando query é vazia. Retorna nome, email, nº de pedidos e total gasto.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Nome ou email (opcional)" },
          },
          required: [],
        },
      },
    },
    execute: async (args) => {
      const s = svc(creds)
      const q = typeof args.query === "string" ? args.query.trim() : ""
      const customers = q ? await s.searchCustomers(q) : await s.listCustomers({ limit: 20 })
      const slim = customers.slice(0, 25).map((c) => ({
        nome: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
        email: c.email,
        pedidos: c.orders_count,
        total_gasto: c.total_spent,
      }))
      return { content: toolJson(slim), summary: `${slim.length} clientes` }
    },
  }

  const produtos: ConnectorTool = {
    label: "Produtos da loja",
    def: {
      type: "function",
      function: {
        name: "shopify_produtos",
        description: "Lista produtos da loja Shopify: título, status, tipo e variantes com preço.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Máx. 50 (default 20)" },
          },
          required: [],
        },
      },
    },
    execute: async (args) => {
      const products = await svc(creds).listProducts({
        limit: Math.min(Math.max(Number(args.limit) || 20, 1), 50),
      })
      const slim = products.map((p) => ({
        id: p.id,
        titulo: p.title,
        status: p.status,
        tipo: p.product_type,
        variantes: p.variants?.slice(0, 5).map((v) => ({ sku: v.sku, preco: v.price })),
      }))
      return { content: toolJson(slim), summary: `${slim.length} produtos` }
    },
  }

  const criarDesconto: ConnectorTool = {
    label: "Criar cupom de desconto",
    write: true,
    def: {
      type: "function",
      function: {
        name: "shopify_criar_desconto",
        description:
          "EXECUTA: cria um cupom de desconto percentual na loja Shopify (price rule + discount code). Use apenas quando o usuário pedir explicitamente para criar o cupom, com código e percentual definidos.",
        parameters: {
          type: "object",
          properties: {
            code: { type: "string", description: "Código do cupom (ex.: SETEMBRO10)" },
            percentage: { type: "number", description: "Desconto em % (1-90)" },
            ends_at: { type: "string", description: "Validade ISO 8601 (opcional)" },
          },
          required: ["code", "percentage"],
        },
      },
    },
    execute: async (args) => {
      const code = String(args.code ?? "")
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, "")
        .slice(0, 40)
      const pct = Math.min(Math.max(Math.round(Number(args.percentage) || 0), 1), 90)
      if (!code) return { content: "Código do cupom inválido — nada foi criado." }
      const base = apiBase(creds.domain)
      const headers = {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": creds.accessToken,
      }
      const prResp = await fetch(`${base}/price_rules.json`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          price_rule: {
            title: code,
            target_type: "line_item",
            target_selection: "all",
            allocation_method: "across",
            value_type: "percentage",
            value: `-${pct}.0`,
            customer_selection: "all",
            starts_at: new Date().toISOString(),
            ...(typeof args.ends_at === "string" ? { ends_at: args.ends_at } : {}),
          },
        }),
      })
      const prBody = (await prResp.json().catch(() => ({}))) as {
        price_rule?: { id: number }
        errors?: unknown
      }
      if (!prResp.ok || !prBody.price_rule?.id) {
        return {
          content: `Shopify recusou a price rule (${prResp.status}): ${toolJson(prBody.errors ?? prBody, 500)}`,
        }
      }
      const dcResp = await fetch(
        `${base}/price_rules/${prBody.price_rule.id}/discount_codes.json`,
        { method: "POST", headers, body: JSON.stringify({ discount_code: { code } }) },
      )
      const dcBody = (await dcResp.json().catch(() => ({}))) as { errors?: unknown }
      if (!dcResp.ok) {
        return {
          content: `Price rule criada mas o código falhou (${dcResp.status}): ${toolJson(dcBody.errors ?? dcBody, 500)}`,
        }
      }
      return {
        content: `Cupom ${code} criado: ${pct}% de desconto em toda a loja${typeof args.ends_at === "string" ? ` até ${args.ends_at}` : ""}.`,
        summary: `cupom ${code} criado`,
      }
    },
  }

  return {
    key: "shopify",
    name: "Shopify",
    tools: [pedidos, metricasLoja, clientes, produtos, criarDesconto],
  }
}
