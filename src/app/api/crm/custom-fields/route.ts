/**
 * GET  /api/crm/custom-fields?entity=lead|deal — lista campos customizados
 * POST /api/crm/custom-fields                  — cria novo campo
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("CrmCustomFields")

export const dynamic = "force-dynamic"

const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "select",
  "multi_select",
  "boolean",
  "date",
  "url",
  "email",
  "phone",
] as const

const ENTITY_TYPES = ["lead", "deal"] as const

// Slug deve ser snake_case [a-z0-9_], comecando com letra.
const KEY_REGEX = /^[a-z][a-z0-9_]*$/

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const entity = request.nextUrl.searchParams.get("entity") || "lead"
    if (!ENTITY_TYPES.includes(entity as (typeof ENTITY_TYPES)[number])) {
      throw new AppError("entity invalido (use lead ou deal)", 400, "validation")
    }

    const { data, error } = await admin
      .from("crm_custom_fields")
      .select("id, entity_type, key, label, field_type, options, description, required, position, is_active, created_at, updated_at")
      .eq("org_id", orgId)
      .eq("entity_type", entity)
      .eq("is_active", true)
      .order("position", { ascending: true })

    if (error) throw error
    return successResponse(request, { fields: data || [] })
  } catch (error) {
    log.error("Custom fields GET error:", error)
    return errorResponse(request, error, "crm-custom-fields-get")
  }
}

const createSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES).default("lead"),
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(KEY_REGEX, "Use apenas letras minúsculas, números e _ (começando com letra)"),
  label: z.string().min(1).max(120),
  field_type: z.enum(FIELD_TYPES).default("text"),
  options: z.array(z.union([z.string(), z.object({ label: z.string(), value: z.string() })])).optional().default([]),
  description: z.string().nullable().optional(),
  required: z.boolean().optional().default(false),
  position: z.number().int().nonnegative().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = createSchema.parse(body)

    // Calcula position se nao informado (ultima + 1)
    let position = parsed.position
    if (position == null) {
      const { data: last } = await admin
        .from("crm_custom_fields")
        .select("position")
        .eq("org_id", orgId)
        .eq("entity_type", parsed.entity_type)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle()
      position = (last?.position ?? -1) + 1
    }

    const { data, error } = await admin
      .from("crm_custom_fields")
      .insert({
        org_id: orgId,
        entity_type: parsed.entity_type,
        key: parsed.key,
        label: parsed.label,
        field_type: parsed.field_type,
        options: parsed.options,
        description: parsed.description ?? null,
        required: parsed.required,
        position,
        created_by: user.id,
      })
      .select("id, key, label, field_type, options, description, required, position, entity_type")
      .single()

    if (error) {
      // Conflito de UNIQUE (org_id, entity_type, key)
      if ((error as { code?: string }).code === "23505") {
        throw new AppError(`Ja existe um campo com a chave "${parsed.key}"`, 409, "conflict")
      }
      throw error
    }

    return successResponse(request, { field: data })
  } catch (error) {
    log.error("Custom fields POST error:", error)
    return errorResponse(request, error, "crm-custom-fields-post")
  }
}
