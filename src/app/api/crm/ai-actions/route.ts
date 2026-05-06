/**
 * GET  /api/crm/ai-actions  — lista AI actions da org
 * POST /api/crm/ai-actions  — cria AI action versionada
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmAiActions")

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

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(admin, user.id)

    const sp = request.nextUrl.searchParams
    const useCase = sp.get("use_case")

    let q = admin
      .from("crm_ai_actions")
      .select("id, name, description, version, is_active, model, max_tokens, temperature, use_case, system_prompt, user_prompt_template, output_schema, created_at, updated_at")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })

    if (useCase) q = q.eq("use_case", useCase)

    const { data, error } = await q
    if (error) throw error
    return successResponse(request, { ai_actions: data || [] })
  } catch (error) {
    log.error("AiActions GET error:", error)
    return errorResponse(request, error, "crm-ai-actions-get")
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(240),
  description: z.string().nullable().optional(),
  use_case: z.string().min(1),
  model: z.string().default("claude-haiku-4-5-20251001"),
  max_tokens: z.number().int().min(1).max(8192).default(1024),
  temperature: z.number().min(0).max(2).default(0.7),
  system_prompt: z.string().min(1),
  user_prompt_template: z.string().min(1),
  output_schema: z.record(z.unknown()).optional().default({}),
  is_active: z.boolean().optional().default(true),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(admin, user.id)

    const body = await request.json()
    const parsed = createSchema.parse(body)

    const { data, error } = await admin
      .from("crm_ai_actions")
      .insert({
        org_id: orgId,
        ...parsed,
        version: 1,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (error) throw error
    log.info("[AiActions] created", { id: data.id, use_case: parsed.use_case })
    return successResponse(request, { id: data.id })
  } catch (error) {
    log.error("AiActions POST error:", error)
    return errorResponse(request, error, "crm-ai-actions-post")
  }
}
