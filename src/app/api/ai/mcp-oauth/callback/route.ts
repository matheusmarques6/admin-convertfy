/**
 * GET /api/ai/mcp-oauth/callback — volta da autorização OAuth do MCP.
 *
 * Decripta o state (autocontido — verifier, client_id, destino),
 * valida usuário logado + prazo de 15min, troca o code por tokens,
 * grava o servidor em ai_mcp_servers com o envelope OAuth
 * CRIPTOGRAFADO, testa a conexão (tools/list) e redireciona de volta
 * pro admin com ?mcp_connected=... (ou ?mcp_error=...).
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { mcpOAuthRedirectUri } from "@/lib/api/public-origin"
import { decrypt, encrypt } from "@/lib/crypto"
import { exchangeCode } from "@/lib/ai/connectors/mcp-oauth"
import { testMcpServer } from "@/lib/ai/connectors/mcp-client"
import { logger } from "@/lib/logger"

const log = logger.child("McpOAuthCallback")

export const dynamic = "force-dynamic"
export const maxDuration = 60

interface OAuthState {
  v: number
  org_id: string
  user_id: string
  name: string
  url: string
  store_id: string | null
  allow_write: boolean
  verifier: string
  client_id: string
  client_secret?: string | null
  token_endpoint: string
  return_to: string
  ts: number
}

function backTo(request: NextRequest, path: string, params: Record<string, string>) {
  const url = new URL(path.startsWith("/admin") ? path : "/admin/operacional/ia", request.nextUrl.origin)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const rawState = request.nextUrl.searchParams.get("state")
  const oauthError = request.nextUrl.searchParams.get("error")

  let state: OAuthState | null = null
  try {
    if (rawState) state = JSON.parse(decrypt(rawState)) as OAuthState
  } catch {
    state = null
  }
  const returnTo = state?.return_to ?? "/admin/operacional/ia"

  if (oauthError) {
    return backTo(request, returnTo, { mcp_error: `Autorização negada: ${oauthError}` })
  }
  if (!code || !state || state.v !== 1) {
    return backTo(request, returnTo, { mcp_error: "Fluxo OAuth inválido — tente de novo." })
  }
  if (Date.now() - state.ts > 15 * 60 * 1000) {
    return backTo(request, returnTo, { mcp_error: "Autorização expirou — tente de novo." })
  }

  try {
    // Mesmo usuário logado que iniciou o fluxo
    const sb = await createClient()
    const user = await requireAuth(sb)
    if (user.id !== state.user_id) {
      return backTo(request, returnTo, { mcp_error: "Sessão diferente da que iniciou a conexão." })
    }

    const envelope = await exchangeCode({
      tokenEndpoint: state.token_endpoint,
      clientId: state.client_id,
      clientSecret: state.client_secret ?? undefined,
      code,
      redirectUri: mcpOAuthRedirectUri(request),
      verifier: state.verifier,
      resource: state.url,
    })
    const envelopeJson = JSON.stringify(envelope)

    const test = await testMcpServer({
      id: "oauth-new",
      name: state.name,
      url: state.url,
      authToken: envelopeJson,
      headers: {},
      allowWrite: true,
    })

    const admin = createAdminClient()
    // Reconexão do mesmo endpoint substitui o registro (tokens novos)
    let existingQuery = admin
      .from("ai_mcp_servers")
      .select("id")
      .eq("org_id", state.org_id)
      .eq("url", state.url)
    existingQuery = state.store_id
      ? existingQuery.eq("store_id", state.store_id)
      : existingQuery.is("store_id", null)
    const { data: existing } = await existingQuery.limit(1).maybeSingle()

    const row = {
      org_id: state.org_id,
      store_id: state.store_id,
      name: state.name,
      url: state.url,
      auth_token: encrypt(envelopeJson),
      headers: {},
      is_active: true,
      allow_write: state.allow_write,
      last_status: test.ok ? "ok" : (test.error ?? "falhou"),
      last_checked_at: new Date().toISOString(),
      tool_count: test.toolCount,
      created_by: state.user_id,
      updated_at: new Date().toISOString(),
    }
    if (existing) {
      await admin.from("ai_mcp_servers").update(row).eq("id", existing.id)
    } else {
      await admin.from("ai_mcp_servers").insert(row)
    }

    return backTo(request, returnTo, {
      mcp_connected: state.name,
      mcp_tools: String(test.toolCount),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error("callback falhou", { error: msg })
    return backTo(request, returnTo, { mcp_error: msg.slice(0, 180) })
  }
}
