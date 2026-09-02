/**
 * OAuth 2.1 para servidores MCP (spec de autorização MCP 2025) — o que
 * o MCP oficial da Omnisend (https://mcp.omnisend.com/mcp) exige.
 *
 * Fluxo: discovery (WWW-Authenticate → protected resource metadata →
 * authorization server metadata) → registro dinâmico de cliente
 * (RFC 7591) → authorization code + PKCE S256 + resource indicator
 * (RFC 8707) → tokens com refresh.
 *
 * O bundle de tokens vive CRIPTOGRAFADO em ai_mcp_servers.auth_token
 * como um envelope JSON {"type":"oauth",...} — o McpSession detecta o
 * envelope, usa o access_token e renova sozinho quando expira.
 */

import { createHash, randomBytes } from "crypto"
import { logger } from "@/lib/logger"

const log = logger.child("McpOAuth")

const FETCH_TIMEOUT = 15_000

export interface McpOAuthEnvelope {
  type: "oauth"
  access_token: string
  refresh_token?: string
  /** epoch ms; ausente = não expira/desconhecido */
  expires_at?: number
  token_endpoint: string
  client_id: string
}

export interface AuthServerMeta {
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
  scopes_supported?: string[]
}

/** Detecta o envelope OAuth num auth_token descriptografado. */
export function parseOAuthEnvelope(raw: string | null | undefined): McpOAuthEnvelope | null {
  if (!raw || !raw.trimStart().startsWith("{")) return null
  try {
    const j = JSON.parse(raw) as McpOAuthEnvelope
    return j.type === "oauth" && j.access_token && j.token_endpoint && j.client_id ? j : null
  } catch {
    return null
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal })
    if (!resp.ok) return null
    return (await resp.json().catch(() => null)) as Record<string, unknown> | null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Descobre o authorization server do MCP:
 * 1. POST sem auth → 401 com WWW-Authenticate resource_metadata="…"
 * 2. fallback: {origin}/.well-known/oauth-protected-resource[{path}]
 * 3. metadata do AS: {issuer}/.well-known/oauth-authorization-server
 *    (fallback openid-configuration)
 */
export async function discoverAuthServer(mcpUrl: string): Promise<AuthServerMeta> {
  const u = new URL(mcpUrl)
  let resourceMetaUrl: string | null = null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
    const probe = await fetch(mcpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: {} }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const www = probe.headers.get("www-authenticate") ?? ""
    const m = www.match(/resource_metadata="([^"]+)"/)
    if (m) resourceMetaUrl = m[1]
  } catch {
    /* segue pros fallbacks */
  }

  const candidates = [
    ...(resourceMetaUrl ? [resourceMetaUrl] : []),
    `${u.origin}/.well-known/oauth-protected-resource${u.pathname === "/" ? "" : u.pathname}`,
    `${u.origin}/.well-known/oauth-protected-resource`,
  ]

  let issuer: string | null = null
  for (const c of candidates) {
    const meta = await fetchJson(c)
    const servers = meta?.authorization_servers
    if (Array.isArray(servers) && typeof servers[0] === "string") {
      issuer = servers[0]
      break
    }
  }
  // Sem metadata de resource: o AS pode ser o próprio origin do MCP
  if (!issuer) issuer = u.origin

  const issuerUrl = new URL(issuer)
  const asCandidates = [
    `${issuerUrl.origin}/.well-known/oauth-authorization-server${issuerUrl.pathname === "/" ? "" : issuerUrl.pathname}`,
    `${issuerUrl.origin}/.well-known/oauth-authorization-server`,
    `${issuerUrl.origin}/.well-known/openid-configuration`,
  ]
  for (const c of asCandidates) {
    const meta = await fetchJson(c)
    if (meta?.authorization_endpoint && meta?.token_endpoint) {
      return {
        authorization_endpoint: String(meta.authorization_endpoint),
        token_endpoint: String(meta.token_endpoint),
        registration_endpoint: meta.registration_endpoint
          ? String(meta.registration_endpoint)
          : undefined,
        scopes_supported: Array.isArray(meta.scopes_supported)
          ? meta.scopes_supported.map(String)
          : undefined,
      }
    }
  }
  throw new Error(
    `Não encontrei o authorization server do MCP em ${u.origin} — o servidor suporta OAuth?`,
  )
}

/** Registro dinâmico (RFC 7591). Devolve o client_id público. */
export async function registerClient(
  registrationEndpoint: string,
  redirectUri: string,
): Promise<string> {
  const meta = await fetchJson(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Convertfy ConvertIA",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  })
  const clientId = meta?.client_id
  if (typeof clientId !== "string" || !clientId) {
    throw new Error("Registro dinâmico de cliente falhou no authorization server.")
  }
  return clientId
}

export function makePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { verifier, challenge }
}

export function buildAuthorizeUrl(args: {
  authorizationEndpoint: string
  clientId: string
  redirectUri: string
  state: string
  challenge: string
  resource: string
  scopes?: string[]
}): string {
  const url = new URL(args.authorizationEndpoint)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", args.clientId)
  url.searchParams.set("redirect_uri", args.redirectUri)
  url.searchParams.set("state", args.state)
  url.searchParams.set("code_challenge", args.challenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("resource", args.resource)
  if (args.scopes && args.scopes.length > 0) url.searchParams.set("scope", args.scopes.join(" "))
  return url.toString()
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

async function tokenRequest(
  tokenEndpoint: string,
  params: Record<string, string>,
): Promise<TokenResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const resp = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      signal: controller.signal,
    })
    return (await resp.json().catch(() => ({}))) as TokenResponse
  } finally {
    clearTimeout(timer)
  }
}

export async function exchangeCode(args: {
  tokenEndpoint: string
  clientId: string
  code: string
  redirectUri: string
  verifier: string
  resource: string
}): Promise<McpOAuthEnvelope> {
  const t = await tokenRequest(args.tokenEndpoint, {
    grant_type: "authorization_code",
    client_id: args.clientId,
    code: args.code,
    redirect_uri: args.redirectUri,
    code_verifier: args.verifier,
    resource: args.resource,
  })
  if (!t.access_token) {
    throw new Error(
      `Troca do code falhou: ${t.error ?? "sem access_token"}${t.error_description ? ` — ${t.error_description}` : ""}`,
    )
  }
  return {
    type: "oauth",
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined,
    token_endpoint: args.tokenEndpoint,
    client_id: args.clientId,
  }
}

/** Renova o envelope. Sem refresh_token → devolve null (reautorizar). */
export async function refreshEnvelope(
  env: McpOAuthEnvelope,
  resource: string,
): Promise<McpOAuthEnvelope | null> {
  if (!env.refresh_token) return null
  const t = await tokenRequest(env.token_endpoint, {
    grant_type: "refresh_token",
    client_id: env.client_id,
    refresh_token: env.refresh_token,
    resource,
  })
  if (!t.access_token) {
    log.warn("refresh falhou", { error: t.error ?? "sem access_token" })
    return null
  }
  return {
    ...env,
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? env.refresh_token,
    expires_at: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined,
  }
}
