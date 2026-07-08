/**
 * Quick replies do inbox (respostas rápidas por org).
 *
 * GET  — lista da org do usuário (ordenado por shortcut)
 * POST — cria { shortcut, title?, body }
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

async function resolveOrgId(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string> {
  const { data } = await admin
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single()
  if (!data?.org_id) throw new AppError("Acesso negado: usuario sem organizacao", 403)
  return data.org_id
}

const createSchema = z.object({
  shortcut: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_-]+$/i, "shortcut só aceita letras, números, hífen e underscore"),
  title: z.string().max(120).optional(),
  body: z.string().min(1).max(4000),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(admin, user.id)

    const { data, error } = await admin
      .from("crm_quick_replies")
      .select("id, shortcut, title, body, created_by, created_at")
      .eq("org_id", orgId)
      .order("shortcut", { ascending: true })

    if (error) throw error
    return successResponse(request, { quick_replies: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "crm-quick-replies-list")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(admin, user.id)

    const parsed = createSchema.parse(await request.json())

    const { data, error } = await admin
      .from("crm_quick_replies")
      .insert({
        org_id: orgId,
        shortcut: parsed.shortcut.toLowerCase(),
        title: parsed.title ?? null,
        body: parsed.body,
        created_by: user.id,
      })
      .select("id, shortcut, title, body")
      .single()

    if (error) throw error
    return successResponse(request, { quick_reply: data }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "crm-quick-replies-create")
  }
}
