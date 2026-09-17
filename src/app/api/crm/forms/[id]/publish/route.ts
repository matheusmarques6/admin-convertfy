/**
 * POST /api/crm/forms/[id]/publish — publica a versão que o público verá.
 *
 * O editor mexe em `crm_form_fields`; o formulário conversacional lê
 * `form_versions.schema`. Sem este passo, salvar no editor não muda nada
 * para quem responde — e o operador vê "salvo", o que é pior que não ter
 * botão nenhum.
 *
 * A versão é IMUTÁVEL e numerada: quem está no meio do preenchimento
 * continua na versão que abriu, e o histórico não é reescrito por uma
 * edição feita no meio da campanha.
 *
 * GET devolve o diagnóstico da publicação SEM publicar — é o que o aviso
 * na tela mostra antes de o operador clicar.
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { AppError, errorResponse, successResponse } from "@/lib/api/errors"
import { requireAuth } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { montarVersao } from "@/lib/forms/publicar"
import type { CampoLegado } from "@/lib/forms/schema"

const log = logger.child("FormPublish")

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return publicar(request, context, true)
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return publicar(request, context, false)
}

async function publicar(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  gravar: boolean,
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: form, error } = await admin
      .from("crm_forms")
      .select("id, org_id, display_mode, locale, draft_schema, published_version_id, has_unpublished_changes")
      .eq("id", id)
      .maybeSingle()
    if (error) throw error
    if (!form) throw new AppError("Formulário não encontrado", 404, "NOT_FOUND")

    const { data: membro } = await admin
      .from("org_members")
      .select("id")
      .eq("profile_id", user.id)
      .eq("org_id", form.org_id)
      .limit(1)
      .maybeSingle()
    if (!membro) throw new AppError("Sem acesso a este formulário", 403, "FORBIDDEN")

    const { data: campos } = await admin
      .from("crm_form_fields")
      .select("id, field_type, label, placeholder, description, required, position, options, validation, map_to_lead_field")
      .eq("form_id", id)
      .order("position", { ascending: true })

    /**
     * De onde vem a lógica que a nova versão carrega.
     *
     * O rascunho VENCE a versão publicada: é ele que o construtor de
     * fluxo escreve, e publicar a partir da publicada desfaria em
     * silêncio tudo que o operador acabou de montar. Sem rascunho —
     * formulário cuja lógica só existe no ar —, a publicada é o ponto de
     * partida, que é o que preserva o `/forms/diagnostico`.
     */
    let anterior: unknown = form.draft_schema ?? null
    let versaoAtual = 0
    if (form.published_version_id) {
      const { data: v } = await admin
        .from("form_versions")
        .select("schema, version")
        .eq("id", form.published_version_id)
        .maybeSingle()
      if (!anterior) anterior = v?.schema ?? null
      versaoAtual = (v?.version as number | undefined) ?? 0
    }
    if (versaoAtual === 0) {
      // Pode haver versões sem o ponteiro (a 20261144 fez o backfill antes
      // de existir editor). A próxima é sempre max+1, senão o UNIQUE
      // (form_id, version) estoura.
      const { data: ultima } = await admin
        .from("form_versions")
        .select("version")
        .eq("form_id", id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()
      versaoAtual = (ultima?.version as number | undefined) ?? 0
    }

    const modo = form.display_mode === "conversational" ? "conversational" : "classic"
    const r = montarVersao((campos ?? []) as CampoLegado[], anterior, {
      display_mode: modo,
      locale: form.locale ?? "pt-BR",
      version: versaoAtual + 1,
    })

    if (!gravar) {
      return successResponse(request, {
        publicavel: r.schema.blocks.length > 0,
        versao_atual: versaoAtual,
        proxima_versao: versaoAtual + 1,
        tem_alteracoes: Boolean(form.has_unpublished_changes) || !form.published_version_id,
        perguntas: r.schema.blocks.length,
        regras_descartadas: r.regras_descartadas,
        finais_orfaos: r.finais_orfaos,
        novos: r.novos,
      })
    }

    if (r.schema.blocks.length === 0) {
      throw new AppError("Não há perguntas para publicar", 422, "EMPTY_FORM")
    }

    const { data: nova, error: vErr } = await admin
      .from("form_versions")
      .insert({
        org_id: form.org_id,
        form_id: id,
        version: versaoAtual + 1,
        schema: r.schema,
        published_by: user.id,
      })
      .select("id, version")
      .single()
    if (vErr) throw vErr

    const { error: uErr } = await admin
      .from("crm_forms")
      .update({ published_version_id: nova.id, has_unpublished_changes: false })
      .eq("id", id)
    if (uErr) throw uErr

    log.info("form.publicado", {
      formId: id,
      versao: nova.version,
      descartadas: r.regras_descartadas.length,
      novos: r.novos.length,
    })

    return successResponse(request, {
      ok: true,
      versao: nova.version,
      regras_descartadas: r.regras_descartadas,
      finais_orfaos: r.finais_orfaos,
      novos: r.novos,
    })
  } catch (error) {
    return errorResponse(request, error, "form-publish")
  }
}
