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
import { normalizeTrackingConfig } from "@/types/form-tracking"
import { normalizarSchema, schemaDeCampos, type CampoLegado } from "@/lib/forms/schema"
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
         facebook_pixel_id, google_ads_id, google_analytics_id,
         google_ads_conversion_label, tracking_config,
         display_mode, published_version_id, locale`,
      )
      .eq("slug", slug)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!form) throw new AppError("Form nao encontrado", 404, "not-found")

    // Descritor de tracking pro browser (client-side). NUNCA inclui o
    // token da CAPI (nem foi selecionado) nem as regras do qualificado
    // (avaliacao e server-side). So o necessario pra fbq/gtag.
    const {
      tracking_config,
      google_ads_conversion_label,
      ...formRest
    } = form as Record<string, unknown> & {
      facebook_pixel_id?: string | null
      google_ads_id?: string | null
      google_ads_conversion_label?: string | null
    }
    const cfg = normalizeTrackingConfig(tracking_config)
    const tracking = {
      meta_browser_pixel: Boolean(cfg.meta.enabled && cfg.meta.browser_pixel),
      meta_pixel_id: cfg.meta.enabled ? (form.facebook_pixel_id ?? null) : null,
      google_enabled: Boolean(cfg.google.enabled),
      google_ads_id: cfg.google.enabled ? (form.google_ads_id ?? null) : null,
      google_ads_conversion_label: cfg.google.enabled
        ? (google_ads_conversion_label ?? null)
        : null,
    }
    const publicForm = { ...formRest, tracking }

    const { data: fields, error: fErr } = await admin
      .from("crm_form_fields")
      .select(
        "id, field_type, label, placeholder, description, required, position, options, validation, map_to_lead_field",
      )
      .eq("form_id", form.id)
      .order("position", { ascending: true })

    if (fErr) throw fErr

    // O SCHEMA publicado, que o conversacional precisa: ele carrega o que
    // `crm_form_fields` não tem — lógica de salto, finais e a tela de
    // abertura. O clássico continua lendo `fields`, byte a byte como
    // antes; os dois viajam juntos e o cliente escolhe pelo display_mode.
    //
    // Sem versão publicada (formulário anterior à 20261144, ou migration
    // atrasada), o schema é derivado dos campos de agora: o conversacional
    // funciona sem lógica em vez de não funcionar.
    let schema = null
    let displayMode: "classic" | "conversational" = "classic"
    try {
      const modo = (form as { display_mode?: string | null }).display_mode
      displayMode = modo === "conversational" ? "conversational" : "classic"
      const versionId = (form as { published_version_id?: string | null }).published_version_id
      if (versionId) {
        const { data: v } = await admin
          .from("form_versions")
          .select("schema")
          .eq("id", versionId)
          .maybeSingle()
        if (v?.schema) schema = normalizarSchema(v.schema)
      }
      if (!schema) {
        schema = schemaDeCampos((fields ?? []) as CampoLegado[], {
          display_mode: displayMode,
          locale: (form as { locale?: string | null }).locale ?? "pt-BR",
        })
      }
      // O modo vive na COLUNA, que é o que o editor troca; o schema pode
      // ter sido publicado antes da troca e ficaria desatualizado.
      schema = { ...schema, display_mode: displayMode }
    } catch (e) {
      // Coluna ausente (migration atrasada) não pode derrubar o formulário
      // que está no ar com verba em cima.
      log.warn("form.schema_indisponivel", { slug, message: (e as Error)?.message })
    }

    // AWAIT, nunca `void`: promise solta em serverless morre quando o
    // processo congela depois do `return` — era por isso que VISITAS
    // ficava em 0 com 56 envios. A mesma armadilha que perdeu os eventos
    // de conversão da Meta e a cotação do câmbio.
    //
    // Falhar a contagem NÃO pode derrubar o formulário: a métrica é
    // secundária, o formulário é o produto.
    const { error: viewErr } = await admin.rpc("increment_form_views", {
      p_form_id: form.id,
    })
    if (viewErr) log.warn("form.view_nao_contada", { formId: form.id, code: viewErr.code, message: viewErr.message })

    return successResponse(request, {
      form: publicForm,
      fields: fields || [],
      schema,
      display_mode: displayMode,
    })
  } catch (error) {
    log.error("Public form GET error:", error)
    return errorResponse(request, error, "public-form-get")
  }
}
