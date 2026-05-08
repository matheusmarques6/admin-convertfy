/**
 * GET /api/public/forms/[slug]
 *
 * Retorna o form publico (publicado) + fields pra renderizar a
 * pagina de captacao. NAO exige auth — acessivel por anon.
 *
 * Importante: servico filtra status='published' pra evitar expor
 * forms em rascunho. RLS nao se aplica (admin client server-side).
 */

import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("PublicForms")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params
    const admin = createAdminClient()

    // Slug nao e unico globalmente (e por org). Usamos primeiro
    // resultado publicado — em DEV/produco a unicidade global pode
    // ser atingida via prefixo de org no slug. Pra MVP, primeiro hit.
    const { data: form, error } = await admin
      .from("crm_forms")
      .select(
        `id, org_id, name, slug, description, theme, logo_url,
         success_message, redirect_url,
         facebook_pixel_id, google_ads_id, google_analytics_id`,
      )
      .eq("slug", slug)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!form) throw new AppError("Form nao encontrado", 404, "not-found")

    const { data: fields, error: fErr } = await admin
      .from("crm_form_fields")
      .select(
        "id, field_type, label, placeholder, description, required, position, options, validation, map_to_lead_field",
      )
      .eq("form_id", form.id)
      .order("position", { ascending: true })

    if (fErr) throw fErr

    // Fire-and-forget incremento de views.
    void admin.rpc("increment_form_views", { p_form_id: form.id })

    return successResponse(request, { form, fields: fields || [] })
  } catch (error) {
    log.error("Public form GET error:", error)
    return errorResponse(request, error, "public-form-get")
  }
}
