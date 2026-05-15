/**
 * GET  /api/crm/tags?entity=lead|deal — lista tags da org
 * POST /api/crm/tags                  — cria tag {name, color, entity_type}
 *
 * Tags sao multi-tenant via org_id. entity_type permite separar tags por
 * dominio (lead vs deal) — UI passa filter via ?entity= e o select de
 * criacao envia entity_type explicito.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  requireAuth,
  successResponse,
  AppError,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("CrmTags")

export const dynamic = "force-dynamic"

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  entity_type: z.enum(["lead", "deal", "client"]).default("lead"),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    if (!orgId) throw new AppError("Sem org membership", 403)
    const admin = createAdminClient()

    const entity = request.nextUrl.searchParams.get("entity")
    let q = admin
      .from("tags")
      .select("id, name, color, entity_type, created_at")
      .eq("org_id", orgId)
      .order("name", { ascending: true })
    if (entity) q = q.eq("entity_type", entity)

    const { data, error } = await q
    if (error) throw error
    return successResponse(request, { tags: data ?? [] })
  } catch (e) {
    return errorResponse(request, e, "crm-tags-list")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    if (!orgId) throw new AppError("Sem org membership", 403)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      throw new AppError(
        "Payload invalido: " + parsed.error.issues.map((i) => i.message).join("; "),
        400,
      )
    }
    const { name, color, entity_type } = parsed.data

    // Dedupe por (org, entity_type, lowercase(name))
    const { data: existing } = await admin
      .from("tags")
      .select("id, name, color, entity_type")
      .eq("org_id", orgId)
      .eq("entity_type", entity_type)
      .ilike("name", name)
      .maybeSingle()
    if (existing) {
      return successResponse(request, { tag: existing, existed: true })
    }

    const { data, error } = await admin
      .from("tags")
      .insert({
        name: name.trim(),
        color: color ?? "#4E62D8",
        entity_type,
        org_id: orgId,
        created_by: user.id,
      })
      .select("id, name, color, entity_type")
      .single()
    if (error) throw error
    return successResponse(request, { tag: data, existed: false })
  } catch (e) {
    log.error("create tag failed", e)
    return errorResponse(request, e, "crm-tags-create")
  }
}
