/**
 * GET    /api/ai/conversations/[id]         — detalhe + mensagens
 * PATCH  /api/ai/conversations/[id]         — rename, update context
 * DELETE /api/ai/conversations/[id]         — apaga conversa + mensagens
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: conv } = await admin
      .from("ai_chat_conversations")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle()
    if (!conv) throw new AppError("Conversa nao encontrada", 404)

    const { data: messages } = await admin
      .from("ai_chat_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })

    return successResponse(request, {
      conversation: conv,
      messages: messages ?? [],
    })
  } catch (error) {
    return errorResponse(request, error, "ai-conversation-get")
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const body = await request.json()
    const patch: Record<string, unknown> = {}
    if (body.title !== undefined) patch.title = body.title
    if (body.context !== undefined) patch.context = body.context
    if (body.last_message_at !== undefined)
      patch.last_message_at = body.last_message_at

    const { data, error } = await admin
      .from("ai_chat_conversations")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { conversation: data })
  } catch (error) {
    return errorResponse(request, error, "ai-conversation-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const { error } = await admin
      .from("ai_chat_conversations")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "ai-conversation-delete")
  }
}
