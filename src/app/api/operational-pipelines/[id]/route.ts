/**
 * GET    /api/operational-pipelines/[id]  — detalhe
 * PATCH  /api/operational-pipelines/[id]  — atualiza nome/columns/automacoes
 * DELETE /api/operational-pipelines/[id]  — soft delete
 *
 * Aceita lookup por id (uuid) OU slug. Resolucao automatica.
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

const log = logger.child("OperationalPipeline")

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_SLUGS = new Set(["onboarding", "acompanhamento", "feedback", "suporte"])

async function resolvePipeline(
  idOrSlug: string,
  orgId: string,
  userId: string,
) {
  const admin = createAdminClient()
  const isUuid = UUID_RE.test(idOrSlug)

  async function lookup() {
    const query = admin
      .from("operational_pipelines")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
    const { data, error } = isUuid
      ? await query.eq("id", idOrSlug).maybeSingle()
      : await query.eq("slug", idOrSlug).maybeSingle()
    if (error) throw error
    return data
  }

  let data = await lookup()
  if (!data && !isUuid && DEFAULT_SLUGS.has(idOrSlug)) {
    await ensureOperationalPipelinesBootstrap(orgId, userId)
    data = await lookup()
  }
  if (!data) throw new AppError("Pipeline nao encontrada", 404, "not-found")
  return data
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const pipeline = await resolvePipeline(id, orgId, user.id)
    return successResponse(request, { pipeline })
  } catch (error) {
    log.error("Get error", error)
    return errorResponse(request, error, "operational-pipeline-get")
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
    const orgId = await resolveOrgId(user.id)
    await requireOrgAdmin(user.id, orgId)
    const admin = createAdminClient()
    const pipeline = await resolvePipeline(id, orgId, user.id)

    const body = await request.json()
    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) patch.name = body.name
    if (body.description !== undefined) patch.description = body.description
    if (body.icon !== undefined) patch.icon = body.icon
    if (body.color !== undefined) patch.color = body.color
    if (body.columns !== undefined) patch.columns = body.columns
    if (body.automations !== undefined) patch.automations = body.automations

    const { data, error } = await admin
      .from("operational_pipelines")
      .update(patch)
      .eq("id", pipeline.id)
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { pipeline: data })
  } catch (error) {
    log.error("Patch error", error)
    return errorResponse(request, error, "operational-pipeline-patch")
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
    const orgId = await resolveOrgId(user.id)
    await requireOrgAdmin(user.id, orgId)
    const admin = createAdminClient()
    const pipeline = await resolvePipeline(id, orgId, user.id)

    const { error } = await admin
      .from("operational_pipelines")
      .update({ is_active: false })
      .eq("id", pipeline.id)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Delete error", error)
    return errorResponse(request, error, "operational-pipeline-delete")
  }
}
