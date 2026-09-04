/**
 * Cache da lista de tools de um servidor MCP (ai_mcp_servers.tools_cache).
 *
 * `tools/list` era chamado a CADA mensagem: latência antes do primeiro
 * token e a conversa nem começava com o MCP fora. Agora a lista crua
 * (com as anotações) fica no banco; o chat lê de lá e só consulta o
 * servidor quando não há cache. Cache com mais de TTL é usado MESMO
 * ASSIM (o chat nunca espera) e renovado em background; o botão
 * "Testar" e o cron horário também renovam.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { McpSession, type McpServerConfig, type McpToolInfo } from "./mcp-client"

const log = logger.child("McpToolsCache")

export const MCP_TOOLS_CACHE_TTL_MS = 6 * 3_600_000

export interface McpToolsCacheRow {
  tools_cache?: unknown
  tools_cached_at?: string | null
}

export function parseToolsCache(row: McpToolsCacheRow): { tools: McpToolInfo[]; cachedAt: number } | null {
  if (!Array.isArray(row.tools_cache) || !row.tools_cached_at) return null
  const cachedAt = Date.parse(row.tools_cached_at)
  if (!Number.isFinite(cachedAt)) return null
  const tools: McpToolInfo[] = []
  for (const t of row.tools_cache as Array<Record<string, unknown>>) {
    if (!t || typeof t.name !== "string") continue
    tools.push({
      name: t.name,
      description: typeof t.description === "string" ? t.description : t.name,
      inputSchema:
        t.inputSchema && typeof t.inputSchema === "object"
          ? (t.inputSchema as Record<string, unknown>)
          : { type: "object", properties: {} },
      readOnly: t.readOnly === true,
      destructive: t.destructive === true,
    })
  }
  return { tools, cachedAt }
}

export function isToolsCacheStale(cachedAt: number, now = Date.now()): boolean {
  return now - cachedAt > MCP_TOOLS_CACHE_TTL_MS
}

/**
 * Busca tools/list no servidor e grava o cache. Nunca lança — devolve
 * null quando o servidor está fora (o chamador decide o que fazer).
 * Degrada sem as colunas (migration 20261114 não aplicada).
 */
export async function refreshMcpToolsCache(
  admin: SupabaseClient,
  cfg: McpServerConfig,
): Promise<{ tools: McpToolInfo[]; error?: string } | null> {
  try {
    const session = new McpSession({ ...cfg, allowWrite: true })
    const tools = await session.listToolsRaw()
    const { error } = await admin
      .from("ai_mcp_servers")
      .update({
        tools_cache: tools,
        tools_cached_at: new Date().toISOString(),
        tool_count: tools.length,
        last_status: "ok",
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", cfg.id)
    if (error && error.code !== "42703" && error.code !== "PGRST204") {
      log.warn("gravação do cache falhou", { server: cfg.name, error: error.message })
    } else if (error) {
      // sem as colunas: pelo menos status/contagem
      await admin
        .from("ai_mcp_servers")
        .update({ tool_count: tools.length, last_status: "ok", last_checked_at: new Date().toISOString() })
        .eq("id", cfg.id)
    }
    return { tools }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn("refresh do cache de tools falhou", { server: cfg.name, error: msg })
    await admin
      .from("ai_mcp_servers")
      .update({ last_status: msg.slice(0, 300), last_checked_at: new Date().toISOString() })
      .eq("id", cfg.id)
      .then(() => undefined, () => undefined)
    return null
  }
}
