/**
 * GET  /api/crm/forms      — lista forms da org
 * POST /api/crm/forms      — cria novo form (com fields opcionais)
 *
 * Autenticacao: requireAuth + resolveOrgId (RLS filtra por org_id).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("CrmForms")

export const dynamic = "force-dynamic"

// ── GET ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const status = request.nextUrl.searchParams.get("status")

    let q = admin
      .from("crm_forms")
      .select(
        `id, name, slug, description, status, theme, pipeline_id, stage_id,
         submissions_count, views_count, created_at, updated_at,
         pipeline:pipelines(id, name, color),
         stage:pipeline_stages!crm_forms_stage_id_fkey(id, name)`,
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })

    if (status) q = q.eq("status", status)

    const { data, error } = await q
    if (error) throw error

    return successResponse(request, { forms: data || [] })
  } catch (error) {
    log.error("Forms GET error:", error)
    return errorResponse(request, error, "crm-forms-get")
  }
}

// ── POST ─────────────────────────────────────────────────────────

const fieldSchema = z.object({
  field_type: z.enum([
    "text", "email", "phone", "number", "textarea",
    "select", "multi_select", "radio", "checkbox",
    "date", "url", "cpf", "cnpj", "cep", "hidden",
  ]),
  label: z.string().min(1).max(200),
  placeholder: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  required: z.boolean().optional().default(false),
  position: z.number().int().min(0).optional().default(0),
  options: z.array(z.union([z.string(), z.object({ label: z.string(), value: z.string() })])).optional().default([]),
  validation: z.record(z.string(), z.unknown()).optional().default({}),
  map_to_lead_field: z.enum(["name", "email", "phone", "company", "source"]).nullable().optional(),
})

const createFormSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Use letras minusculas, numeros e hifens"),
  description: z.string().nullable().optional(),
  pipeline_id: uuid().nullable().optional(),
  stage_id: uuid().nullable().optional(),
  theme: z.record(z.string(), z.unknown()).optional(),
  success_message: z.string().nullable().optional(),
  redirect_url: z.string().url().nullable().optional().or(z.literal("")),
  fields: z.array(fieldSchema).optional().default([]),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = createFormSchema.parse(body)

    // Verifica unicidade do slug pra dar 409 antes do conflito de DB.
    const { data: existing } = await admin
      .from("crm_forms")
      .select("id")
      .eq("org_id", orgId)
      .eq("slug", parsed.slug)
      .maybeSingle()
    if (existing) {
      throw new AppError(
        `Slug "${parsed.slug}" ja esta em uso nesta org.`,
        409,
        "slug-conflict",
      )
    }

    const { fields = [], redirect_url, ...formData } = parsed
    const { data: form, error } = await admin
      .from("crm_forms")
      .insert({
        org_id: orgId,
        created_by: user.id,
        // string vazia vira NULL pra nao gerar URL invalida
        redirect_url: redirect_url || null,
        ...formData,
      })
      .select("id, slug")
      .single()

    if (error) throw error

    // Insert dos fields em batch.
    if (fields.length > 0) {
      const fieldsPayload = fields.map((f, idx) => ({
        ...f,
        form_id: form.id,
        position: f.position ?? idx,
      }))
      const { error: fErr } = await admin
        .from("crm_form_fields")
        .insert(fieldsPayload)
      if (fErr) {
        log.warn("Failed to insert fields, form created without fields", { fErr })
      }
    }

    log.info("[Forms] created", { id: form.id, slug: form.slug })
    return successResponse(request, { id: form.id, slug: form.slug })
  } catch (error) {
    log.error("Forms POST error:", error)
    return errorResponse(request, error, "crm-forms-post")
  }
}
