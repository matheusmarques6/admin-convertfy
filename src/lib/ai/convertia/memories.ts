/**
 * Memória entre conversas (ai_memories) — item 10.
 *
 * Escopo: memória da ORGANIZAÇÃO (store_id NULL) ou ANEXADA À LOJA. O
 * modelo propõe (tool `convertia_lembrar` → status pending); só o que
 * um humano aprovar entra no prompt — em `## Memórias aprovadas`, no
 * bloco ESTÁVEL (cacheável: muda só quando alguém aprova).
 *
 * Degrada sem a tabela (migration 20261114): lista vazia, tool avisa.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { ConnectorTool, ResolvedConnector } from "@/lib/ai/connectors/types"
import { logger } from "@/lib/logger"

const log = logger.child("ConvertiaMemories")

export const MEMORY_KINDS = ["fato", "preferencia", "decisao", "aviso"] as const
export type MemoryKind = (typeof MEMORY_KINDS)[number]

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  fato: "Fato",
  preferencia: "Preferência",
  decisao: "Decisão",
  aviso: "Aviso",
}

const MISSING = new Set(["42P01", "PGRST205", "42703"])

export interface MemoryRow {
  id: string
  store_id: string | null
  content: string
  kind: MemoryKind
  status: "pending" | "approved" | "rejected"
  source: "ai" | "human"
  created_at: string
}

/**
 * Memórias aprovadas visíveis nesta conversa: as da org + as da loja
 * selecionada. Linhas prontas para o prompt ("[loja] …" / "[org] …").
 */
export async function loadApprovedMemories(
  admin: SupabaseClient,
  orgId: string,
  storeId: string | null,
  limit = 60,
): Promise<string[]> {
  try {
    let q = admin
      .from("ai_memories")
      .select("id, store_id, content, kind")
      .eq("org_id", orgId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(limit)
    q = storeId ? q.or(`store_id.is.null,store_id.eq.${storeId}`) : q.is("store_id", null)
    const { data, error } = await q
    if (error) {
      if (!MISSING.has(error.code ?? "")) log.warn("leitura de memórias falhou", { error: error.message })
      return []
    }
    return (data ?? [])
      .slice()
      .reverse()
      .map((m) => `[${m.store_id ? "loja" : "org"} · ${MEMORY_KIND_LABELS[m.kind as MemoryKind] ?? m.kind}] ${m.content}`)
  } catch (err) {
    log.warn("leitura de memórias falhou", { error: err instanceof Error ? err.message : String(err) })
    return []
  }
}

/**
 * Conector interno "Memória": a tool que a IA usa para PROPOR algo a
 * lembrar. Sempre disponível. Não é ação destrutiva — nasce pendente.
 */
export function buildMemoriaConnector(opts: {
  conversationId: string
  messageId: string | null
}): ResolvedConnector {
  const lembrar: ConnectorTool = {
    label: "Propor memória",
    write: true,
    def: {
      type: "function",
      function: {
        name: "convertia_lembrar",
        description:
          "Propõe um fato/preferência/decisão/aviso para a ConvertIA LEMBRAR em conversas futuras (ex.: 'a loja não faz promoção em produto X', 'o cliente prefere tom formal', 'decidimos migrar o flow de boas-vindas em outubro'). Vai para aprovação humana antes de valer. Use quando o usuário disser 'lembre que…', 'anote que…', ou quando uma decisão/preferência clara aparecer na conversa. Escopo: loja (quando o fato é dessa loja) ou organização. Uma memória por chamada, frase curta e autossuficiente.",
        parameters: {
          type: "object",
          properties: {
            conteudo: { type: "string", description: "A memória em uma frase (máx. 600 caracteres)" },
            tipo: { type: "string", enum: [...MEMORY_KINDS], description: "Default: fato" },
            escopo: {
              type: "string",
              enum: ["loja", "org"],
              description: "'loja' = só vale para a loja selecionada nesta conversa; 'org' = vale para todas",
            },
          },
          required: ["conteudo"],
        },
      },
    },
    execute: async (args, ctx) => {
      const content = String(args.conteudo ?? "").replace(/\s+/g, " ").trim().slice(0, 600)
      if (content.length < 3) return { content: "Memória vazia — nada proposto." }
      const kind: MemoryKind = MEMORY_KINDS.includes(args.tipo as MemoryKind) ? (args.tipo as MemoryKind) : "fato"
      const scopeStore = args.escopo === "org" ? null : ctx.storeId
      const { data, error } = await ctx.admin
        .from("ai_memories")
        .insert({
          org_id: ctx.orgId,
          store_id: scopeStore,
          content,
          kind,
          status: "pending",
          source: "ai",
          source_conversation_id: opts.conversationId,
          source_message_id: opts.messageId,
          created_by: ctx.userId,
        })
        .select("id")
        .single()
      if (error) {
        if (MISSING.has(error.code ?? "")) {
          return { content: "A memória entre conversas ainda não está habilitada neste ambiente (migration pendente). Diga ao usuário que a anotação não foi salva.", summary: "indisponível" }
        }
        throw error
      }
      return {
        content: `Memória proposta (id ${data.id}, escopo ${scopeStore ? "loja" : "organização"}, tipo ${kind}). Ela só passa a valer depois que alguém aprovar em "Memórias" no menu + do chat — avise o usuário em uma linha.`,
        summary: `proposta: ${content.slice(0, 40)}${content.length > 40 ? "…" : ""}`,
      }
    },
  }
  return { key: "memoria", name: "Memória", tools: [lembrar] }
}
