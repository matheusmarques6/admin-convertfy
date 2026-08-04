/**
 * GET /api/crm/lost-reasons — motivos de perda da org (ordenados)
 * PUT /api/crm/lost-reasons — substitui a lista (gestão inline no dialog)
 *
 * `deals.lost_reason` é TEXT livre (sem FK), então substituir a lista
 * nunca corrompe histórico — negócios perdidos guardam o texto da época.
 * Org sem lista configurada usa os motivos padrão do código (fallback
 * no client).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmLostReasons")

export const dynamic = "force-dynamic"

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
    if (!orgId) return successResponse(request, { reasons: [] })

    const { data, error } = await admin
      .from("crm_lost_reasons")
      .select("id, label, position")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("position", { ascending: true })
      .order("label", { ascending: true })

    if (error) {
      if (isMissingSchema(error)) {
        return successResponse(request, { reasons: [], schema_missing: true })
      }
      throw error
    }

    return successResponse(request, { reasons: data ?? [] })
  } catch (error) {
    log.error("LostReasons GET error:", error)
    return errorResponse(request, error, "crm-lost-reasons-get")
  }
}

const putSchema = z.object({
  labels: z.array(z.string().min(1).max(120)).max(30),
})

export async function PUT(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrg(admin, user.id)
    if (!orgId) throw new AppError("Sem org membership", 403)

    const body = await request.json()
    const parsed = putSchema.parse(body)

    // Dedupe case-insensitive preservando a ordem digitada.
    const seen = new Set<string>()
    const labels = parsed.labels
      .map((l) => l.trim())
      .filter((l) => {
        if (!l) return false
        const key = l.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

    const { error: delErr } = await admin
      .from("crm_lost_reasons")
      .delete()
      .eq("org_id", orgId)
    if (delErr) {
      if (isMissingSchema(delErr)) {
        throw new AppError(
          "Motivos configuráveis ainda não habilitados no banco (migration 20261068).",
          422,
          "validation-error",
        )
      }
      throw delErr
    }

    if (labels.length > 0) {
      const { error: insErr } = await admin.from("crm_lost_reasons").insert(
        labels.map((label, i) => ({
          org_id: orgId,
          label,
          position: (i + 1) * 10,
        })),
      )
      if (insErr) throw insErr
    }

    log.info("[LostReasons] lista atualizada", { orgId, count: labels.length })
    return successResponse(request, { count: labels.length })
  } catch (error) {
    log.error("LostReasons PUT error:", error)
    return errorResponse(request, error, "crm-lost-reasons-put")
  }
}
