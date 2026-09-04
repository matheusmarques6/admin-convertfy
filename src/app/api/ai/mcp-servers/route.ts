/**
 * GET/POST /api/ai/mcp-servers — servidores MCP externos da ConvertIA.
 * `?store_id=` filtra os da loja (o bloco "MCP da loja" nas
 * integrações usa isso); sem filtro devolve todos da org, com os
 * org-level (store_id NULL) primeiro.
 *
 * O token vai CRIPTOGRAFADO pro banco (mesmo AES-256-GCM das
 * credenciais de loja) e NUNCA volta em GET — só um preview mascarado.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { encrypt } from "@/lib/crypto"
import { testMcpServer } from "@/lib/ai/connectors/mcp-client"

export const dynamic = "force-dynamic"

const createSchema = z.object({
  name: z.string().min(2).max(60),
  url: z.string().url().max(500),
  auth_token: z.string().max(2000).nullable().optional(),
  headers: z.record(z.string(), z.string().max(2000)).optional(),
  store_id: z.string().uuid().nullable().optional(),
  allow_write: z.boolean().default(false),
})

/** Guarda anti-SSRF: só HTTPS público (mesma régua do action_webhook). */
function assertPublicHttps(url: string): void {
  const u = new URL(url)
  if (u.protocol !== "https:") {
    throw Object.assign(new Error("O endpoint MCP precisa ser HTTPS."), { statusCode: 422 })
  }
  const host = u.hostname.toLowerCase()
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw Object.assign(
      new Error("Host interno não é permitido — exponha o servidor MCP por HTTPS público (túnel)."),
      { statusCode: 422 },
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const storeId = request.nextUrl.searchParams.get("store_id")

    let q = admin
      .from("ai_mcp_servers")
      .select(
        "id, name, url, store_id, headers, is_active, allow_write, tool_count, last_status, last_checked_at, auth_token, created_at",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
    if (storeId) q = q.eq("store_id", storeId)
    const { data, error } = await q
    if (error) throw error

    const servers = (data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      store_id: s.store_id,
      header_keys: Object.keys((s.headers as Record<string, string> | null) ?? {}),
      has_token: Boolean(s.auth_token),
      is_active: s.is_active,
      allow_write: s.allow_write,
      tool_count: s.tool_count,
      last_status: s.last_status,
      last_checked_at: s.last_checked_at,
    }))
    return successResponse(request, { servers })
  } catch (error) {
    return errorResponse(request, error, "ai-mcp-list")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const parsed = createSchema.parse(await request.json())
    assertPublicHttps(parsed.url)

    // Valida a conexão ANTES de gravar (mesma régua da conexão de
    // canais): servidor quebrado não nasce.
    const test = await testMcpServer({
      id: "new",
      name: parsed.name,
      url: parsed.url,
      authToken: parsed.auth_token ?? null,
      headers: parsed.headers ?? {},
      allowWrite: true,
    })

    const row = {
      org_id: orgId,
      store_id: parsed.store_id ?? null,
      name: parsed.name,
      url: parsed.url,
      auth_token: parsed.auth_token ? encrypt(parsed.auth_token) : null,
      headers: parsed.headers ?? {},
      allow_write: parsed.allow_write,
      is_active: true,
      last_status: test.ok ? "ok" : test.error ?? "falhou",
      last_checked_at: new Date().toISOString(),
      tool_count: test.toolCount,
      created_by: user.id,
    }
    const select = "id, name, url, store_id, is_active, allow_write, tool_count, last_status"
    // Lista de tools vai pro cache (o chat lê de lá — migration 20261114);
    // sem as colunas, grava sem o cache.
    let ins = await admin
      .from("ai_mcp_servers")
      .insert({
        ...row,
        ...(test.ok ? { tools_cache: test.tools ?? [], tools_cached_at: new Date().toISOString() } : {}),
      })
      .select(select)
      .single()
    if (ins.error && (ins.error.code === "42703" || ins.error.code === "PGRST204")) {
      ins = await admin.from("ai_mcp_servers").insert(row).select(select).single()
    }
    const { data, error } = ins
    if (error) throw error
    return successResponse(
      request,
      { server: data, test },
      { status: 201 },
    )
  } catch (error) {
    return errorResponse(request, error, "ai-mcp-create")
  }
}
