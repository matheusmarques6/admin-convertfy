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
  /** Presente quando o AS exigiu cliente confidencial no registro. */
  client_secret?: string
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

/**
 * Registro dinâmico (RFC 7591). Tenta cliente público (auth "none",
 * PKCE) e cai pra confidencial ("client_secret_post") quando o AS
 * recusa — alguns exigem secret mesmo com PKCE. O erro carrega status
 * + corpo da resposta do AS para o diagnóstico não ser cego.
 */
export async function registerClient(
  registrationEndpoint: string,
  redirectUri: string,
  scopes?: string[],
): Promise<{ clientId: string; clientSecret?: string }> {
  const base = {
    client_name: "Convertfy ConvertIA",
    client_uri: "https://app.convertfy.me",
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    ...(scopes && scopes.length > 0 ? { scope: scopes.join(" ") } : {}),
  }

  const attempts: string[] = []
  for (const method of ["none", "client_secret_post"] as const) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
    try {
      const resp = await fetch(registrationEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, token_endpoint_auth_method: method }),
        signal: controller.signal,
      })
      const bodyText = await resp.text().catch(() => "")
      if (resp.ok) {
        let meta: Record<string, unknown> = {}
        try {
          meta = JSON.parse(bodyText) as Record<string, unknown>
        } catch {
          /* segue */
        }
        if (typeof meta.client_id === "string" && meta.client_id) {
          return {
            clientId: meta.client_id,
            clientSecret:
              typeof meta.client_secret === "string" && meta.client_secret
                ? meta.client_secret
                : undefined,
          }
        }
        attempts.push(`${method}: 2xx sem client_id (${bodyText.slice(0, 120)})`)
      } else {
        attempts.push(`${method}: HTTP ${resp.status} ${bodyText.slice(0, 160)}`)
      }
    } catch (err) {
      attempts.push(`${method}: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      clearTimeout(timer)
    }
  }
  log.error("registro dinâmico falhou", { endpoint: registrationEndpoint, attempts })
  throw new Error(`Registro de cliente recusado pelo authorization server — ${attempts.join(" | ")}`)
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
  clientSecret?: string
  code: string
  redirectUri: string
  verifier: string
  resource: string
}): Promise<McpOAuthEnvelope> {
  const t = await tokenRequest(args.tokenEndpoint, {
    grant_type: "authorization_code",
    client_id: args.clientId,
    ...(args.clientSecret ? { client_secret: args.clientSecret } : {}),
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
    ...(args.clientSecret ? { client_secret: args.clientSecret } : {}),
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
    ...(env.client_secret ? { client_secret: env.client_secret } : {}),
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
