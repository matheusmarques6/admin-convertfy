/**
 * GET  /api/crm/automations  — lista automacoes da org
 * POST /api/crm/automations  — cria automacao com DAG
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmAutomations")

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
    const scope = sp.get("scope")

    let q = admin
      .from("automations")
      .select("id, name, description, scope, is_active, version, dag, trigger, created_at, updated_at")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })

    if (scope) q = q.eq("scope", scope)

    const { data, error } = await q
    if (error) throw error
    return successResponse(request, { automations: data || [] })
  } catch (error) {
    log.error("Automations GET error:", error)
    return errorResponse(request, error, "crm-automations-get")
  }
}

const dagNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  config: z.record(z.string(), z.unknown()),
})

const dagEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  condition: z.string().optional(),
})

const createSchema = z.object({
  name: z.string().min(1).max(240),
  description: z.string().nullable().optional(),
  scope: z.enum(["sales", "cs", "internal", "general"]).default("general"),
  is_active: z.boolean().default(false),
  trigger: z.record(z.string(), z.unknown()),
  dag: z.object({
    nodes: z.array(dagNodeSchema),
    edges: z.array(dagEdgeSchema),
  }),
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
      .from("automations")
      .insert({
        name: parsed.name,
        description: parsed.description ?? null,
        scope: parsed.scope,
        org_id: orgId,
        is_active: parsed.is_active,
        version: 1,
        trigger: parsed.trigger,
        actions: [], // legado
        dag: parsed.dag,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (error) throw error
    log.info("[Automations] created", { id: data.id })
    return successResponse(request, { id: data.id })
  } catch (error) {
    log.error("Automations POST error:", error)
    return errorResponse(request, error, "crm-automations-post")
  }
}
