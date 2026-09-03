/**
 * POST /api/ai/convertia/chat — o motor da ConvertIA.
 *
 * Chat streaming (SSE) via OpenRouter com loop de tool-calling: o
 * modelo escolhido pelo usuário consulta/executa os conectores ligados
 * no composer (métricas internas, CRM, Shopify/Omnisend/Klaviyo da
 * loja selecionada e servidores MCP externos) e a resposta flui em
 * deltas. Eventos:
 *
 *   {type:'meta', conversation_id, title}   — 1x no início
 *   {type:'tool', id, connector, name, label, status, summary?, write?}
 *   {type:'delta', text}
 *   {type:'done', usage:{tokens_input,tokens_output,cost_usd}, sources:[…]}
 *   {type:'error', message}
 *   data: [DONE]
 *
 * Persiste em ai_chat_conversations/ai_chat_messages (user +
 * assistant com meta {sources, model, usage}); histórico re-enviado ao
 * modelo é só user/assistant (tool turns não voltam — padrão de chat
 * com fontes). Telemetria em ai_usage_events (feature 'convertia').
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { checkAiRateLimit } from "@/lib/services/ai-rate-limit"
import { recordAiUsage } from "@/lib/services/ai-usage.service"
import { buildStoreContext } from "@/lib/services/ai-context.service"
import {
  streamOpenRouterChat,
  type ChatMessage,
  type ChatToolDef,
} from "@/lib/ai/openrouter-chat"
import { resolveConnectors } from "@/lib/ai/connectors/registry"
import type { ConnectorTool, ConnectorToolContext } from "@/lib/ai/connectors/types"
import { resolveConvertiaModel } from "@/lib/ai/convertia-models"
import { logger } from "@/lib/logger"

const log = logger.child("ConvertiaChat")

export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_TOOL_ROUNDS = 6
const HISTORY_LIMIT = 24

const attachmentSchema = z.object({
  name: z.string().max(140),
  mime: z.string().max(100),
  /** Imagem: data URL completa (data:image/...;base64,...). Máx ~2,8MB. */
  data_url: z.string().max(2_900_000).optional(),
  /** Arquivo de texto (html/csv/md/txt/json): conteúdo cru. Máx 300KB. */
  text: z.string().max(300_000).optional(),
})

