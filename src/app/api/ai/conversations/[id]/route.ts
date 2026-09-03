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
import { resolveOrgId } from "@/lib/api/resolve-org"

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

    // Dono lê sempre; conversa com context.shared=true é legível por
    // qualquer membro da MESMA org (modo leitura — PATCH/DELETE seguem
    // exclusivos do dono).
    const { data: conv } = await admin
      .from("ai_chat_conversations")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (!conv) throw new AppError("Conversa nao encontrada", 404)
    const isOwner = conv.user_id === user.id
    const isShared = (conv.context as { shared?: boolean } | null)?.shared === true
    if (!isOwner) {
      if (!isShared) throw new AppError("Conversa nao encontrada", 404)
      const orgId = await resolveOrgId(user.id)
      if (conv.org_id !== orgId) throw new AppError("Conversa nao encontrada", 404)
    }

    // Nome de quem compartilhou (pro banner de leitura)
    let ownerName: string | null = null
    if (!isOwner) {
      const { data: owner } = await admin
        .from("profiles")
        .select("name")
        .eq("id", conv.user_id)
        .maybeSingle()
      ownerName = owner?.name ?? null
    }

    // meta (fontes/uso da ConvertIA) chegou na migration 20261090 —
    // retry sem a coluna quando ela ainda não existe na base.
    let messages = null as Array<Record<string, unknown>> | null
    const withMeta = await admin
      .from("ai_chat_messages")
      .select("id, role, content, meta, created_at")
      .eq("conversation_id", id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
    if (withMeta.error && withMeta.error.code === "42703") {
      const legacy = await admin
        .from("ai_chat_messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true })
      messages = legacy.data
    } else {
      if (withMeta.error) throw withMeta.error
      messages = withMeta.data
    }

    return successResponse(request, {
      conversation: conv,
      messages: messages ?? [],
      is_owner: isOwner,
      owner_name: ownerName,
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
