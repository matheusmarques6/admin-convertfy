/**
 * POST /api/mcp/stores/[id] — o servidor MCP DA LOJA.
 *
 * Protocolo MCP real (streamable HTTP, JSON-RPC 2.0): initialize →
 * tools/list → tools/call. Expõe as MESMAS tools que a ConvertIA usa
 * para esta loja (Shopify/Omnisend/Klaviyo com as credenciais dela +
 * métricas internas escopadas), com annotations.readOnlyHint nas de
 * leitura — então qualquer cliente MCP externo (Claude, Cursor, outro
 * agente) pode conectar a loja como um MCP de verdade.
 *
 * Auth: Authorization: Bearer <token da loja> — gerado/rotacionado no
 * bloco "MCP da loja" das integrações (hash em settings, nunca em
 * claro). Sem token válido: 401.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { verifyStoreMcpToken } from "@/lib/ai/store-mcp-token.service"
import { resolveConnectors } from "@/lib/ai/connectors/registry"
import type { ConnectorTool, ConnectorToolContext } from "@/lib/ai/connectors/types"
import { logger } from "@/lib/logger"

const log = logger.child("StoreMcpServer")

export const dynamic = "force-dynamic"
export const maxDuration = 60

const PROTOCOL_VERSION = "2025-03-26"

interface JsonRpcRequest {
  jsonrpc?: string
  id?: number | string | null
  method?: string
  params?: Record<string, unknown>
}

function rpcResult(id: number | string | null | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result })
}

function rpcError(id: number | string | null | undefined, code: number, message: string, status = 200) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status },
  )
}

async function loadStoreTools(storeId: string): Promise<{
  tools: Map<string, ConnectorTool>
  ctx: ConnectorToolContext
} | null> {
  const admin = createAdminClient()
  const { data: store } = await admin
    .from("client_stores")
    .select("id, org_id, is_active")
    .eq("id", storeId)
    .maybeSingle()
  if (!store || store.is_active === false) return null

  const connectors = await resolveConnectors({
    admin,
    orgId: store.org_id as string,
    storeId,
    enabled: ["shopify", "omnisend", "klaviyo", "metricas"],
  })
  const tools = new Map<string, ConnectorTool>()
  for (const c of connectors) for (const t of c.tools) tools.set(t.def.function.name, t)
  return {
    tools,
    ctx: {
      admin,
      orgId: store.org_id as string,
      // Ações via MCP externo são do "sistema" — sem usuário humano
      userId: "00000000-0000-0000-0000-000000000000",
      storeId,
      workspace: "operacional",
    },
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: storeId } = await context.params

  const auth = request.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token || !(await verifyStoreMcpToken(storeId, token))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: JsonRpcRequest
  try {
    body = (await request.json()) as JsonRpcRequest
  } catch {
    return rpcError(null, -32700, "Parse error", 400)
  }
  const method = body.method ?? ""

  // Notificações não têm resposta
  if (method.startsWith("notifications/")) {
    return new NextResponse(null, { status: 202 })
  }

  try {
    switch (method) {
      case "initialize":
        return rpcResult(body.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "convertfy-store-mcp", version: "1.0.0" },
        })

      case "ping":
        return rpcResult(body.id, {})

      case "tools/list": {
        const loaded = await loadStoreTools(storeId)
        if (!loaded) return rpcError(body.id, -32000, "Loja não encontrada ou inativa")
        const tools = [...loaded.tools.values()].map((t) => ({
          name: t.def.function.name,
          description: t.def.function.description,
          inputSchema: t.def.function.parameters,
          annotations: { readOnlyHint: t.write !== true },
        }))
        return rpcResult(body.id, { tools })
      }

      case "tools/call": {
        const loaded = await loadStoreTools(storeId)
        if (!loaded) return rpcError(body.id, -32000, "Loja não encontrada ou inativa")
        const name = String(body.params?.name ?? "")
        const tool = loaded.tools.get(name)
        if (!tool) return rpcError(body.id, -32602, `Tool desconhecida: ${name}`)
        const args =
          typeof body.params?.arguments === "object" && body.params.arguments !== null
            ? (body.params.arguments as Record<string, unknown>)
            : {}
        try {
          const r = await tool.execute(args, loaded.ctx)
          return rpcResult(body.id, {
            content: [{ type: "text", text: r.content }],
            isError: false,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log.warn("tool falhou", { store_id: storeId, tool: name, error: msg })
          return rpcResult(body.id, {
            content: [{ type: "text", text: `Erro: ${msg}` }],
            isError: true,
          })
        }
      }

      default:
        return rpcError(body.id, -32601, `Método não suportado: ${method}`)
    }
  } catch (err) {
    log.error("mcp server erro", {
      store_id: storeId,
      error: err instanceof Error ? err.message : String(err),
    })
    return rpcError(body.id, -32000, "Erro interno")
  }
}

/** Clientes MCP podem tentar GET (stream de servidor) — não oferecido. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } })
}
