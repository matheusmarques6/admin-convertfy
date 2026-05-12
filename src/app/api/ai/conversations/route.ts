/**
 * GET  /api/ai/conversations — lista conversas do user (recentes primeiro)
 * POST /api/ai/conversations — cria nova conversa
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("ai_chat_conversations")
      .select("id, title, context, last_message_at, created_at")
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false })
      .limit(50)
    if (error) throw error
    return successResponse(request, { conversations: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "ai-conversations-list")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const body = await request.json().catch(() => ({}))

    const { data, error } = await admin
      .from("ai_chat_conversations")
      .insert({
        org_id: orgId,
        user_id: user.id,
        title: body.title || "Nova conversa",
        context: body.context ?? {},
      })
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { conversation: data }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "ai-conversations-create")
  }
}
