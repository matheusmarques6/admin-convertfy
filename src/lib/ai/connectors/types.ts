/**
 * Contrato dos conectores da ConvertIA.
 *
 * Um conector expõe TOOLS (formato OpenAI function-calling) que o
 * modelo pode chamar; o servidor executa com o contexto real (org,
 * usuário, loja selecionada e credenciais da loja). Conectores
 * built-in (métricas, CRM, Shopify, Omnisend, Klaviyo) implementam
 * `execute` direto nos services da casa; servidores MCP externos são
 * proxied pelo cliente MCP genérico.
 *
 * `write: true` marca tool que MUDA estado — a UI sinaliza e o
 * registry pode filtrá-las (allow_write dos servidores MCP).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { ChatToolDef } from "@/lib/ai/openrouter-chat"

export type BuiltinConnectorKey =
  | "shopify"
  | "omnisend"
  | "klaviyo"
  | "crm"
  | "metricas"
  /** Geração de imagem — sempre disponível, não é toggle do composer. */
  | "imagem"
  /** Relatório mensal da loja — sempre disponível (age sobre a loja da conversa). */
  | "relatorio"
  /** Base de conhecimento do Obsidian (toggle do composer, org-level). */
  | "conhecimento"
  /** Memória entre conversas — sempre disponível (a IA propõe, humano aprova). */
  | "memoria"

/** built-in ou "mcp:<uuid do ai_mcp_servers>" */
export type ConnectorKey = BuiltinConnectorKey | `mcp:${string}`

export interface ConnectorToolContext {
  admin: SupabaseClient
  orgId: string
  userId: string
  /** Loja selecionada na conversa (null = visão geral da org). */
  storeId: string | null
  workspace: "operacional" | "comercial"
}

export interface ConnectorTool {
  def: ChatToolDef
  /** Rótulo humano da consulta, mostrado no chip "Consultou N fontes". */
  label: string
  write?: boolean
  /**
   * Gate de confirmação (ação IRREVERSÍVEL: envio para a base,
   * exclusão, cancelamento). Recebe os args da chamada e devolve a
   * descrição humana do que será executado quando a chamada precisa
   * do "Confirmar" do usuário na UI — ou null quando pode executar
   * direto. O loop não executa sem a confirmação; a mesma chamada
   * volta aprovada num turno seguinte.
   */
  confirm?: (args: Record<string, unknown>) => string | null
  execute: (
    args: Record<string, unknown>,
    ctx: ConnectorToolContext,
  ) => Promise<{ content: string; summary?: string }>
}

export interface ResolvedConnector {
  key: ConnectorKey
  name: string
  tools: ConnectorTool[]
  /**
   * Instruções de uso do conector que entram no system prompt quando ele
   * está ativo (ex.: "leia o guia da operação antes de montar o body").
   * Regras que dependem de COMO a plataforma funciona vivem aqui, não no
   * prompt genérico do chat.
   */
  guidance?: string
}

/** Serialização segura de resultado de tool (o modelo lê isto). */
export function toolJson(data: unknown, maxLen = 14_000): string {
  let s: string
  try {
    s = JSON.stringify(data, null, 1)
  } catch {
    s = String(data)
  }
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}\n…(truncado)`
  return s
}
