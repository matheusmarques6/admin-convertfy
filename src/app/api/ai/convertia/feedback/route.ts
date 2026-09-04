/**
 * POST /api/ai/convertia/feedback — persiste o "Útil" 👍 de uma
 * resposta da ConvertIA no meta da mensagem (merge — sources/usage
 * ficam intactos). rating: "up" marca, null desmarca (toggle).
 *
 * Ownership: a mensagem tem de pertencer a uma conversa do PRÓPRIO
 * usuário (ai_chat_messages → ai_chat_conversations.user_id).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { withTiming } from "@/lib/api/with-timing"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  message_id: z.string().uuid(),
  rating: z.enum(["up"]).nullable(),
})

async function handlePost(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const body = bodySchema.parse(await request.json())

    const { data: msg } = await admin
      .from("ai_chat_messages")
      .select("id, role, meta, conversation_id")
      .eq("id", body.message_id)
      .maybeSingle()
    if (!msg || msg.role !== "assistant") {
      throw new AppError("Mensagem não encontrada", 404, "not-found")
    }
    const { data: conv } = await admin
      .from("ai_chat_conversations")
      .select("user_id")
      .eq("id", msg.conversation_id)
      .maybeSingle()
    if (!conv || conv.user_id !== user.id) {
      throw new AppError("Mensagem não encontrada", 404, "not-found")
    }

    const meta = (msg.meta ?? {}) as Record<string, unknown>
    const nextMeta = {
      ...meta,
      feedback: body.rating
        ? { rating: body.rating, user_id: user.id, at: new Date().toISOString() }
        : null,
    }
    const { error } = await admin
      .from("ai_chat_messages")
      .update({ meta: nextMeta })
      .eq("id", msg.id)
    if (error) throw error

    return successResponse(request, { message_id: msg.id, rating: body.rating })
  } catch (error) {
    return errorResponse(request, error, "convertia-feedback")
  }
}

export const POST = withTiming("ai/convertia/feedback", handlePost)
