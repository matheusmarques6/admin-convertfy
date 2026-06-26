import { NextRequest } from "next/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const access = await requireTaskAccess(user.id, id, "read")
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("task_comments")
      .select(
        "*, author:profiles!task_comments_author_id_fkey(id, name, email, avatar_url)",
      )
      .eq("task_id", id)
      .order("created_at", { ascending: true })
    if (error) throw error
    return successResponse(request, {
      comments: data ?? [],
      can_work: access.canWork,
    })
  } catch (error) {
    return errorResponse(request, error, "task-comments-get")
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireTaskAccess(user.id, id, "work")
    const body = await request.json()
    const content = String(body.content ?? "").trim()
    if (!content) throw new AppError("Conteudo obrigatorio", 400)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("task_comments")
      .insert({
        task_id: id,
        author_id: user.id,
        content,
        mentions: Array.isArray(body.mentions) ? body.mentions : [],
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
      })
      .select(
        "*, author:profiles!task_comments_author_id_fkey(id, name, email, avatar_url)",
      )
      .single()
    if (error) throw error
    return successResponse(request, { comment: data }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "task-comments-create")
  }
}
