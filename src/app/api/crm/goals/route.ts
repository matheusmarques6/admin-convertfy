/**
 * GET  /api/crm/goals  — metas da org (filtra por período/tipo)
 * POST /api/crm/goals  — cria ou atualiza a meta do período
 *
 * O POST é upsert por (org, tipo, período, responsável, pipeline):
 * redefinir a meta do mês é operação corriqueira e não deveria exigir
 * achar e editar o registro antigo.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmGoals")

export const dynamic = "force-dynamic"

const GOAL_FIELDS =
  "id, goal_type, period_type, period_start, target_value, owner_id, pipeline_id, notes, created_at, updated_at"

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
    if (!orgId) return successResponse(request, { goals: [] })

    const sp = request.nextUrl.searchParams
    const periodStart = sp.get("period_start")
    const periodType = sp.get("period_type")

    let q = admin
      .from("crm_sales_goals")
      .select(GOAL_FIELDS)
      .eq("org_id", orgId)
      .order("period_start", { ascending: false })
      .limit(200)

    if (periodStart) q = q.eq("period_start", periodStart)
    if (periodType) q = q.eq("period_type", periodType)

    const { data, error } = await q
    if (error) {
      if (isMissingSchema(error)) {
        log.warn("[Goals] tabela ausente — rode a migration 20261055")
        return successResponse(request, { goals: [], schema_missing: true })
      }
      throw error
    }

    return successResponse(request, { goals: data ?? [] })
  } catch (error) {
    log.error("Goals GET error:", error)
    return errorResponse(request, error, "crm-goals-get")
  }
}

const upsertSchema = z.object({
  goal_type: z.enum(["revenue_won", "deals_won"]).optional().default("revenue_won"),
  period_type: z.enum(["month", "quarter", "year"]).optional().default("month"),
  /** Primeiro dia do período — YYYY-MM-DD. */
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  target_value: z.number().positive().max(999_999_999),
  owner_id: uuid().nullable().optional(),
  pipeline_id: uuid().nullable().optional(),
  notes: z.string().max(300).nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrg(admin, user.id)
    if (!orgId) throw new AppError("Sem org membership", 403)

    const body = await request.json()
    const parsed = upsertSchema.parse(body)

    const payload = {
      ...parsed,
      owner_id: parsed.owner_id ?? null,
      pipeline_id: parsed.pipeline_id ?? null,
      notes: parsed.notes ?? null,
      org_id: orgId,
      created_by: user.id,
    }

    // O índice único usa COALESCE, que o onConflict do PostgREST não
    // alcança: procura a meta equivalente e decide entre update e insert.
    let existing = admin
      .from("crm_sales_goals")
      .select("id")
      .eq("org_id", orgId)
      .eq("goal_type", payload.goal_type)
      .eq("period_type", payload.period_type)
      .eq("period_start", payload.period_start)
    existing = payload.owner_id
      ? existing.eq("owner_id", payload.owner_id)
      : existing.is("owner_id", null)
    existing = payload.pipeline_id
      ? existing.eq("pipeline_id", payload.pipeline_id)
      : existing.is("pipeline_id", null)

    const { data: found, error: findErr } = await existing.maybeSingle()
    if (findErr && !isMissingSchema(findErr)) throw findErr
    if (findErr && isMissingSchema(findErr)) {
      throw new AppError(
        "Metas ainda não foram habilitadas no banco (migration 20261055).",
        422,
        "validation-error",
      )
    }

    const { data, error } = found
      ? await admin
          .from("crm_sales_goals")
          .update({
            target_value: payload.target_value,
            notes: payload.notes,
          })
          .eq("id", found.id)
          .select(GOAL_FIELDS)
          .single()
      : await admin.from("crm_sales_goals").insert(payload).select(GOAL_FIELDS).single()

    if (error) throw error

    log.info("[Goals] salva", {
      id: data.id,
      target: payload.target_value,
      owner: payload.owner_id ?? "time",
    })
    return successResponse(request, { goal: data }, { status: found ? 200 : 201 })
  } catch (error) {
    log.error("Goals POST error:", error)
    return errorResponse(request, error, "crm-goals-post")
  }
}
