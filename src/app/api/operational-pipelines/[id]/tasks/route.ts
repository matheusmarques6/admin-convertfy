/**
 * GET  /api/operational-pipelines/[id]/tasks — lista tasks da pipeline
 * POST /api/operational-pipelines/[id]/tasks — cria task na pipeline
 *                                              (default: primeira coluna)
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
import { ensureOperationalPipelinesBootstrap } from "@/lib/services/operational-pipelines-bootstrap"
import { logger } from "@/lib/logger"
import { executeAutomations } from "@/lib/services/operational-automation.service"
import type { OperationalColumn } from "@/types/operational-pipeline"

const log = logger.child("OperationalPipelineTasks")
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_SLUGS = new Set(["onboarding", "acompanhamento", "feedback", "suporte"])

async function resolvePipeline(idOrSlug: string, orgId: string, userId: string) {
  const admin = createAdminClient()
  const isUuid = UUID_RE.test(idOrSlug)

  async function lookup() {
    const query = admin
      .from("operational_pipelines")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
    const { data } = isUuid
      ? await query.eq("id", idOrSlug).maybeSingle()
      : await query.eq("slug", idOrSlug).maybeSingle()
    return data
  }

  let data = await lookup()

  // Se nao achou e e um dos slugs default, dispara bootstrap e
  // tenta de novo. Cobre caso do user acessar direto /admin/
  // operational/onboarding sem antes carregar a lista.
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
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("tasks")
      .select(
        `id, title, description, type, status, priority, position,
         operational_column_id, due_date, tags, metadata,
         created_at, updated_at,
         assignee_id, client_id, store_id,
         assignee:org_members!tasks_assignee_id_fkey(
           id, role,
           profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
         ),
         client:clients(id, name),
         store:client_stores(id, store_name, platform)`,
      )
      .eq("operational_pipeline_id", pipeline.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })
    if (error) throw error
    return successResponse(request, { pipeline, tasks: data ?? [] })
  } catch (error) {
    log.error("List tasks error", error)
    return errorResponse(request, error, "operational-pipeline-tasks-list")
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const pipeline = await resolvePipeline(id, orgId, user.id)
    const admin = createAdminClient()

    const body = await request.json()
    if (!body.title) throw new AppError("title e obrigatorio", 400)

    const cols = (pipeline.columns ?? []) as OperationalColumn[]
    const targetColId =
      body.operational_column_id ??
      cols.sort((a, b) => a.position - b.position)[0]?.id ??
      null

    const insert = {
      org_id: orgId,
      title: body.title,
      description: body.description ?? null,
      type: body.type ?? "general",
      status: body.status ?? "pending",
      priority: body.priority ?? "medium",
      assignee_id: body.assignee_id ?? null,
      client_id: body.client_id ?? null,
      store_id: body.store_id ?? null,
      due_date: body.due_date ?? null,
      tags: body.tags ?? [],
      metadata: body.metadata ?? {},
      position: body.position ?? 0,
      operational_pipeline_id: pipeline.id,
      operational_column_id: targetColId,
      source_type: "manual" as const,
      created_by: user.id,
    }

    const { data, error } = await admin
      .from("tasks")
      .insert(insert)
      .select("*")
      .single()
    if (error) throw error

    // Disparar automacoes do trigger task_created (fire-and-forget)
    void executeAutomations(pipeline.id, "task_created", {
      taskId: data.id,
      assigneeId: data.assignee_id,
      columnId: data.operational_column_id,
    })

    return successResponse(request, { task: data }, { status: 201 })
  } catch (error) {
    log.error("Create task error", error)
    return errorResponse(request, error, "operational-pipeline-tasks-create")
  }
}
