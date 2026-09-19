/**
 * O formulário público, pronto para renderizar — UMA leitura para a
 * página e para `GET /api/public/forms/[slug]`.
 *
 * ## Por que existe
 *
 * A página `/forms/[slug]` fazia um `fetch` HTTP para a PRÓPRIA API:
 * lambda → edge → outra lambda → Supabase → volta. Era uma invocação
 * inteira a mais por visita (com o próprio cold start), só para chamar
 * código que mora no mesmo deploy. O destino de um anúncio pago pagava
 * dois saltos onde um bastava. Agora a página chama esta função.
 *
 * ## O cache
 *
 * O formulário publicado muda quando alguém PUBLICA, salva ou arquiva —
 * poucas vezes por dia; é lido a cada visita. `unstable_cache` guarda o
 * payload pronto por `REVALIDACAO_S` no Data Cache da Vercel, com tag por
 * slug: as rotas que escrevem chamam `invalidarFormularioPublico`, então
 * quem publica vê o formulário novo na visita seguinte, e a visita comum
 * não toca o banco. Três consultas (form, campos, versão) saem do
 * caminho crítico.
 *
 * A contagem de VISITAS ficou de fora do cache por definição — ela é a
 * única escrita por visita — e roda em `after()`, depois de a resposta
 * sair: o visitante não espera o `UPDATE`, e a Vercel mantém a função
 * viva até ele terminar (é a diferença para o `void`, que morria no
 * congelamento — foi assim que VISITAS ficou em 0 com 56 envios).
 */

import { revalidateTag, unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeTrackingConfig } from "@/types/form-tracking"
import { normalizarDestino } from "@/lib/forms/destino"
import { normalizarSchema, schemaDeCampos, type CampoLegado } from "@/lib/forms/schema"
import { acessoAoFormulario } from "@/lib/forms/pontuacao"
import type { DestinoDoFinal, FormSchema } from "@/types/forms-conversational"
import { logger } from "@/lib/logger"

const log = logger.child("PublicForm")

/** Quanto tempo o payload pronto vive sem ninguém invalidar. */
export const REVALIDACAO_S = 60

const TAG_TODOS = "form-publico"

/** A tag de cache de UM formulário, pelo slug — é o que as rotas de escrita invalidam. */
export function tagDoFormularioPublico(slug: string): string {
  return `form-publico:${slug}`
}

export interface FormTrackingPublico {
  meta_browser_pixel: boolean
  meta_pixel_id: string | null
  form_step: boolean
  lead_no_parcial: boolean
  google_enabled: boolean
  google_ads_id: string | null
  google_ads_conversion_label: string | null
}

export interface FormularioPublico {
  form: {
    id: string
    org_id: string
    name: string
    slug: string
    description: string | null
    theme: Record<string, unknown>
    logo_url: string | null
    success_message: string | null
    redirect_url: string | null
    facebook_pixel_id?: string | null
    google_ads_id?: string | null
    google_analytics_id?: string | null
    display_mode?: string | null
    published_version_id?: string | null
    locale?: string | null
    tracking: FormTrackingPublico
    destino_qualificado: DestinoDoFinal | null
  }
  fields: Array<{
    id: string
    field_type: string
    label: string
    placeholder: string | null
    description: string | null
    required: boolean
    position: number
    options: Array<string | { label: string; value: string }>
    validation: Record<string, unknown>
    map_to_lead_field: string | null
  }>
  /** O schema publicado (a versão), que o conversacional consome. */
  schema: FormSchema | null
  display_mode: "classic" | "conversational"
  /** Fechado à mão ou no limite de envios (aba Configurar → Acesso). */
  acesso: { aberto: true } | { aberto: false; motivo: string; mensagem: string }
}

