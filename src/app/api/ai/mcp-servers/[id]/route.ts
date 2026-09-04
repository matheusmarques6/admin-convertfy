/**
 * PATCH/DELETE /api/ai/mcp-servers/[id] + POST (test) — edição,
 * remoção e teste de conexão de um servidor MCP externo da ConvertIA.
 * PATCH com auth_token troca o token (re-criptografado); sem o campo,
 * o token atual é mantido.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { decrypt, encrypt } from "@/lib/crypto"
import { testMcpServer } from "@/lib/ai/connectors/mcp-client"

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  url: z.string().url().max(500).optional(),
  auth_token: z.string().max(2000).nullable().optional(),
  headers: z.record(z.string(), z.string().max(2000)).optional(),
  allow_write: z.boolean().optional(),
  is_active: z.boolean().optional(),
})

async function loadServer(id: string, orgId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from("ai_mcp_servers")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!data) throw new AppError("Servidor MCP não encontrado", 404, "not-found")
  return data
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    await loadServer(id, orgId)
    const parsed = patchSchema.parse(await request.json())

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (parsed.name !== undefined) update.name = parsed.name
    if (parsed.url !== undefined) update.url = parsed.url
    if (parsed.headers !== undefined) update.headers = parsed.headers
    if (parsed.allow_write !== undefined) update.allow_write = parsed.allow_write
    if (parsed.is_active !== undefined) update.is_active = parsed.is_active
    if (parsed.auth_token !== undefined) {
      update.auth_token = parsed.auth_token ? encrypt(parsed.auth_token) : null
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("ai_mcp_servers")
      .update(update)
      .eq("id", id)
      .eq("org_id", orgId)
      .select("id, name, url, store_id, is_active, allow_write, tool_count, last_status")
      .single()
    if (error) throw error
    return successResponse(request, { server: data })
  } catch (error) {
    return errorResponse(request, error, "ai-mcp-patch")
  }
}

/** POST = testar conexão (tools/list) e atualizar o status gravado. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const server = await loadServer(id, orgId)

    let token: string | null = null
    if (server.auth_token) {
      try {
        token = decrypt(server.auth_token as string)
      } catch {
        token = null
      }
    }
    const test = await testMcpServer({
      id: server.id as string,
      name: server.name as string,
      url: server.url as string,
      authToken: token,
      headers: (server.headers as Record<string, string> | null) ?? {},
      allowWrite: true,
    })

    const admin = createAdminClient()
    const patch = {
      last_status: test.ok ? "ok" : test.error ?? "falhou",
      last_checked_at: new Date().toISOString(),
      tool_count: test.toolCount,
    }
    // "Testar" também renova o cache de tools que o chat usa
    let upd = await admin
      .from("ai_mcp_servers")
      .update({
        ...patch,
        ...(test.ok ? { tools_cache: test.tools ?? [], tools_cached_at: new Date().toISOString() } : {}),
      })
      .eq("id", id)
    if (upd.error && (upd.error.code === "42703" || upd.error.code === "PGRST204")) {
      upd = await admin.from("ai_mcp_servers").update(patch).eq("id", id)
    }

    return successResponse(request, { test: { ok: test.ok, toolCount: test.toolCount, error: test.error } })
  } catch (error) {
    return errorResponse(request, error, "ai-mcp-test")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    await loadServer(id, orgId)
    const admin = createAdminClient()
    const { error } = await admin.from("ai_mcp_servers").delete().eq("id", id).eq("org_id", orgId)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "ai-mcp-delete")
  }
}
