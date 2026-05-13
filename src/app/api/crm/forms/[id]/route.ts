/**
 * GET    /api/crm/forms/[id]   — form + campos + ultimas submissoes
 * PATCH  /api/crm/forms/[id]   — atualiza metadata, theme, pipeline, fields
 * DELETE /api/crm/forms/[id]   — soft delete (status=archived)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("CrmFormDetail")

export const dynamic = "force-dynamic"

// ── GET ──────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const { data: form, error } = await admin
      .from("crm_forms")
      .select(
        `id, name, slug, description, status, theme, logo_url,
         success_message, redirect_url, pipeline_id, stage_id,
         facebook_pixel_id, google_ads_id, google_analytics_id,
         submissions_count, views_count, created_at, updated_at,
         pipeline:pipelines(id, name, scope, color),
         stage:pipeline_stages!crm_forms_stage_id_fkey(id, name, color)`,
      )
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle()

    if (error) throw error
    if (!form) throw new AppError("Form nao encontrado", 404, "not-found")

    const { data: fields } = await admin
      .from("crm_form_fields")
      .select("*")
      .eq("form_id", id)
      .order("position", { ascending: true })

    const { data: submissions } = await admin
      .from("crm_form_submissions")
      .select(
        "id, status, created_at, lead_id, deal_id, utm_source, utm_campaign",
      )
      .eq("form_id", id)
      .order("created_at", { ascending: false })
      .limit(20)

    return successResponse(request, {
      form,
      fields: fields || [],
      submissions: submissions || [],
    })
  } catch (error) {
    log.error("Form GET error:", error)
    return errorResponse(request, error, "crm-form-get")
  }
}

// ── PATCH ────────────────────────────────────────────────────────

const fieldUpsertSchema = z.object({
  id: uuid().optional(),
  field_type: z.enum([
    "text", "email", "phone", "number", "textarea",
    "select", "multi_select", "radio", "checkbox",
    "date", "url", "cpf", "cnpj", "cep", "hidden",
  ]),
  label: z.string().min(1).max(200),
  placeholder: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  required: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  options: z.array(z.union([z.string(), z.object({ label: z.string(), value: z.string() })])).optional(),
  validation: z.record(z.string(), z.unknown()).optional(),
  map_to_lead_field: z
    .string()
    .regex(
      /^(name|email|phone|company|source|custom:[a-z][a-z0-9_]*|custom_lead:[a-z][a-z0-9_]*|custom_deal:[a-z][a-z0-9_]*)$/,
      'map_to_lead_field deve ser um campo padrao (name|email|phone|company|source) ou ter prefixo "custom:", "custom_lead:" ou "custom_deal:" seguido de uma key snake_case',
    )
    .nullable()
    .optional(),
})

const patchFormSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  theme: z.record(z.string(), z.unknown()).optional(),
  logo_url: z.string().url().nullable().optional().or(z.literal("")),
  success_message: z.string().nullable().optional(),
  redirect_url: z.string().url().nullable().optional().or(z.literal("")),
  pipeline_id: uuid().nullable().optional(),
  stage_id: uuid().nullable().optional(),
  facebook_pixel_id: z.string().nullable().optional(),
  google_ads_id: z.string().nullable().optional(),
  google_analytics_id: z.string().nullable().optional(),
  // Quando fields fornecido, faz replace total: deleta os antigos e
  // insere os novos. Editor envia o array completo a cada save.
  fields: z.array(fieldUpsertSchema).optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchFormSchema.parse(body)
    const { fields, redirect_url, logo_url, ...formData } = parsed

    // Coerce empty string -> null pra colunas URL.
    const update: Record<string, unknown> = { ...formData }
    if (redirect_url !== undefined) update.redirect_url = redirect_url || null
    if (logo_url !== undefined) update.logo_url = logo_url || null

    // Atualiza form.
    if (Object.keys(update).length > 0) {
      const { error } = await admin
        .from("crm_forms")
        .update(update)
        .eq("id", id)
        .eq("org_id", orgId)
      if (error) throw error
    }

    // Replace dos fields (delete + insert).
    if (fields !== undefined) {
      // Garante que o form e da org (RLS bypass com admin client exige check manual).
      const { data: ownForm } = await admin
        .from("crm_forms")
        .select("id")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle()
      if (!ownForm) {
        throw new AppError("Form nao encontrado", 404, "not-found")
      }

      await admin.from("crm_form_fields").delete().eq("form_id", id)

      if (fields.length > 0) {
        const payload = fields.map((f, idx) => {
          // Whitelist explicita (evita campos extras que nao existem no schema)
          const row = f as Record<string, unknown>
          return {
            form_id: id,
            field_type: row.field_type,
            label: row.label,
            placeholder: row.placeholder ?? null,
            description: row.description ?? null,
            required: row.required ?? false,
            position: (row.position as number | undefined) ?? idx,
            // options/validation sao NOT NULL no banco; defaulta com [] / {}
            options: row.options ?? [],
            validation: row.validation ?? {},
            map_to_lead_field: row.map_to_lead_field ?? null,
          }
        })
        const { error: fErr } = await admin
          .from("crm_form_fields")
          .insert(payload)
        if (fErr) throw fErr
      }
    }

    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Form PATCH error:", error)
    return errorResponse(request, error, "crm-form-patch")
  }
}

// ── DELETE ───────────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    // Soft delete: status=archived. Mantem submissions ja recebidas.
    const { error } = await admin
      .from("crm_forms")
      .update({ status: "archived" })
      .eq("id", id)
      .eq("org_id", orgId)
    if (error) throw error

    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Form DELETE error:", error)
    return errorResponse(request, error, "crm-form-delete")
  }
}
