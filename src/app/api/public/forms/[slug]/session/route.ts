/**
 * POST /api/public/forms/[slug]/session — abre a sessão.
 *
 * Chamada uma vez, quando o formulário carrega. Devolve o id e um token
 * de escrita ASSINADO: o id sozinho não autoriza nada, senão bastaria
 * conhecê-lo (ele aparece na aba de rede) para reescrever as respostas
 * de outra pessoa.
 *
 * Anônima por natureza — é o público respondendo. A autorização é o
 * token na escrita seguinte mais a guarda de origem.
 *
 * Nunca derruba o formulário: se a sessão não puder ser criada, a
 * resposta é 200 com `session_id: null` e a página renderiza igual. A
 * sessão é telemetria e captura de abandono; o formulário é o produto.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { AppError, errorResponse, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { checkRateLimit } from "@/lib/rate-limit"
import { assinarTokenSessao } from "@/lib/forms/session-token"
import { origemPermitida } from "@/lib/forms/origem"
import { iniciarSessao, type ContextoDaVisita } from "@/lib/services/form-session.service"
import { normalizarSchema, schemaDeCampos, type CampoLegado } from "@/lib/forms/schema"
import { blocosVisiveis } from "@/lib/forms/engine"

const log = logger.child("FormSessionStart")

export const dynamic = "force-dynamic"

const texto = z.string().max(500).nullable().optional()

const schemaEntrada = z.object({
  visitor_id: z.string().max(100).nullable().optional(),
  utm_source: texto,
  utm_medium: texto,
  utm_campaign: texto,
  utm_term: texto,
  utm_content: texto,
  gclid: texto,
  fbclid: texto,
  fbp: texto,
  fbc: texto,
  referrer: z.string().max(2000).nullable().optional(),
  landing_url: z.string().max(2000).nullable().optional(),
  device: texto,
  browser: texto,
  os: texto,
  ab_variant: texto,
  /** Valores de campos ocultos, vindos da URL da página. */
  hidden: z.record(z.string(), z.string().max(1000)).default({}),
})

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params

    // 60/min por IP: um visitante abre a página poucas vezes; o teto é
    // contra quem tenta encher a tabela, não contra quem responde.
    const limite = await checkRateLimit(request, `form-session:${slug}`, {
      limit: 60,
      windowSeconds: 60,
    })
    if (limite) return limite

    const admin = createAdminClient()
    const body = await request.json().catch(() => ({}))
    const entrada = schemaEntrada.parse(body)

    const { data: form } = await admin
      .from("crm_forms")
      .select("id, org_id, settings, published_version_id, display_mode")
      .eq("slug", slug)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    // Formulário inexistente não ganha sessão — e a resposta é a mesma
    // do caso "não deu para criar", para não virar sonda de slug.
    if (!form) return successResponse(request, { session_id: null, token: null })

    const permitidos = (form.settings as { allowed_domains?: string[] } | null)?.allowed_domains
    const veredicto = origemPermitida(
      request.headers.get("origin"),
      request.headers.get("referer"),
      permitidos,
    )
    if (!veredicto.permitida) {
      log.warn("sessao.origem_recusada", { slug, host: veredicto.host, motivo: veredicto.motivo })
      throw new AppError("Origem não autorizada para este formulário", 403, "ORIGIN_NOT_ALLOWED")
    }

    const { schema, versionId } = await carregarSchema(admin, form)
    const total = blocosVisiveis(schema).length || null

    const contexto: ContextoDaVisita = {
      visitor_id: entrada.visitor_id ?? null,
      utm_source: entrada.utm_source ?? null,
      utm_medium: entrada.utm_medium ?? null,
      utm_campaign: entrada.utm_campaign ?? null,
      utm_term: entrada.utm_term ?? null,
      utm_content: entrada.utm_content ?? null,
      gclid: entrada.gclid ?? null,
      fbclid: entrada.fbclid ?? null,
      fbp: entrada.fbp ?? null,
      fbc: entrada.fbc ?? null,
      referrer: entrada.referrer ?? null,
      landing_url: entrada.landing_url ?? null,
      device: entrada.device ?? null,
      browser: entrada.browser ?? null,
      os: entrada.os ?? null,
      // O país vem do edge da Vercel; não é o browser que o informa
      // (ele mentiria). Ausente em dev, e isso é honesto.
      country: request.headers.get("x-vercel-ip-country"),
      ab_variant: entrada.ab_variant ?? null,
    }

    const sessao = await iniciarSessao(admin, {
      orgId: form.org_id,
      formId: form.id,
      formVersionId: versionId,
      totalEstimado: total,
      contexto,
      hidden: entrada.hidden,
    })

    if (!sessao) return successResponse(request, { session_id: null, token: null })

    return successResponse(request, {
      session_id: sessao.id,
      token: assinarTokenSessao(sessao.id),
    })
  } catch (error) {
    return errorResponse(request, error, "form-session-start")
  }
}

/** A versão publicada; sem ela, o schema derivado dos campos de hoje. */
async function carregarSchema(
  admin: ReturnType<typeof createAdminClient>,
  form: { id: string; published_version_id: string | null; display_mode: string | null },
) {
  if (form.published_version_id) {
    const { data } = await admin
      .from("form_versions")
      .select("id, schema")
      .eq("id", form.published_version_id)
      .maybeSingle()
    if (data?.schema) return { schema: normalizarSchema(data.schema), versionId: data.id as string }
  }
  const { data: campos } = await admin
    .from("crm_form_fields")
    .select("id, field_type, label, placeholder, description, required, position, options, validation, map_to_lead_field")
    .eq("form_id", form.id)
    .order("position", { ascending: true })
  return {
    schema: schemaDeCampos((campos ?? []) as CampoLegado[], {
      display_mode: form.display_mode === "conversational" ? "conversational" : "classic",
    }),
    versionId: null,
  }
}
