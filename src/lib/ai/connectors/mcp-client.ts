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

const log = logger.child("McpClient")

const PROTOCOL_VERSION = "2025-03-26"
const TIMEOUT_MS = 25_000

export interface McpServerConfig {
  id: string
  name: string
  url: string
  /** Bearer token (já descriptografado). */
  authToken?: string | null
  headers?: Record<string, string>
  allowWrite: boolean
}

export interface McpToolInfo {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  readOnly: boolean
}

interface JsonRpcResponse {
  result?: unknown
  error?: { code: number; message: string }
}

export class McpSession {
  private sessionId: string | null = null
  private nextId = 1
  private initialized = false

  constructor(private cfg: McpServerConfig) {}

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(this.cfg.authToken ? { Authorization: `Bearer ${this.cfg.authToken}` } : {}),
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
        headers: this.headers(),
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
        throw new Error(`MCP ${this.cfg.name}: HTTP ${resp.status} — ${snippet || "sem corpo"}`)
      }

      const ctype = resp.headers.get("content-type") ?? ""
      let parsed: JsonRpcResponse | null = null
      if (ctype.includes("text/event-stream")) {
        // stream de UMA resposta: pega o primeiro frame data com id
        const text = await resp.text()
        for (const line of text.split("\n")) {
          const trimmed = line.trim()
          if (!trimmed.startsWith("data:")) continue
          const payload = trimmed.slice(5).trim()
          if (!payload) continue
          try {
            const j = JSON.parse(payload) as JsonRpcResponse & { id?: unknown }
            if (j.result !== undefined || j.error !== undefined) {
              parsed = j
              break
            }
          } catch {
            /* frame parcial */
          }
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

  async listTools(): Promise<McpToolInfo[]> {
    await this.initialize()
    const result = (await this.rpc("tools/list", {})) as {
      tools?: Array<{
        name: string
        description?: string
        inputSchema?: Record<string, unknown>
        annotations?: { readOnlyHint?: boolean }
      }>
    }
    const tools = (result?.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? t.name,
      inputSchema: t.inputSchema ?? { type: "object", properties: {} },
      readOnly: t.annotations?.readOnlyHint === true,
    }))
    // Sem allow_write, só read-only explícitas passam
    return this.cfg.allowWrite ? tools : tools.filter((t) => t.readOnly)
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.initialize()
    const result = (await this.rpc("tools/call", { name, arguments: args })) as {
      content?: Array<{ type: string; text?: string }>
      isError?: boolean
    }
    const text = (result?.content ?? [])
      .map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type}]`))
      .join("\n")
      .slice(0, 14_000)
    if (result?.isError) return `Erro do servidor MCP: ${text || "sem detalhe"}`
    return text || "(sem conteúdo)"
  }
}

/** Teste de conexão usado pelo botão "Testar" da UI. */
export async function testMcpServer(cfg: McpServerConfig): Promise<{
  ok: boolean
  toolCount: number
  error?: string
}> {
  try {
    const session = new McpSession({ ...cfg, allowWrite: true })
    const tools = await session.listTools()
    return { ok: true, toolCount: tools.length }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn("teste MCP falhou", { server: cfg.name, error: msg })
    return { ok: false, toolCount: 0, error: msg.slice(0, 300) }
  }
}