const bodySchema = z.object({
  conversation_id: z.string().uuid().nullable().optional(),
  message: z.string().min(1).max(8000),
  model: z.string().max(80).optional(),
  workspace: z.enum(["operacional", "comercial"]).default("operacional"),
  store_id: z.string().uuid().nullable().optional(),
  connectors: z.array(z.string().max(50)).max(20).default([]),
  skills: z.array(z.string().uuid()).max(20).default([]),
  attachments: z.array(attachmentSchema).max(3).default([]),
})

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const rate = checkAiRateLimit(user.id)
    if (!rate.allowed) {
      throw new AppError("Muitas mensagens — aguarde um instante.", 429, "rate-limit")
    }
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const body = bodySchema.parse(await request.json())
    const model = resolveConvertiaModel(body.model).id
    const storeId = body.store_id ?? null

    // ── Conversa (cria com o contexto do composer) ────────────────
    let conversationId = body.conversation_id ?? null
    let conversationTitle: string | null = null
    if (conversationId) {
      const { data: conv } = await admin
        .from("ai_chat_conversations")
        .select("id, user_id, title")
        .eq("id", conversationId)
        .maybeSingle()
      if (!conv || conv.user_id !== user.id) {
        throw new AppError("Conversa não encontrada", 404, "not-found")
      }
      conversationTitle = conv.title
    } else {
      const title = body.message.replace(/\s+/g, " ").trim().slice(0, 64)
      const { data: created, error } = await admin
        .from("ai_chat_conversations")
        .insert({
          org_id: orgId,
          user_id: user.id,
          title,
          context: {
            source: "convertia",
            workspace: body.workspace,
            store_id: storeId,
            model,
            connectors: body.connectors,
          },
        })
        .select("id, title")
        .single()
      if (error) throw error
      conversationId = created.id
      conversationTitle = created.title
    }

    // ── Histórico + contexto ─────────────────────────────────────
    const [{ data: history }, storeContext, { data: skillRows }] = await Promise.all([
      admin
        .from("ai_chat_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT),
      storeId ? buildStoreContext(storeId).catch(() => "") : Promise.resolve(""),
      body.skills.length > 0
        ? admin
            .from("ai_skills")
            .select("id, name, instructions")
            .eq("org_id", orgId)
            .eq("is_active", true)
            .in("id", body.skills)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; instructions: string }> }),
    ])

    const connectors = await resolveConnectors({
      admin,
      orgId,
      storeId,
      enabled: body.connectors,
    })
    const toolIndex = new Map<string, { tool: ConnectorTool; connectorKey: string; connectorName: string }>()
    const toolDefs: ChatToolDef[] = []
    for (const c of connectors) {
      for (const t of c.tools) {
        toolIndex.set(t.def.function.name, { tool: t, connectorKey: c.key, connectorName: c.name })
        toolDefs.push(t.def)
      }
    }

    const skillsBlock = (skillRows ?? [])
      .map((s) => `### Skill: ${s.name}\n${s.instructions}`)
      .join("\n\n")

    const writeToolNames = [...toolIndex.entries()]
      .filter(([, v]) => v.tool.write === true)
      .map(([name]) => name)

    const system = [
      `Você é a ConvertIA, a inteligência interna da Convertfy (agência de email marketing para e-commerce). Workspace atual: ${body.workspace}. Hoje é ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.`,
      "Responda SEMPRE em português brasileiro, direto e específico, com números formatados em pt-BR (R$ 46,2K).",
      connectors.length > 0
        ? `Conectores ativos nesta conversa: ${connectors.map((c) => c.name).join(", ")}. Use as tools para buscar DADOS REAIS antes de afirmar números — nunca invente métricas.`
        : "Nenhum conector ativo nesta conversa — deixe claro quando não tiver o dado e sugira ligar o conector.",
      // A lista de tools de CADA mensagem é a autoridade — conexões
      // mudam entre turnos e o modelo não pode ancorar num "não
      // consigo" dito quando a conversa tinha menos conectores.
      writeToolNames.length > 0
        ? `Você TEM ferramentas de EXECUÇÃO nesta mensagem (não apenas leitura): ${writeToolNames.join(", ")}. As ferramentas disponíveis AGORA são a única verdade — ignore qualquer afirmação anterior desta conversa sobre não conseguir executar. Ações de execução: use apenas com pedido explícito do usuário, e confirme o que foi feito. Envio de campanha e exclusões: peça confirmação nomeando o alvo antes.`
        : "As ferramentas disponíveis nesta mensagem são só de leitura — para executar ações, o usuário precisa ligar o conector correspondente.",
      "Se um dado não veio das tools, diga que não tem. Termine análises com uma recomendação prática quando fizer sentido.",
      "Quando o usuário pedir um email, página ou peça em HTML, entregue o documento COMPLETO num bloco ```html — o chat renderiza esse bloco como preview visual com abas Preview/Código. Para email, use HTML de email (tabelas, estilos inline, largura 600px). Arquivos anexados pelo usuário chegam como [Arquivo anexado: nome] com o conteúdo — use-os como referência fiel.",
      storeContext ? `## Contexto da loja selecionada\n${storeContext}` : "",
      skillsBlock ? `## Skills ativas (siga estas instruções)\n${skillsBlock}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")

    log.info("chat request", {
      conversation_id: conversationId,
      model,
      store_id: storeId,
      connectors: connectors.map((c) => `${c.key}:${c.tools.length}`),
      write_tools: writeToolNames.length,
      total_tools: toolDefs.length,
    })

    // ── Anexos: arquivos de texto entram INLINE (viram parte do
    // histórico — turnos futuros seguem enxergando o HTML de
    // referência); imagens vão como conteúdo multimodal só neste turno
    // (data URL não é re-enviada do histórico).
    const textAttachments = body.attachments.filter((a) => typeof a.text === "string")
    const imageAttachments = body.attachments.filter(
      (a) => typeof a.data_url === "string" && a.data_url.startsWith("data:image/"),
    )
    const inlineFiles = textAttachments
      .map((a) => `\n\n[Arquivo anexado: ${a.name}]\n\`\`\`\n${a.text}\n\`\`\``)
      .join("")
    const imageMarkers = imageAttachments.map((a) => `\n\n[Imagem anexada: ${a.name}]`).join("")
    const storedUserContent = `${body.message}${inlineFiles}${imageMarkers}`

    const userContent =
      imageAttachments.length > 0
        ? [
            { type: "text" as const, text: `${body.message}${inlineFiles}` },
            ...imageAttachments.map((a) => ({
              type: "image_url" as const,
              image_url: { url: a.data_url as string },
            })),
          ]
        : storedUserContent

    // ── Persiste a mensagem do usuário ───────────────────────────
    await admin.from("ai_chat_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: storedUserContent,
      ...(body.attachments.length > 0
        ? {
            meta: {
              attachments: body.attachments.map((a) => ({
                name: a.name,
                mime: a.mime,
                kind: a.data_url ? "image" : "text",
              })),
            },
          }
        : {}),
    })

    const messages: ChatMessage[] = [
      { role: "system", content: system },
      ...(history ?? [])
        .reverse()
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content ?? "" })),
      { role: "user", content: userContent },
    ]

    const started = Date.now()
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => {
          try {
            controller.enqueue(encoder.encode(sse(payload)))
          } catch {
            /* stream fechado pelo cliente */
          }
        }

        const sources: Array<{
          connector: string
          connector_name: string
          tool: string
          label: string
          summary: string | null
          write: boolean
        }> = []
        let fullText = ""
        let tokensInput = 0
        let tokensOutput = 0
        let costUsd = 0
        let status: "success" | "error" = "success"
        let errorMessage: string | null = null

        send({ type: "meta", conversation_id: conversationId, title: conversationTitle })

        try {
          for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
            const result = await streamOpenRouterChat({
              model,
              messages,
              tools: toolDefs.length > 0 ? toolDefs : undefined,
              maxTokens: 4096,
              signal: request.signal,
              onDelta: (text) => send({ type: "delta", text }),
            })
            tokensInput += result.tokensInput
            tokensOutput += result.tokensOutput
            costUsd += result.costUsd
            if (result.text) {
              fullText = fullText ? `${fullText}\n\n${result.text}` : result.text
            }

            if (result.finishReason !== "tool_calls" || result.toolCalls.length === 0) break
            if (round === MAX_TOOL_ROUNDS) {
              send({ type: "delta", text: "\n\n_(limite de consultas atingido)_" })
              break
            }

            messages.push({
              role: "assistant",
              content: result.text || null,
              tool_calls: result.toolCalls,
            })

            for (const call of result.toolCalls) {
              const entry = toolIndex.get(call.function.name)
              let output: string
              let summary: string | null = null
              if (!entry) {
                output = `Tool desconhecida: ${call.function.name}`
              } else {
                send({
                  type: "tool",
                  id: call.id,
                  connector: entry.connectorKey,
                  connector_name: entry.connectorName,
                  name: call.function.name,
                  label: entry.tool.label,
                  write: entry.tool.write === true,
                  status: "start",
                })
                let args: Record<string, unknown> = {}
                try {
                  args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>
                } catch {
                  /* args ilegíveis — executa com vazio */
                }
                const ctx: ConnectorToolContext = {
                  admin,
                  orgId,
                  userId: user.id,
                  storeId,
                  workspace: body.workspace,
                }
                try {
                  const r = await entry.tool.execute(args, ctx)
                  output = r.content
                  summary = r.summary ?? null
                } catch (err) {
                  output = `Erro ao consultar: ${err instanceof Error ? err.message : String(err)}`
                  summary = "erro"
                }
                sources.push({
                  connector: entry.connectorKey,
                  connector_name: entry.connectorName,
                  tool: call.function.name,
                  label: entry.tool.label,
                  summary,
                  write: entry.tool.write === true,
                })
                send({ type: "tool", id: call.id, status: "done", summary })
              }
              messages.push({ role: "tool", content: output, tool_call_id: call.id })
            }
          }
        } catch (err) {
          status = "error"
          errorMessage = err instanceof Error ? err.message : String(err)
          log.error("convertia chat falhou", { error: errorMessage, model })
          send({
            type: "error",
            message:
              "Não consegui completar a resposta agora. Tente de novo — se persistir, troque o modelo.",
          })
        }

        // ── Persistência + telemetria (nunca quebram o stream) ────
        try {
          if (fullText || sources.length > 0) {
            await admin.from("ai_chat_messages").insert({
              conversation_id: conversationId,
              role: "assistant",
              content: fullText || "(sem resposta)",
              meta: {
                model,
                sources,
                usage: { tokens_input: tokensInput, tokens_output: tokensOutput, cost_usd: costUsd },
                ...(errorMessage ? { error: errorMessage } : {}),
              },
            })
          }
          await admin
            .from("ai_chat_conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", conversationId)
        } catch (err) {
          log.warn("persistência falhou", {
            error: err instanceof Error ? err.message : String(err),
          })
        }
        void recordAiUsage({
          feature: "convertia",
          model,
          provider: "openrouter",
          status,
          tokensInput,
          tokensOutput,
          durationMs: Date.now() - started,
          userId: user.id,
          orgId,
          storeId,
          context: {
            conversation_id: conversationId,
            connectors: connectors.map((c) => c.key),
            sources: sources.length,
            cost_usd_openrouter: costUsd,
          },
          errorMessage,
        })

        send({
          type: "done",
          usage: { tokens_input: tokensInput, tokens_output: tokensOutput, cost_usd: costUsd },
          sources,
        })
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
          controller.close()
        } catch {
          /* já fechado */
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    return errorResponse(request, error, "convertia-chat")
  }
}
