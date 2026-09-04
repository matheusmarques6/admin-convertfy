/**
 * Cliente MCP genérico (streamable HTTP, JSON-RPC 2.0) — conecta a
 * ConvertIA a servidores MCP EXTERNOS cadastrados em ai_mcp_servers
 * (ex.: Obsidian via obsidian-mcp exposto por HTTPS, ou qualquer MCP
 * remoto). Implementa o mínimo do protocolo 2025-03-26:
 *
 *   initialize → notifications/initialized → tools/list → tools/call
 *
 * A resposta pode vir como JSON puro OU como um stream SSE de uma
 * mensagem — os dois formatos são tratados. A sessão (Mcp-Session-Id)
 * é mantida por chamada de chat (initialize 1x, N tool calls).
 *
 * allow_write=false: só expõe tools anotadas read-only
 * (annotations.readOnlyHint === true). Sem anotação = potencialmente
 * escrita = bloqueada. Documentado na UI do servidor.
 */

import { logger } from "@/lib/logger"
import {
  parseOAuthEnvelope,
  refreshEnvelope,
  type McpOAuthEnvelope,
} from "./mcp-oauth"

const log = logger.child("McpClient")

const PROTOCOL_VERSION = "2025-03-26"
const TIMEOUT_MS = 25_000

export interface McpServerConfig {
  id: string
  name: string
  url: string
  /**
   * Auth descriptografada: Bearer token cru OU envelope OAuth
   * ({"type":"oauth",...} — ver mcp-oauth.ts). O envelope é detectado
   * automaticamente e renovado quando expira.
   */
  authToken?: string | null
  headers?: Record<string, string>
  allowWrite: boolean
  /** Persiste o envelope renovado (JSON em claro — quem chama criptografa). */
  onTokensRefreshed?: (envelopeJson: string) => Promise<void>
}

export interface McpToolInfo {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  readOnly: boolean
  /**
   * Ação destrutiva/irreversível: `annotations.destructiveHint === true`
   * OU nome que denuncia (delete/remove/send/purge/suppress). Passa
   * pelo gate de confirmação da UI antes de executar.
   */
  destructive: boolean
}

const DESTRUCTIVE_NAME = /(^|[_\-.])(delete|remove|purge|suppress|send|unsubscribe)([_\-.]|$)/i

export function isDestructiveMcpTool(t: {
  name: string
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } | null
}): boolean {
  if (t.annotations?.readOnlyHint === true) return false
  if (t.annotations?.destructiveHint === true) return true
  return DESTRUCTIVE_NAME.test(t.name)
}

interface JsonRpcResponse {
  result?: unknown
  error?: { code: number; message: string }
}

export class McpSession {
  private sessionId: string | null = null
  private nextId = 1
  private initialized = false
  private oauth: McpOAuthEnvelope | null

  constructor(private cfg: McpServerConfig) {
    this.oauth = parseOAuthEnvelope(cfg.authToken)
  }

  /** Token vigente — renova o envelope OAuth quando falta <60s. */
  private async bearer(): Promise<string | null> {
    if (!this.oauth) return this.cfg.authToken ?? null
    if (this.oauth.expires_at && this.oauth.expires_at - 60_000 < Date.now()) {
      const renewed = await refreshEnvelope(this.oauth, this.cfg.url)
      if (renewed) {
        this.oauth = renewed
        await this.cfg.onTokensRefreshed?.(JSON.stringify(renewed)).catch(() => {})
      } else {
        throw new Error(
          `MCP ${this.cfg.name}: sessão OAuth expirada — reautorize a conexão.`,
        )
      }
    }
    return this.oauth.access_token
  }

