/**
 * GET /api/crm/pipelines?scope=sales|cs
 * POST /api/crm/pipelines
 *
 * Lista pipelines do CRM por escopo, com stages e contadores agregados
 * pra renderizar a lista lateral do CRM.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmPipelines")

export const dynamic = "force-dynamic"

const scopeSchema = z.enum(["sales", "cs", "internal", "all"]).default("all")

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const scopeRaw = request.nextUrl.searchParams.get("scope") || "all"
    const scope = scopeSchema.parse(scopeRaw)

    // Select com * pra ser resiliente caso a migration de category/is_favorite
    // ainda nao tenha rodado em algum ambiente — colunas novas simplesmente nao
    // virao no payload, mas o resto continua funcionando.
    let q = admin
      .from("pipelines")
      .select(`
        *,
        pipeline_stages (
          id, name, color, "order", stage_type, sla_hours, description, exit_criteria
        )
      `)
      .eq("is_archived", false)
      .order("created_at", { ascending: true })

    if (scope !== "all") q = q.eq("scope", scope)

    const { data: pipelines, error } = await q
    if (error) throw error

    // Conta deals por pipeline em uma query agregada
    const ids = (pipelines || []).map((p) => p.id)
    const counts = new Map<string, { deal_count: number; total_value: number }>()
    if (ids.length > 0) {
      const { data: dealsAgg } = await admin
        .from("deals")
        .select("pipeline_id, value, status")
        .in("pipeline_id", ids)
        .neq("status", "archived")
      for (const d of dealsAgg || []) {
        const c = counts.get(d.pipeline_id) || { deal_count: 0, total_value: 0 }
        c.deal_count++
        if (d.status === "open") c.total_value += Number(d.value || 0)
        counts.set(d.pipeline_id, c)
      }
    }

    const enriched = (pipelines || []).map((p) => ({
      ...p,
      stages: (p.pipeline_stages || []).sort(
        (a: { order: number }, b: { order: number }) => a.order - b.order,
      ),
      pipeline_stages: undefined,
      deal_count: counts.get(p.id)?.deal_count || 0,
      total_value: counts.get(p.id)?.total_value || 0,
    }))

    return successResponse(request, { pipelines: enriched, scope })
  } catch (error) {
    log.error("CrmPipelines GET error:", error)
    return errorResponse(request, error, "crm-pipelines-get")
  }
}

const createPipelineSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional().nullable(),
  scope: z.enum(["sales", "cs", "internal"]).default("sales"),
  color: z.string().optional().default("#4E62D8"),
  layout: z.enum(["kanban", "state"]).default("kanban"),
  category: z.string().max(64).optional().nullable(),
  is_favorite: z.boolean().optional().default(false),
  default_assignee_id: uuid().optional().nullable(),
  stages: z
    .array(
      z.object({
        name: z.string().min(1),
        color: z.string().optional().default("#71717A"),
        order: z.number().int(),
        stage_type: z.enum(["open", "won", "lost", "archived"]).default("open"),
        sla_hours: z.number().int().positive().optional().nullable(),
        exit_criteria: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
      }),
    )
    .min(1)
    .max(30),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = createPipelineSchema.parse(body)

    // Payload base + campos opcionais (incluidos so se enviados, pra ser
    // resiliente a ambientes onde a migration de category/is_favorite
    // ainda nao rodou).
    const insertPayload: Record<string, unknown> = {
      name: parsed.name,
      description: parsed.description ?? null,
      scope: parsed.scope,
      color: parsed.color,
      layout: parsed.layout,
      default_assignee_id: parsed.default_assignee_id ?? null,
      created_by: user.id,
    }
    if (parsed.category !== undefined) insertPayload.category = parsed.category
    if (parsed.is_favorite !== undefined) insertPayload.is_favorite = parsed.is_favorite

    let { data: pipeline, error } = await admin
      .from("pipelines")
      .insert(insertPayload)
      .select("id")
      .single()

    // Retry sem category/is_favorite se a migration nao tiver rodado
    if (error && /column .* does not exist/i.test(error.message)) {
      log.warn("[Pipelines] retrying without category/is_favorite (migration pending)")
      delete insertPayload.category
      delete insertPayload.is_favorite
      const retry = await admin
        .from("pipelines")
        .insert(insertPayload)
        .select("id")
        .single()
      pipeline = retry.data
      error = retry.error
    }

    if (error || !pipeline) throw error

    const stagesPayload = parsed.stages.map((s) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      color: s.color,
      order: s.order,
      stage_type: s.stage_type,
      sla_hours: s.sla_hours ?? null,
      exit_criteria: s.exit_criteria ?? null,
      description: s.description ?? null,
    }))

    const { error: stagesErr } = await admin
      .from("pipeline_stages")
      .insert(stagesPayload)

    if (stagesErr) throw stagesErr

    log.info("[Pipelines] created", { id: pipeline.id, name: parsed.name, scope: parsed.scope })
    return successResponse(request, { id: pipeline.id })
  } catch (error) {
    log.error("CrmPipelines POST error:", error)
    return errorResponse(request, error, "crm-pipelines-post")
  }
}
