/**
 * POST /api/ai/chat
 *
 * Chat streaming com Claude Sonnet via @anthropic-ai/sdk com:
 * - Persistencia: aceita conversation_id e salva user msg + assistant
 *   completo na tabela ai_chat_messages. Atualiza last_message_at.
 * - Rate limit por user (15 msgs/min, in-memory).
 * - Contexto: store_id/client_id sao injetados no system prompt
 *   com dados reais (metricas Omnisend, MRR, health, lojas, etc).
 *
 * Body: {
 *   messages: Array<{ role: 'user'|'assistant', content: string }>,
 *   context?: { store_id?: string, client_id?: string },
 *   conversation_id?: string  // se omitido, nao persiste
 * }
 *
 * Response: text/event-stream — eventos `data: {"text":"..."}` por
 * delta, finalizado por `data: [DONE]`. Em rate limit retorna 429.
 */

import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  buildClientContext,
  buildOrgContext,
  buildStoreContext,
} from "@/lib/services/ai-context.service"
import { checkAiRateLimit } from "@/lib/services/ai-rate-limit"
import { logger } from "@/lib/logger"

const log = logger.child("AiChat")

export const dynamic = "force-dynamic"
export const maxDuration = 120

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

const BASE_SYSTEM = `Você é o assistente IA da Convertfy, uma agência brasileira de email marketing que opera 250+ e-commerces (Shopify, WooCommerce, Vtex e outros). Sua função é apoiar o time interno (CS, copy, design, ops) com:

- Geração de copy de email/SMS/WhatsApp em pt-BR, com tom adequado ao nicho
- Análise de métricas (open rate, click rate, conversion rate, revenue)
- Sugestão de campanhas, flows e segmentações
- Criação de briefings rápidos para calls de acompanhamento
- Análise de causas de queda/subida em métricas

Diretrizes:
- Responda sempre em português brasileiro, direto e prático
- Use markdown quando ajudar leitura (bullets, headers, tabelas, code)
- Quando dados estiverem no contexto, cite os números reais
- Não invente métricas que você não tem; pergunte se precisar
- Foque em ações executáveis, não respostas vagas`

async function persistMessages(
  conversationId: string,
  userMessage: string,
  assistantMessage: string,
) {
  try {
    const admin = createAdminClient()
    const now = new Date().toISOString()
    await admin.from("ai_chat_messages").insert([
      {
        conversation_id: conversationId,
        role: "user",
        content: userMessage,
      },
      {
        conversation_id: conversationId,
        role: "assistant",
        content: assistantMessage,
      },
    ])
    await admin
      .from("ai_chat_conversations")
      .update({ last_message_at: now })
      .eq("id", conversationId)
  } catch (e) {
    log.warn("persistMessages failed", e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)

    // Rate limit
    const rl = checkAiRateLimit(user.id)
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Voce esta enviando muitas mensagens. Tente de novo em ${rl.retryAfterSec}s.`,
          retry_after_sec: rl.retryAfterSec,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec) },
        },
      )
    }

    const body = (await request.json()) as {
      messages: ChatMessage[]
      context?: { store_id?: string | null; client_id?: string | null }
      conversation_id?: string | null
    }
    const messages = body.messages ?? []
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages obrigatorio" },
        { status: 400 },
      )
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "ANTHROPIC_API_KEY nao configurada no servidor. Adicione em .env e redeploy.",
        },
        { status: 500 },
      )
    }

    // Verifica ownership da conversa (se fornecida)
    if (body.conversation_id) {
      const admin = createAdminClient()
      const { data: conv } = await admin
        .from("ai_chat_conversations")
        .select("id")
        .eq("id", body.conversation_id)
        .eq("user_id", user.id)
        .maybeSingle()
      if (!conv) {
        return NextResponse.json(
          { error: "Conversa nao encontrada" },
          { status: 404 },
        )
      }
    }

    // Contexto extra
    const ctx = body.context ?? {}
    const contextChunks: string[] = []
    if (ctx.store_id) {
      const s = await buildStoreContext(ctx.store_id)
      if (s) contextChunks.push(s)
    }
    if (ctx.client_id) {
      const c = await buildClientContext(ctx.client_id)
      if (c) contextChunks.push(c)
    }
    if (contextChunks.length === 0) {
      const o = await buildOrgContext(orgId)
      if (o) contextChunks.push(o)
    }
    const systemPrompt =
      BASE_SYSTEM +
      (contextChunks.length > 0
        ? "\n\n---\n\n" + contextChunks.join("\n\n")
        : "")

    const client = new Anthropic({ apiKey })
    const userMessage = messages[messages.length - 1]?.content ?? ""
    let assistantAcc = ""

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        try {
          const claudeStream = client.messages.stream({
            model: "claude-sonnet-4-5",
            max_tokens: 4096,
            system: systemPrompt,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          })
          for await (const event of claudeStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const text = event.delta.text
              assistantAcc += text
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
              )
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        } catch (err) {
          log.error("Stream error", err)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: (err as Error).message })}\n\n`,
            ),
          )
        } finally {
          controller.close()
          // Persiste depois que o stream fechou. Fire-and-forget; nao
          // bloqueia o response.
          if (body.conversation_id && assistantAcc && userMessage) {
            void persistMessages(body.conversation_id, userMessage, assistantAcc)
          }
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-RateLimit-Remaining": String(rl.remaining),
      },
    })
  } catch (error) {
    log.error("Chat error", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    )
  }
}
