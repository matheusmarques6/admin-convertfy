/**
 * GET  /api/crm/saved-views  — visões do usuário + compartilhadas da org
 * POST /api/crm/saved-views  — salva o recorte atual do board
 *
 * Uma "visão" é o recorte inteiro do board: filtros, ordenação, modo de
 * exibição (kanban/tabela) e colunas visíveis. Sem isso o vendedor
 * remonta os mesmos filtros toda manhã.
 *
 * Query params (GET):
 *   pipeline_id  — traz as views daquele pipeline + as globais (sem pipeline)
 *   scope        — sales (default) | cs | internal
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmSavedViews")

export const dynamic = "force-dynamic"

const VIEW_FIELDS =
  "id, pipeline_id, scope, name, filters, sort, view_mode, columns, is_shared, created_by, created_at, updated_at"

/** Erro de schema = migration pendente; a UI degrada sem views. */
function isMissingSchema(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204") return true
  return (e.message || "").toLowerCase().includes("does not exist")
}

async function resolveOrg(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
  return data?.org_id ?? null
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrg(admin, user.id)
    if (!orgId) return successResponse(request, { views: [] })

    const sp = request.nextUrl.searchParams
    const pipelineId = sp.get("pipeline_id")
    const scope = sp.get("scope") || "sales"

    let q = admin
      .from("crm_saved_views")
      .select(VIEW_FIELDS)
      .eq("org_id", orgId)
      .eq("scope", scope)
      // Só as próprias e as compartilhadas — view privada de colega não vaza
      .or(`created_by.eq.${user.id},is_shared.eq.true`)
      .order("name", { ascending: true })

    // Views globais (pipeline_id NULL) valem em qualquer board
    if (pipelineId) q = q.or(`pipeline_id.eq.${pipelineId},pipeline_id.is.null`)

    const { data, error } = await q
    if (error) {
      if (isMissingSchema(error)) {
        log.warn("[SavedViews] tabela ausente — rode a migration 20261054")
        return successResponse(request, { views: [], schema_missing: true })
      }
      throw error
    }

    const views = (data ?? []).map((v) => ({
      ...v,
      is_owner: v.created_by === user.id,
    }))

    return successResponse(request, { views })
  } catch (error) {
    log.error("Saved views GET error:", error)
    return errorResponse(request, error, "crm-saved-views-get")
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  pipeline_id: uuid().nullable().optional(),
  scope: z.enum(["sales", "cs", "internal"]).optional().default("sales"),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
  sort: z.string().max(40).optional().default("moved_desc"),
  view_mode: z.enum(["kanban", "table"]).optional().default("kanban"),
  columns: z.array(z.string().max(40)).max(30).optional().default([]),
  is_shared: z.boolean().optional().default(false),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrg(admin, user.id)
    if (!orgId) throw new AppError("Sem org membership", 403)

    const body = await request.json()
    const parsed = createSchema.parse(body)

    const { data, error } = await admin
      .from("crm_saved_views")
      .insert({
        ...parsed,
        pipeline_id: parsed.pipeline_id ?? null,
        org_id: orgId,
        created_by: user.id,
      })
      .select(VIEW_FIELDS)
      .single()

    if (error) {
      if (error.code === "23505") {
        throw new AppError(
          "Você já tem uma visão com esse nome neste pipeline.",
          409,
          "conflict",
        )
      }
      if (isMissingSchema(error)) {
        throw new AppError(
          "Visões salvas ainda não foram habilitadas no banco (migration 20261054).",
          422,
          "validation-error",
        )
      }
      throw error
    }

    log.info("[SavedViews] created", { id: data.id, name: parsed.name })
    return successResponse(
      request,
      { view: { ...data, is_owner: true } },
      { status: 201 },
    )
  } catch (error) {
    log.error("Saved views POST error:", error)
    return errorResponse(request, error, "crm-saved-views-post")
  }
}
