/**
 * POST /api/ai/chat
 *
 * Chat streaming com Claude Sonnet via @anthropic-ai/sdk. Aceita
 * contexto opcional (store_id, client_id) que sera injetado no
 * system prompt com dados reais.
 *
 * Body: {
 *   messages: Array<{ role: 'user'|'assistant', content: string }>,
 *   context?: { store_id?: string, client_id?: string }
 * }
 *
 * Response: text/event-stream — eventos `data: {"text":"..."}` por
 * delta, finalizado por `data: [DONE]`.
 */

import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  buildClientContext,
  buildOrgContext,
  buildStoreContext,
} from "@/lib/services/ai-context.service"
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
- Use markdown quando ajudar leitura (bullets, headers, code)
- Quando dados estiverem no contexto, cite os números reais
- Não invente métricas que você não tem; pergunte se precisar
- Foque em ações executáveis, não respostas vagas`

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)

    const body = (await request.json()) as {
      messages: ChatMessage[]
      context?: { store_id?: string | null; client_id?: string | null }
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

    // Constroi contexto extra
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
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ text: event.delta.text })}\n\n`,
                ),
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
    log.error("Chat error", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    )
  }
}
