/**
 * Registry de conectores da ConvertIA — resolve os conectores de UMA
 * conversa a partir do que o composer ligou + do que a loja tem:
 *
 * - "metricas" e "crm": internos, sempre elegíveis;
 * - "shopify"/"omnisend"/"klaviyo": exigem loja selecionada COM a
 *   credencial correspondente (getStoreCredentials descriptografa);
 * - "mcp:<id>": servidor externo de ai_mcp_servers (org-level ou da
 *   loja da conversa), com tools prefixadas pra não colidir.
 *
 * Também expõe a listagem de disponibilidade que o menu "Conectores ·
 * MCP" do composer mostra (sem descriptografar nada).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { decrypt } from "@/lib/crypto"
import { logger } from "@/lib/logger"
import { METRICAS_CONNECTOR } from "./metricas"
import { CRM_CONNECTOR } from "./crm"
import { buildShopifyConnector } from "./shopify"
import { buildOmnisendConnector } from "./omnisend"
import { buildKlaviyoConnector } from "./klaviyo"
import { McpSession, type McpServerConfig, type McpToolInfo } from "./mcp-client"
import { isToolsCacheStale, parseToolsCache, refreshMcpToolsCache } from "./mcp-tools-cache"
import type { ConnectorTool, ResolvedConnector } from "./types"

const log = logger.child("ConnectorRegistry")

interface ResolveArgs {
  admin: SupabaseClient
  orgId: string
  storeId: string | null
  /** Chaves ligadas no composer ("metricas", "shopify", "mcp:<id>", …). */
  enabled: string[]
}

/**
 * Resolve os conectores pedidos. Conector pedido mas indisponível
 * (loja sem credencial, MCP inativo) é silenciosamente omitido — o
 * menu do composer já mostra o estado real, e o system prompt lista o
 * que de fato entrou.
 */
