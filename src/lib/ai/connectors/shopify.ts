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

  // ── Chamada crua à Admin API (base das executivas) ───────────────
  const adminCall = async (
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ ok: boolean; status: number; data: unknown }> => {
    const clean = path.startsWith("/") ? path : `/${path}`
    const resp = await fetch(`${apiBase(creds.domain)}${clean}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": creds.accessToken,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await resp.json().catch(() => ({}))
    return { ok: resp.ok, status: resp.status, data }
  }

  const criarProduto: ConnectorTool = {
    label: "Criar produto",
    write: true,
    def: {
      type: "function",
      function: {
        name: "shopify_criar_produto",
        description:
          "EXECUTA: cria um produto na loja Shopify (nasce como DRAFT por segurança — publicar é outra decisão). Título, descrição HTML, preço e SKU.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            body_html: { type: "string", description: "Descrição em HTML (opcional)" },
            price: { type: "string", description: "Preço da variante única, ex.: '199.90'" },
            sku: { type: "string" },
            tags: { type: "string", description: "Tags separadas por vírgula" },
          },
          required: ["title", "price"],
        },
      },
    },
    execute: async (args) => {
      const r = await adminCall("POST", "/products.json", {
        product: {
          title: String(args.title),
          status: "draft",
          ...(typeof args.body_html === "string" ? { body_html: args.body_html } : {}),
          ...(typeof args.tags === "string" ? { tags: args.tags } : {}),
          variants: [
            {
              price: String(args.price),
              ...(typeof args.sku === "string" ? { sku: args.sku } : {}),
            },
          ],
        },
      })
      if (!r.ok) return { content: `Shopify recusou (${r.status}): ${toolJson(r.data, 800)}` }
      const p = (r.data as { product?: { id: number; title: string } }).product
      return {
        content: `Produto criado como rascunho: "${p?.title}" (id ${p?.id}).`,
        summary: `produto ${p?.id} criado`,
      }
    },
  }

  const atualizarProduto: ConnectorTool = {
    label: "Atualizar produto",
    write: true,
    def: {
      type: "function",
      function: {
        name: "shopify_atualizar_produto",
        description:
          "EXECUTA: atualiza um produto existente (título, status active/draft/archived, tags, descrição). Use shopify_produtos antes para achar o id.",
        parameters: {
          type: "object",
          properties: {
            product_id: { type: "number" },
            title: { type: "string" },
            status: { type: "string", enum: ["active", "draft", "archived"] },
            tags: { type: "string" },
            body_html: { type: "string" },
          },
          required: ["product_id"],
        },
      },
    },
    execute: async (args) => {
      const product: Record<string, unknown> = { id: Number(args.product_id) }
      for (const k of ["title", "status", "tags", "body_html"] as const) {
        if (typeof args[k] === "string") product[k] = args[k]
      }
      const r = await adminCall("PUT", `/products/${Number(args.product_id)}.json`, { product })
      if (!r.ok) return { content: `Shopify recusou (${r.status}): ${toolJson(r.data, 800)}` }
      return { content: "Produto atualizado.", summary: `produto ${args.product_id} atualizado` }
    },
  }

  const atualizarPreco: ConnectorTool = {
    label: "Atualizar preço",
    write: true,
    def: {
      type: "function",
      function: {
        name: "shopify_atualizar_preco",
        description:
          "EXECUTA: muda o preço (e opcionalmente o compare_at_price) de uma VARIANTE. O id da variante vem de shopify_produtos.",
        parameters: {
          type: "object",
          properties: {
            variant_id: { type: "number" },
            price: { type: "string", description: "Ex.: '149.90'" },
            compare_at_price: { type: "string", description: "Preço 'de' riscado (opcional)" },
          },
          required: ["variant_id", "price"],
        },
      },
    },
    execute: async (args) => {
      const r = await adminCall("PUT", `/variants/${Number(args.variant_id)}.json`, {
        variant: {
          id: Number(args.variant_id),
          price: String(args.price),
          ...(typeof args.compare_at_price === "string"
            ? { compare_at_price: args.compare_at_price }
            : {}),
        },
      })
      if (!r.ok) return { content: `Shopify recusou (${r.status}): ${toolJson(r.data, 800)}` }
      return { content: `Preço da variante atualizado para ${String(args.price)}.`, summary: "preço atualizado" }
    },
  }

  const atualizarEstoque: ConnectorTool = {
    label: "Ajustar estoque",
    write: true,
    def: {
      type: "function",
      function: {
        name: "shopify_atualizar_estoque",
        description:
          "EXECUTA: define a quantidade em estoque de uma variante na primeira localização da loja (inventory_levels/set).",
        parameters: {
          type: "object",
          properties: {
            variant_id: { type: "number" },
            quantity: { type: "number", description: "Quantidade absoluta (não delta)" },
          },
          required: ["variant_id", "quantity"],
        },
      },
    },
    execute: async (args) => {
      const v = await adminCall("GET", `/variants/${Number(args.variant_id)}.json`)
      const invItem = (v.data as { variant?: { inventory_item_id?: number } }).variant
        ?.inventory_item_id
      if (!v.ok || !invItem) {
        return { content: `Variante não encontrada (${v.status}).` }
      }
      const locs = await adminCall("GET", "/locations.json")
      const loc = (locs.data as { locations?: Array<{ id: number; active: boolean }> }).locations?.find(
        (l) => l.active,
      )
      if (!loc) return { content: "Nenhuma localização ativa na loja." }
      const r = await adminCall("POST", "/inventory_levels/set.json", {
        location_id: loc.id,
        inventory_item_id: invItem,
        available: Math.max(0, Math.round(Number(args.quantity) || 0)),
      })
      if (!r.ok) return { content: `Shopify recusou (${r.status}): ${toolJson(r.data, 800)}` }
      return {
        content: `Estoque da variante ${args.variant_id} definido em ${args.quantity}.`,
        summary: "estoque ajustado",
      }
    },
  }

  const tagPedido: ConnectorTool = {
    label: "Tag em pedido",
    write: true,
    def: {
      type: "function",
      function: {
        name: "shopify_tag_pedido",
        description:
          "EXECUTA: substitui as tags de um pedido (útil para marcar prioridade, problema, VIP). O id numérico do pedido vem de shopify_pedidos.",
        parameters: {
          type: "object",
          properties: {
            order_id: { type: "number" },
            tags: { type: "string", description: "Tags separadas por vírgula" },
          },
          required: ["order_id", "tags"],
        },
      },
    },
    execute: async (args) => {
      const r = await adminCall("PUT", `/orders/${Number(args.order_id)}.json`, {
        order: { id: Number(args.order_id), tags: String(args.tags) },
      })
      if (!r.ok) return { content: `Shopify recusou (${r.status}): ${toolJson(r.data, 800)}` }
      return { content: "Tags do pedido atualizadas.", summary: "pedido taggeado" }
    },
  }

  const adminApi: ConnectorTool = {
    label: "Admin API Shopify (avançada)",
    write: true,
    def: {
      type: "function",
      function: {
        name: "shopify_admin_api",
        description:
          "EXECUTA: chama qualquer endpoint REST da Shopify Admin API 2024-10 (GET/POST/PUT) com as credenciais da loja — coleções, metafields, fulfillments, webhooks etc. Passe o path relativo (ex.: /custom_collections.json) e o body conforme a doc shopify.dev. Use quando não existir tool específica.",
        parameters: {
          type: "object",
          properties: {
            method: { type: "string", enum: ["GET", "POST", "PUT"] },
            path: { type: "string", description: "Ex.: /custom_collections.json" },
            body: { type: "object" },
          },
          required: ["method", "path"],
        },
      },
    },
    execute: async (args) => {
      const path = String(args.path ?? "")
      if (!path.startsWith("/") || path.includes("..")) {
        return { content: "Path inválido — relativo à Admin API, começando com /." }
      }
      const method = ["GET", "POST", "PUT"].includes(String(args.method))
        ? (args.method as "GET")
        : "GET"
      const r = await adminCall(
        method,
        path,
        typeof args.body === "object" && args.body !== null
          ? (args.body as Record<string, unknown>)
          : undefined,
      )
      return {
        content: `HTTP ${r.status}\n${toolJson(r.data, 8000)}`,
        summary: `${method} ${path.slice(0, 40)}`,
      }
    },
  }

  return {
    key: "shopify",
    name: "Shopify",
    tools: [
      pedidos,
      metricasLoja,
      clientes,
      produtos,
      criarDesconto,
      criarProduto,
      atualizarProduto,
      atualizarPreco,
      atualizarEstoque,
      tagPedido,
      adminApi,
    ],
  }
}
