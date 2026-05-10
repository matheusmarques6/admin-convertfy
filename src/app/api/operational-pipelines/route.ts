/**
 * GET  /api/operational-pipelines  — lista pipelines da org do usuario.
 *                                    Bootstrap: se a org nao tem nenhuma,
 *                                    cria as 4 pipelines padrao.
 * POST /api/operational-pipelines  — cria nova pipeline (admin/manager).
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
import { logger } from "@/lib/logger"
import { DEFAULT_OPERATIONAL_PIPELINES } from "@/types/operational-pipeline"

const log = logger.child("OperationalPipelines")

export const dynamic = "force-dynamic"

function genId(): string {
  return crypto.randomUUID()
}

async function bootstrapDefaults(orgId: string, userId: string) {
  const admin = createAdminClient()
  const rows = DEFAULT_OPERATIONAL_PIPELINES.map((p) => ({
    org_id: orgId,
    name: p.name,
    slug: p.slug,
    description: p.description,
    icon: p.icon,
    color: p.color,
    columns: p.columns.map((c, i) => ({
      id: genId(),
      name: c.name,
      color: c.color,
      position: i,
      wip_limit: null,
    })),
    automations: [],
    created_by: userId,
  }))
  const { error } = await admin.from("operational_pipelines").insert(rows)
  if (error) log.warn("Bootstrap defaults failed", { code: error.code, msg: error.message })
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const initial = await admin
      .from("operational_pipelines")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })

    if (initial.error) throw initial.error
    let data = initial.data

    // Bootstrap: se vazio, cria os 4 padrao e refaz select
    if (!data || data.length === 0) {
      await bootstrapDefaults(orgId, user.id)
      const refresh = await admin
        .from("operational_pipelines")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
      data = refresh.data ?? []
    }

    return successResponse(request, { pipelines: data })
  } catch (error) {
    log.error("List error", error)
    return errorResponse(request, error, "operational-pipelines-list")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const body = await request.json()
    if (!body.name || !body.slug) {
      throw new AppError("name e slug sao obrigatorios", 400)
    }

    const { data, error } = await admin
      .from("operational_pipelines")
      .insert({
        org_id: orgId,
        name: body.name,
        slug: body.slug,
        description: body.description ?? null,
        icon: body.icon ?? "layout-kanban",
        color: body.color ?? "#534AB7",
        columns: body.columns ?? [],
        automations: body.automations ?? [],
        created_by: user.id,
      })
      .select("*")
      .single()

    if (error) throw error
    return successResponse(request, { pipeline: data }, { status: 201 })
  } catch (error) {
    log.error("Create error", error)
    return errorResponse(request, error, "operational-pipelines-create")
  }
}