  private async headers(): Promise<Record<string, string>> {
    const token = await this.bearer()
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(this.cfg.headers ?? {}),
      ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
    }
  }

  private async rpc(method: string, params?: unknown, notification = false): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const body: Record<string, unknown> = { jsonrpc: "2.0", method }
      if (params !== undefined) body.params = params
      if (!notification) body.id = this.nextId++

      const resp = await fetch(this.cfg.url, {
        method: "POST",
        headers: await this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      const sid = resp.headers.get("Mcp-Session-Id") || resp.headers.get("mcp-session-id")
      if (sid) this.sessionId = sid

      if (notification) {
        // 202/204 esperados; corpo irrelevante
        return null
      }
      if (!resp.ok) {
        const snippet = (await resp.text().catch(() => "")).slice(0, 300)
        const retryAfter = resp.headers.get("retry-after")
        throw new Error(
          `MCP ${this.cfg.name}: HTTP ${resp.status}${retryAfter ? ` retry-after: ${retryAfter}` : ""} — ${snippet || "sem corpo"}`,
        )
      }

      const ctype = resp.headers.get("content-type") ?? ""
      let parsed: JsonRpcResponse | null = null
      if (ctype.includes("text/event-stream")) {
        // Stream de UMA resposta. Lido INCREMENTALMENTE: alguns
        // servidores mantêm o SSE aberto depois de responder — um
        // resp.text() esperaria o timeout inteiro. Paramos (e
        // cancelamos o stream) no primeiro frame com result/error.
        const reader = resp.body?.getReader()
        if (reader) {
          const decoder = new TextDecoder()
          let buffer = ""
          outer: for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() ?? ""
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed.startsWith("data:")) continue
              const payload = trimmed.slice(5).trim()
              if (!payload) continue
              try {
                const j = JSON.parse(payload) as JsonRpcResponse & { id?: unknown }
                if (j.result !== undefined || j.error !== undefined) {
                  parsed = j
                  break outer
                }
              } catch {
                /* frame parcial */
              }
            }
          }
          await reader.cancel().catch(() => {})
        }
      } else {
        parsed = (await resp.json().catch(() => null)) as JsonRpcResponse | null
      }

      if (!parsed) throw new Error(`MCP ${this.cfg.name}: resposta ilegível`)
      if (parsed.error) {
        throw new Error(`MCP ${this.cfg.name}: ${parsed.error.message} (${parsed.error.code})`)
      }
      return parsed.result
    } finally {
      clearTimeout(timer)
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    await this.rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "convertia", version: "1.0" },
    })
    await this.rpc("notifications/initialized", undefined, true).catch(() => {
      // alguns servidores dispensam a notificação
    })
    this.initialized = true
  }

  /** Lista CRUA (sem o filtro de allow_write) — é o que vai pro cache. */
  async listToolsRaw(): Promise<McpToolInfo[]> {
    await this.initialize()
    const result = (await this.rpc("tools/list", {})) as {
      tools?: Array<{
        name: string
        description?: string
        inputSchema?: Record<string, unknown>
        annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }
      }>
    }
    return (result?.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? t.name,
      inputSchema: t.inputSchema ?? { type: "object", properties: {} },
      readOnly: t.annotations?.readOnlyHint === true,
      destructive: isDestructiveMcpTool(t),
    }))
  }

  /** Aplica a régua de allow_write a uma lista (crua ou do cache). */
  filterAllowed(tools: McpToolInfo[]): McpToolInfo[] {
    // Sem allow_write, só read-only explícitas passam
    return this.cfg.allowWrite ? tools : tools.filter((t) => t.readOnly)
  }

  async listTools(): Promise<McpToolInfo[]> {
    return this.filterAllowed(await this.listToolsRaw())
  }

  /**
   * tools/call com retry em 429/503/rede ANTES de qualquer resposta.
   * Timeout NÃO repete: a chamada pode ter executado do outro lado.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.initialize()
    let result: { content?: Array<{ type: string; text?: string }>; isError?: boolean } | undefined
    for (let attempt = 0; ; attempt++) {
      try {
        result = (await this.rpc("tools/call", { name, arguments: args })) as typeof result
        break
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const transient = /HTTP (429|502|503)\b/.test(msg) || /fetch failed|ECONNRESET/i.test(msg)
        if (!transient || attempt >= 2) throw err
        const retryAfter = msg.match(/retry-after[:\s]*(\d+)/i)
        const wait = Math.min(retryAfter ? Number(retryAfter[1]) * 1000 : 800 * 2 ** attempt, 6_000)
        log.warn("tools/call transitório — retry", { server: this.cfg.name, tool: name, attempt, wait })
        await new Promise((r) => setTimeout(r, wait))
      }
    }
    const text = (result?.content ?? [])
      .map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type}]`))
      .join("\n")
      .slice(0, 14_000)
    if (result?.isError) return `Erro do servidor MCP: ${text || "sem detalhe"}`
    return text || "(sem conteúdo)"
  }
}

/** Teste de conexão usado pelo botão "Testar" da UI (devolve a lista crua pro cache). */
export async function testMcpServer(cfg: McpServerConfig): Promise<{
  ok: boolean
  toolCount: number
  tools?: McpToolInfo[]
  error?: string
}> {
  try {
    const session = new McpSession({ ...cfg, allowWrite: true })
    const tools = await session.listToolsRaw()
    return { ok: true, toolCount: tools.length, tools }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn("teste MCP falhou", { server: cfg.name, error: msg })
    return { ok: false, toolCount: 0, error: msg.slice(0, 300) }
  }
}