async function lerFormularioPublico(slug: string): Promise<FormularioPublico | null> {
  const admin = createAdminClient()

  // Slug não é único globalmente (é por org). Primeiro resultado publicado.
  const { data: form, error } = await admin
    .from("crm_forms")
    .select(
      `id, org_id, name, slug, description, theme, logo_url,
       success_message, redirect_url,
       facebook_pixel_id, google_ads_id, google_analytics_id,
       google_ads_conversion_label, tracking_config,
       display_mode, published_version_id, locale, settings, submissions_count`,
    )
    .eq("slug", slug)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!form) return null

  // Descritor de tracking pro browser. NUNCA inclui o token da CAPI (nem
  // foi selecionado) nem as regras do qualificado (avaliação server-side).
  const {
    tracking_config,
    google_ads_conversion_label,
    settings,
    submissions_count,
    ...formRest
  } = form as Record<string, unknown> & {
    facebook_pixel_id?: string | null
    google_ads_id?: string | null
    google_ads_conversion_label?: string | null
  }
  const cfg = normalizeTrackingConfig(tracking_config)
  const tracking: FormTrackingPublico = {
    meta_browser_pixel: Boolean(cfg.meta.enabled && cfg.meta.browser_pixel),
    meta_pixel_id: cfg.meta.enabled ? (form.facebook_pixel_id ?? null) : null,
    form_step: Boolean(cfg.meta.form_step),
    lead_no_parcial: Boolean(cfg.meta.lead_no_parcial),
    google_enabled: Boolean(cfg.google.enabled),
    google_ads_id: cfg.google.enabled ? (form.google_ads_id ?? null) : null,
    google_ads_conversion_label: cfg.google.enabled
      ? (google_ads_conversion_label ?? null)
      : null,
  }
  // De `settings` sai SÓ o destino do qualificado. A mesma coluna guarda o
  // `abandono_stage_id` — um id de etapa do CRM, que não tem por que
  // viajar para o navegador de quem preenche.
  const destinoQualificado = normalizarDestino(
    (settings as Record<string, unknown> | null)?.destino_qualificado,
  )

  const { data: fields, error: fErr } = await admin
    .from("crm_form_fields")
    .select(
      "id, field_type, label, placeholder, description, required, position, options, validation, map_to_lead_field",
    )
    .eq("form_id", form.id)
    .order("position", { ascending: true })
  if (fErr) throw fErr

  // O SCHEMA publicado, que o conversacional precisa: lógica de salto,
  // finais e a tela de abertura. Sem versão publicada (formulário anterior
  // à 20261144, ou migration atrasada), o schema é derivado dos campos de
  // agora: o conversacional funciona sem lógica em vez de não funcionar.
  let schema: FormSchema | null = null
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
    // O modo vive na COLUNA, que é o que o editor troca; o schema pode ter
    // sido publicado antes da troca e ficaria desatualizado.
    schema = { ...schema, display_mode: displayMode }
  } catch (e) {
    // Coluna ausente (migration atrasada) não pode derrubar o formulário
    // que está no ar com verba em cima.
    log.warn("form.schema_indisponivel", { slug, message: (e as Error)?.message })
  }

  const acesso = acessoAoFormulario(
    schema?.settings,
    typeof submissions_count === "number" ? submissions_count : null,
  )

  return {
    form: { ...formRest, tracking, destino_qualificado: destinoQualificado } as FormularioPublico["form"],
    fields: (fields ?? []) as FormularioPublico["fields"],
    schema,
    display_mode: displayMode,
    acesso,
  }
}

/**
 * O formulário público pelo slug, do cache quando ele existe.
 *
 * `null` = não existe formulário publicado com esse slug. Erro do banco
 * PROPAGA (a página vira 500, a rota devolve o erro) — servir um 404
 * sobre uma falha de infra mandaria o anúncio para uma página "não
 * encontrado" enquanto o formulário existe.
 */
export function carregarFormularioPublico(slug: string): Promise<FormularioPublico | null> {
  return unstable_cache(() => lerFormularioPublico(slug), ["form-publico", slug], {
    tags: [TAG_TODOS, tagDoFormularioPublico(slug)],
    revalidate: REVALIDACAO_S,
  })()
}

/**
 * Conta a visita. Falhar NÃO pode derrubar o formulário: a métrica é
 * secundária, o formulário é o produto. Chamar de dentro de `after()`.
 */
export async function contarVisitaDoFormulario(formId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.rpc("increment_form_views", { p_form_id: formId })
    if (error) log.warn("form.view_nao_contada", { formId, code: error.code, message: error.message })
  } catch (e) {
    log.warn("form.view_nao_contada", { formId, message: (e as Error)?.message })
  }
}

/**
 * Invalida o payload cacheado de um ou mais slugs. Chamar de TODA rota que
 * muda o que o público vê: publicar, salvar (tema, logo, textos, modo,
 * settings), arquivar, e o slug antigo quando ele muda — senão a visita
 * seguinte continua lendo o formulário de antes por até `REVALIDACAO_S`.
 */
export function invalidarFormularioPublico(slugs: Array<string | null | undefined>): void {
  const vistos = new Set<string>()
  for (const s of slugs) {
    const slug = (s ?? "").trim()
    if (!slug || vistos.has(slug)) continue
    vistos.add(slug)
    try {
      revalidateTag(tagDoFormularioPublico(slug))
    } catch (e) {
      // Fora do runtime do Next (teste, script) não há cache a invalidar.
      log.warn("form.cache_nao_invalidado", { slug, message: (e as Error)?.message })
    }
  }
}
