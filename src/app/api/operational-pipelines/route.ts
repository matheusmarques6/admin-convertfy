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
import { requireOrgAdmin } from "@/lib/api/require-org-admin"
import { ensureOperationalPipelinesBootstrap } from "@/lib/services/operational-pipelines-bootstrap"
import { logger } from "@/lib/logger"

const log = logger.child("OperationalPipelines")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    await ensureOperationalPipelinesBootstrap(orgId, user.id)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("operational_pipelines")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
    if (error) throw error

    return successResponse(request, { pipelines: data ?? [] })
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
    await requireOrgAdmin(user.id, orgId)
    const admin = createAdminClient()

    const body = await request.json()
    if (!body.name || !body.slug) {
      throw new AppError("name e slug sao obrigatorios", 400)
    }
    if (!/^[a-z][a-z0-9-]*$/.test(body.slug)) {
      throw new AppError(
        "slug deve usar apenas letras minusculas, numeros e hifen",
        400,
      )
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

    if (error) {
      if (error.code === "23505") {
        throw new AppError(
          `Ja existe uma pipeline com o slug "${body.slug}" nesta org.`,
          409,
          "duplicate-slug",
        )
      }
      throw error
    }
    return successResponse(request, { pipeline: data }, { status: 201 })
  } catch (error) {
    log.error("Create error", error)
    return errorResponse(request, error, "operational-pipelines-create")
  }
}