export async function resolveConnectors(args: ResolveArgs): Promise<ResolvedConnector[]> {
  const enabled = new Set(args.enabled)
  const out: ResolvedConnector[] = []

  if (enabled.has("metricas")) out.push(METRICAS_CONNECTOR)
  if (enabled.has("crm")) out.push(CRM_CONNECTOR)

  // Built-ins por loja — precisam de credencial descriptografada
  const wantsStoreConn =
    enabled.has("shopify") || enabled.has("omnisend") || enabled.has("klaviyo")
  if (args.storeId && wantsStoreConn) {
    try {
      const creds = await getStoreCredentials(args.storeId, args.orgId)
      if (enabled.has("shopify") && creds.shopify_store_domain && creds.shopify_access_token) {
        out.push(
          buildShopifyConnector({
            domain: creds.shopify_store_domain,
            accessToken: creds.shopify_access_token,
          }),
        )
      }
      if (enabled.has("omnisend") && creds.omnisend_api_key) {
        out.push(buildOmnisendConnector(creds.omnisend_api_key))
      }
      if (enabled.has("klaviyo") && creds.klaviyo_api_key) {
        out.push(buildKlaviyoConnector(creds.klaviyo_api_key, args.storeId))
      }
    } catch (err) {
      log.warn("credenciais da loja indisponíveis", {
        store_id: args.storeId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Servidores MCP externos ligados ("mcp:<uuid>")
  const mcpIds = [...enabled]
    .filter((k) => k.startsWith("mcp:"))
    .map((k) => k.slice(4))
  if (mcpIds.length > 0) {
    const baseCols = "id, name, url, auth_token, headers, allow_write, store_id, is_active"
    type ServerRow = Record<string, unknown> & {
      id: string
      name: string
      url: string
      store_id: string | null
      tools_cache?: unknown
      tools_cached_at?: string | null
    }
    let rows: ServerRow[] = []
    const withCache = await args.admin
      .from("ai_mcp_servers")
      .select(`${baseCols}, tools_cache, tools_cached_at`)
      .eq("org_id", args.orgId)
      .in("id", mcpIds)
      .eq("is_active", true)
    if (withCache.error && (withCache.error.code === "42703" || withCache.error.code === "PGRST204")) {
      // Sem a migration 20261114 (colunas do cache): retry sem elas
      const legacy = await args.admin
        .from("ai_mcp_servers")
        .select(baseCols)
        .eq("org_id", args.orgId)
        .in("id", mcpIds)
        .eq("is_active", true)
      rows = (legacy.data ?? []) as ServerRow[]
    } else {
      rows = (withCache.data ?? []) as ServerRow[]
    }
    const servers = rows
    for (const s of servers) {
      // Servidor de loja só entra na conversa daquela loja
      if (s.store_id && s.store_id !== args.storeId) continue
      const cfg: McpServerConfig = {
        id: s.id,
        name: s.name,
        url: s.url,
        authToken: typeof s.auth_token === "string" ? safeDecrypt(s.auth_token) : null,
        headers: (s.headers as Record<string, string> | null) ?? {},
        allowWrite: s.allow_write === true,
        // OAuth (ex.: MCP oficial da Omnisend): envelope renovado
        // automaticamente — persiste o refresh pro próximo uso.
        onTokensRefreshed: async (envelopeJson) => {
          const { encrypt } = await import("@/lib/crypto")
          await args.admin
            .from("ai_mcp_servers")
            .update({ auth_token: encrypt(envelopeJson), updated_at: new Date().toISOString() })
            .eq("id", s.id)
        },
      }
      const connector = await buildMcpConnector(cfg, args.admin, s)
      if (connector) out.push(connector)
    }
  }

  return out
}

function safeDecrypt(value: string): string | null {
  try {
    return decrypt(value)
  } catch {
    return null
  }
}

/** Prefixo estável e curto pro namespace das tools do servidor. */
function mcpPrefix(serverId: string): string {
  return `mcp_${serverId.replace(/-/g, "").slice(0, 8)}`
}

/**
 * Monta o conector a partir do CACHE de tools (ai_mcp_servers.tools_cache).
 * Sem cache: consulta o servidor uma vez e grava. Cache velho (>6h) é
 * usado mesmo assim e renovado em background — o chat nunca espera o
 * MCP para começar. A sessão MCP só é aberta na primeira tools/call.
 */
async function buildMcpConnector(
  cfg: McpServerConfig,
  admin: SupabaseClient,
  row: { tools_cache?: unknown; tools_cached_at?: string | null },
): Promise<ResolvedConnector | null> {
  try {
    const session = new McpSession(cfg)
    let raw: McpToolInfo[] | null = null
    const cached = parseToolsCache(row)
    if (cached) {
      raw = cached.tools
      if (isToolsCacheStale(cached.cachedAt)) {
        // fire-and-forget: a conversa segue com a lista antiga
        void refreshMcpToolsCache(admin, cfg)
      }
    } else {
      const fresh = await refreshMcpToolsCache(admin, cfg)
      raw = fresh?.tools ?? null
    }
    if (!raw) return null
    const tools = session.filterAllowed(raw)
    if (tools.length === 0) return null
    const prefix = mcpPrefix(cfg.id)
    const connectorTools: ConnectorTool[] = tools.slice(0, 40).map((t) => ({
      label: `${cfg.name}: ${t.name}`,
      write: !t.readOnly,
      // Ação destrutiva do MCP passa pelo gate de confirmação da UI
      ...(t.destructive
        ? {
            confirm: (toolArgs: Record<string, unknown>) =>
              `${cfg.name}: executar "${t.name}" com ${JSON.stringify(toolArgs).slice(0, 300)}`,
          }
        : {}),
      def: {
        type: "function" as const,
        function: {
          // nome de tool só aceita [a-zA-Z0-9_-]
          name: `${prefix}_${t.name.replace(/[^a-zA-Z0-9_-]/g, "_")}`.slice(0, 64),
          description: `[${cfg.name}] ${t.description}`.slice(0, 1000),
          parameters: t.inputSchema,
        },
      },
      execute: async (toolArgs) => {
        const content = await session.callTool(t.name, toolArgs)
        return { content }
      },
    }))
    return { key: `mcp:${cfg.id}`, name: cfg.name, tools: connectorTools }
  } catch (err) {
    log.warn("servidor MCP indisponível — fora da conversa", {
      server: cfg.name,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
