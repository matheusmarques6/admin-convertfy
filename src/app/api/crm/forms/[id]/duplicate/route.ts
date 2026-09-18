/**
 * POST /api/crm/forms/[id]/duplicate — a cópia do formulário.
 *
 * Nasce RASCUNHO, com slug `<slug>-copia` (ou `-copia-2`…), campos
 * copiados e o rascunho do fluxo com os `ref` trocados pelos ids novos
 * — sem o remap, toda regra de salto da cópia apontaria para perguntas
 * do ORIGINAL, e a publicação as descartaria em silêncio.
 *
 * O que NÃO vem: versões publicadas, respostas, sessões, `views_count`
 * e o token da CAPI (é segredo do formulário de origem; quem duplica
 * cola o dele). Pixel/UTM/pipeline vêm — são configuração, não dado.
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { normalizarSchema } from "@/lib/forms/schema"
import { remapearRefs } from "@/lib/forms/remapear-refs"

const log = logger.child("FormDuplicate")

export const dynamic = "force-dynamic"

const COLUNAS_COPIADAS = [
  "name", "description", "pipeline_id", "stage_id", "theme", "logo_url", "success_message",
  "redirect_url", "settings", "display_mode", "locale", "facebook_pixel_id", "google_ads_id",
  "google_ads_conversion_label", "tracking_config", "meta_test_event_code",
] as const

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: origem, error } = await admin.from("crm_forms").select("*").eq("id", id).maybeSingle()
    if (error) throw error
    if (!origem) throw new AppError("Formulário não encontrado", 404, "NOT_FOUND")

    const { data: membro } = await admin
      .from("org_members")
      .select("id")
      .eq("profile_id", user.id)
      .eq("org_id", origem.org_id)
      .limit(1)
      .maybeSingle()
    if (!membro) throw new AppError("Sem acesso a este formulário", 403, "FORBIDDEN")

    // Slug livre: `-copia`, depois `-copia-2`, `-copia-3`…
    const base = `${String(origem.slug).replace(/-copia(-\d+)?$/, "")}-copia`
    const { data: usados } = await admin
      .from("crm_forms")
      .select("slug")
      .eq("org_id", origem.org_id)
      .like("slug", `${base}%`)
    const ocupados = new Set((usados ?? []).map((r) => r.slug as string))
    let slug = base
    for (let i = 2; ocupados.has(slug); i++) slug = `${base}-${i}`

    const dados: Record<string, unknown> = {}
    for (const c of COLUNAS_COPIADAS) {
      if (origem[c] !== undefined) dados[c] = origem[c]
    }
    const inserir = (comExtras: boolean) =>
      admin
        .from("crm_forms")
        .insert({
          ...(comExtras ? dados : { name: origem.name, description: origem.description, theme: origem.theme }),
          name: `${origem.name} (cópia)`,
          slug,
          org_id: origem.org_id,
          created_by: user.id,
          status: "draft",
        })
        .select("id")
        .single()
    let { data: novo, error: iErr } = await inserir(true)
    if (iErr && (iErr.code === "42703" || iErr.code === "PGRST204")) {
      log.warn("forms.duplicate_sem_colunas", { code: iErr.code, message: iErr.message })
      ;({ data: novo, error: iErr } = await inserir(false))
    }
    if (iErr) throw iErr
    if (!novo) throw new AppError("Falha ao duplicar", 500, "forms-duplicate")

    const { data: campos } = await admin
      .from("crm_form_fields")
      .select("*")
      .eq("form_id", id)
      .order("position", { ascending: true })

    const mapa: Record<string, string> = {}
    if (campos && campos.length > 0) {
      const linhas = campos.map((c) => {
        const { id: _id, form_id: _f, created_at: _c, updated_at: _u, ...resto } = c as Record<string, unknown>
        return { ...resto, form_id: novo!.id }
      })
      const { error: fErr } = await admin.from("crm_form_fields").insert(linhas)
      if (fErr) throw fErr
      const { data: novos } = await admin
        .from("crm_form_fields")
        .select("id, position")
        .eq("form_id", novo.id)
        .order("position", { ascending: true })
      campos.forEach((c, i) => {
        const n = novos?.[i]
        if (n) mapa[c.id as string] = n.id as string
      })
    }

    // O rascunho vence a versão publicada — é o que o editor mostra.
    let fluxo: unknown = origem.draft_schema ?? null
    if (!fluxo && origem.published_version_id) {
      const { data: v } = await admin
        .from("form_versions")
        .select("schema")
        .eq("id", origem.published_version_id)
        .maybeSingle()
      fluxo = v?.schema ?? null
    }
    if (fluxo) {
      const { error: dErr } = await admin
        .from("crm_forms")
        .update({ draft_schema: remapearRefs(normalizarSchema(fluxo), mapa) })
        .eq("id", novo.id)
      if (dErr) log.warn("forms.duplicate_sem_draft", { code: dErr.code })
    }

    log.info("forms.duplicated", { de: id, para: novo.id })
    return successResponse(request, { id: novo.id, slug })
  } catch (error) {
    log.error("Form duplicate error:", error)
    return errorResponse(request, error, "crm-form-duplicate")
  }
}
