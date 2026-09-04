/**
 * POST /api/ai/convertia/chat/cancel — botão Parar.
 *
 * Marca `meta.cancel_requested=true` na resposta em geração; o loop
 * (em outra função serverless) lê a flag por polling e encerra o turno
 * de forma limpa — grava o que saiu, contabiliza custo e manda o
 * `done`. Só o dono da conversa pode parar.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { mergeMessageMeta } from "@/lib/ai/convertia/persist"

export const dynamic = "force-dynamic"

const schema = z.object({ message_id: z.string().uuid() })

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const { message_id } = schema.parse(await request.json())
    const admin = createAdminClient()

    const { data: msg } = await admin
      .from("ai_chat_messages")
      .select("id, role, conversation_id, ai_chat_conversations!inner(user_id)")
      .eq("id", message_id)
      .maybeSingle()
    const owner = (msg as { ai_chat_conversations?: { user_id?: string } } | null)?.ai_chat_conversations?.user_id
    if (!msg || owner !== user.id) throw new AppError("Mensagem não encontrada", 404, "not-found")

    await mergeMessageMeta(admin, message_id, {
      cancel_requested: true,
      cancel_requested_at: new Date().toISOString(),
    })
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "convertia-chat-cancel")
  }
}
