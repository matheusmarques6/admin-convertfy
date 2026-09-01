/**
 * GET/POST /api/ai/skills — skills próprias da ConvertIA. As
 * instruções da skill entram no system prompt quando ela está ativa na
 * conversa (menu Skills do composer).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

const createSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(200).nullable().optional(),
  icon: z.string().max(30).nullable().optional(),
  workspace: z.enum(["operacional", "comercial", "geral"]).default("geral"),
  instructions: z.string().min(10).max(8000),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("ai_skills")
      .select("id, name, description, icon, workspace, instructions, is_active, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
    if (error) throw error
    return successResponse(request, { skills: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "ai-skills-list")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const parsed = createSchema.parse(await request.json())
    const { data, error } = await admin
      .from("ai_skills")
      .insert({
        org_id: orgId,
        name: parsed.name,
        description: parsed.description ?? null,
        icon: parsed.icon ?? null,
        workspace: parsed.workspace,
        instructions: parsed.instructions,
        created_by: user.id,
      })
      .select("id, name, description, icon, workspace, instructions, is_active, created_at")
      .single()
    if (error) throw error
    return successResponse(request, { skill: data }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "ai-skills-create")
  }
}
