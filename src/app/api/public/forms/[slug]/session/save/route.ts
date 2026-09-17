/**
 * POST /api/public/forms/[slug]/session/save — autosave do preenchimento.
 *
 * É POST, e não PATCH, por um motivo concreto: o save mais importante é
 * o ÚLTIMO, o que sai quando a aba fecha — e `navigator.sendBeacon`, a
 * única forma de enviá-lo com o browser fechando, só faz POST. Um PATCH
 * bonito perderia exatamente o dado do abandono, que é o produto.
 *
 * Idempotente por construção: respostas são mescladas, status só avança
 * e eventos deduplicam por `event_key`. O beacon pode chegar depois de
 * um `fetch` normal, duplicado, ou nunca.
 *
 * Nunca responde erro por sessão desconhecida ou token vencido — 200 com
 * `saved: false`. Quem chama é uma aba fechando; não há ninguém para ler
 * um 4xx, e o `sendBeacon` nem expõe a resposta. Erro aqui só serve para
 * poluir o monitor.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { checkRateLimit } from "@/lib/rate-limit"
import { verificarTokenSessao } from "@/lib/forms/session-token"
import { origemPermitida } from "@/lib/forms/origem"
import {
  carregarSessao,
  salvarSessao,
  type EventoDaSessao,
  type StatusSessao,
} from "@/lib/services/form-session.service"
import { normalizarSchema, schemaDeCampos, type CampoLegado } from "@/lib/forms/schema"

const log = logger.child("FormSessionSave")

export const dynamic = "force-dynamic"

const eventoSchema = z.object({
  type: z.string().max(60),
  field_ref: z.string().max(100).nullable().optional(),
  step_index: z.number().int().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  client_ts: z.string().max(40).nullable().optional(),
  event_key: z.string().max(120).nullable().optional(),
})

const entradaSchema = z.object({
  session_id: z.string().uuid(),
  token: z.string().max(300),
  answers: z.record(z.string(), z.unknown()).optional(),
  variables: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  current_field_ref: z.string().max(100).nullable().optional(),
  status: z
    .enum(["viewed", "started", "in_progress", "contact_captured", "abandoned", "completed", "disqualified"])
    .optional(),
  time_on_last_step_ms: z.number().int().min(0).max(86_400_000).nullable().optional(),
  ending_ref: z.string().max(100).nullable().optional(),
  consent: z.object({ at: z.string(), version: z.string().max(60) }).nullable().optional(),
  events: z.array(eventoSchema).max(200).default([]),
})

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params

    // Teto alto: o autosave é frequente por desenho (uma resposta = um
    // save). 240/min cobre alguém respondendo rápido com folga e ainda
    // barra script.
    const limite = await checkRateLimit(request, `form-session-save:${slug}`, {
      limit: 240,
      windowSeconds: 60,
    })
    if (limite) return limite

    // `sendBeacon` manda text/plain; `fetch` manda JSON. Os dois caem aqui.
    const cru = await request.text()
    const body = cru ? JSON.parse(cru) : {}
    const entrada = entradaSchema.parse(body)

    const token = verificarTokenSessao(entrada.token)
    if (!token.valido || token.sessionId !== entrada.session_id) {
      log.warn("save.token_recusado", { slug, motivo: token.motivo })
      return successResponse(request, { saved: false, reason: "token" })
    }

    const admin = createAdminClient()
    const sessao = await carregarSessao(admin, entrada.session_id)
    if (!sessao) return successResponse(request, { saved: false, reason: "sessao" })

    const { data: form } = await admin
      .from("crm_forms")
      .select("id, slug, settings, published_version_id, display_mode")
      .eq("id", sessao.form_id)
      .maybeSingle()

    // A sessão tem de ser DESTE formulário: sem isto, um token válido de
    // um formulário aberto escreveria na sessão de outro.
    if (!form || form.slug !== slug) {
      return successResponse(request, { saved: false, reason: "formulario" })
    }

    const permitidos = (form.settings as { allowed_domains?: string[] } | null)?.allowed_domains
    const veredicto = origemPermitida(
      request.headers.get("origin"),
      request.headers.get("referer"),
      permitidos,
    )
    if (!veredicto.permitida) {
      log.warn("save.origem_recusada", { slug, host: veredicto.host, motivo: veredicto.motivo })
      return successResponse(request, { saved: false, reason: "origem" })
    }

    const schema = await carregarSchema(admin, form)

    const r = await salvarSessao(
      admin,
      sessao,
      {
        answers: entrada.answers as Record<string, never> | undefined,
        variables: entrada.variables,
        current_field_ref: entrada.current_field_ref,
        status: entrada.status as StatusSessao | undefined,
        time_on_last_step_ms: entrada.time_on_last_step_ms,
        ending_ref: entrada.ending_ref,
        consent: entrada.consent ?? null,
      },
      schema,
      entrada.events as EventoDaSessao[],
    )

    return successResponse(request, { saved: r.ok, status: r.status })
  } catch (error) {
    // Corpo malformado do beacon não vira 500 no monitor.
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      log.warn("save.corpo_invalido", { message: (error as Error).message })
      return successResponse(request, { saved: false, reason: "corpo" })
    }
    return errorResponse(request, error, "form-session-save")
  }
}

async function carregarSchema(
  admin: ReturnType<typeof createAdminClient>,
  form: { id: string; published_version_id: string | null; display_mode: string | null },
) {
  if (form.published_version_id) {
    const { data } = await admin
      .from("form_versions")
      .select("schema")
      .eq("id", form.published_version_id)
      .maybeSingle()
    if (data?.schema) return normalizarSchema(data.schema)
  }
  const { data: campos } = await admin
    .from("crm_form_fields")
    .select("id, field_type, label, placeholder, description, required, position, options, validation, map_to_lead_field")
    .eq("form_id", form.id)
    .order("position", { ascending: true })
  return schemaDeCampos((campos ?? []) as CampoLegado[], {
    display_mode: form.display_mode === "conversational" ? "conversational" : "classic",
  })
}
