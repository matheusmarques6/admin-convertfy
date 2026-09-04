/**
 * Vercel Cron — manutenção da ConvertIA.
 *
 * Schedule: 50 * * * * (de hora em hora)
 *
 * 1) Renova o cache de tools dos servidores MCP ativos cujo cache tem
 *    mais de 6 h (ou nunca foi gravado) — o chat lê a lista do banco e
 *    nunca espera o servidor; este cron é o que mantém o cache quente.
 * 2) Sumário rolante das conversas longas que ainda não têm resumo em
 *    dia (rede de segurança para o disparo pós-turno).
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { decrypt } from "@/lib/crypto"
import { encrypt } from "@/lib/crypto"
import { MCP_TOOLS_CACHE_TTL_MS, refreshMcpToolsCache } from "@/lib/ai/connectors/mcp-tools-cache"
import { updateConversationSummary } from "@/lib/ai/convertia/summary"
import { logger } from "@/lib/logger"

const log = logger.child("CronConvertiaMaintenance")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError
  const started = Date.now()
  const admin = createAdminClient()
  const out = { mcp_refreshed: 0, mcp_failed: 0, summaries: 0, schema_missing: [] as string[] }

  // ── 1) cache de tools do MCP ───────────────────────────────────
  try {
    const stale = new Date(Date.now() - MCP_TOOLS_CACHE_TTL_MS).toISOString()
    const { data: servers, error } = await admin
      .from("ai_mcp_servers")
      .select("id, name, url, auth_token, headers, allow_write, tools_cached_at")
      .eq("is_active", true)
      .or(`tools_cached_at.is.null,tools_cached_at.lt.${stale}`)
      .limit(50)
    if (error) throw error
    for (const s of servers ?? []) {
      if (Date.now() - started > 200_000) break
      let token: string | null = null
      try {
        token = s.auth_token ? decrypt(s.auth_token as string) : null
      } catch {
        token = null
      }
      const r = await refreshMcpToolsCache(admin, {
        id: s.id,
        name: s.name,
        url: s.url,
        authToken: token,
        headers: (s.headers as Record<string, string> | null) ?? {},
        allowWrite: s.allow_write === true,
        onTokensRefreshed: async (envelopeJson) => {
          await admin
            .from("ai_mcp_servers")
            .update({ auth_token: encrypt(envelopeJson), updated_at: new Date().toISOString() })
            .eq("id", s.id)
        },
      })
      if (r) out.mcp_refreshed += 1
      else out.mcp_failed += 1
    }
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e.code === "42703" || e.code === "PGRST204") out.schema_missing.push("ai_mcp_servers.tools_cache")
    else log.warn("refresh de MCP falhou", { error: e.message })
  }

  // ── 2) sumários pendentes ─────────────────────────────────────
  try {
    const { data: convs } = await admin
      .from("ai_chat_conversations")
      .select("id")
      .contains("context", { source: "convertia" })
      .gte("last_message_at", new Date(Date.now() - 48 * 3_600_000).toISOString())
      .order("last_message_at", { ascending: false })
      .limit(30)
    for (const c of convs ?? []) {
      if (Date.now() - started > 240_000) break
      if (await updateConversationSummary(admin, c.id)) out.summaries += 1
    }
  } catch (err) {
    log.warn("sumários falharam", { error: err instanceof Error ? err.message : String(err) })
  }

  log.info("convertia maintenance tick", out)
  return NextResponse.json({ success: true, ...out })
}
