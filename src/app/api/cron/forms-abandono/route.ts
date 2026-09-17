/**
 * Vercel Cron — abandono de formulário vira lead no CRM.
 *
 * A fila é o índice parcial `idx_form_sessions_abandono`
 * (`abandon_processed_at IS NULL AND completed_at IS NULL`), com
 * predicado LITERAL: índice parcial não serve query parametrizada, e sem
 * ele isto vira varredura da tabela a cada minuto.
 *
 * A janela de inatividade é por FORMULÁRIO, então o corte não pode ir no
 * SQL de uma vez — a rota traz as candidatas mais antigas que a menor
 * janela possível e o módulo puro decide uma a uma.
 *
 * Roda a cada 5 minutos. Mais frequente não melhora: a janela padrão é
 * de 20 minutos e a diferença entre avisar em 20 e em 25 não muda a
 * ligação; menos frequente esfria o lead.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"
import { ehAbandono, JANELA_MIN_MINUTOS, janelaDeAbandonoMs } from "@/lib/forms/abandono"
import { normalizarSchema, schemaDeCampos, type CampoLegado } from "@/lib/forms/schema"
import { processarAbandono, type FormParaAbandono } from "@/lib/services/form-abandono.service"
import type { LinhaSessao } from "@/lib/services/form-session.service"
import type { FormSchema } from "@/types/forms-conversational"

const log = logger.child("CronFormsAbandono")

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Teto de sessões por rodada. O trabalho por sessão é várias escritas. */
const LOTE = 100
/** Orçamento: para no relógio, não na contagem. */
const ORCAMENTO_MS = 240_000

export async function GET(request: NextRequest) {
  const naoAutorizado = requireCronAuth(request)
  if (naoAutorizado) return naoAutorizado

  const inicio = Date.now()
  const admin = createAdminClient()

  try {
    // Corte largo: a menor janela que qualquer formulário pode ter. O
    // corte fino é por formulário, no módulo puro.
    const corte = new Date(Date.now() - JANELA_MIN_MINUTOS * 60_000).toISOString()

    const { data: sessoes, error } = await admin
      .from("form_sessions")
      .select(
        "id, org_id, form_id, status, answers, variables, hidden, current_field_ref, " +
          "furthest_step_index, completed_at, contact_captured_at, lead_id, last_activity_at, " +
          "utm_source, utm_medium, utm_campaign, abandon_processed_at",
      )
      .is("abandon_processed_at", null)
      .is("completed_at", null)
      .lt("last_activity_at", corte)
      .order("last_activity_at", { ascending: true })
      .limit(LOTE)

    if (error) {
      // Tabela ausente (migration atrasada) é aviso, não 500 no monitor.
      log.warn("abandono.fila_indisponivel", { code: error.code, message: error.message })
      return NextResponse.json({ ok: true, skipped: "schema", code: error.code })
    }

    const lista = (sessoes ?? []) as unknown as Array<LinhaSessao & Record<string, unknown>>
    if (lista.length === 0) return NextResponse.json({ ok: true, candidatas: 0 })

    // Os formulários das candidatas, de uma vez: uma consulta por sessão
    // seria N+1 num caminho que roda de 5 em 5 minutos.
    const formIds = [...new Set(lista.map((s) => s.form_id))]
    const { data: forms } = await admin
      .from("crm_forms")
      .select("id, org_id, name, slug, pipeline_id, stage_id, settings, created_by, published_version_id, display_mode")
      .in("id", formIds)

    const porForm = new Map<string, Record<string, unknown>>()
    for (const f of (forms ?? []) as unknown as Array<Record<string, unknown>>) {
      porForm.set(f.id as string, f)
    }

    const schemas = new Map<string, FormSchema>()
    const contagem = { processadas: 0, leads: 0, negocios: 0, so_visita: 0, sem_contato: 0, pulou: 0 }
    const baseUrl = urlBase(request)

    for (const sessao of lista) {
      if (Date.now() - inicio > ORCAMENTO_MS) break

      const form = porForm.get(sessao.form_id)
      if (!form) {
        contagem.pulou += 1
        continue
      }

      const janela = janelaDeAbandonoMs(form.settings)
      const ehDeVerdade = ehAbandono(
        {
          status: sessao.status,
          answers: sessao.answers ?? {},
          last_activity_at: String(sessao.last_activity_at ?? ""),
          completed_at: sessao.completed_at,
          abandon_processed_at: (sessao.abandon_processed_at as string | null) ?? null,
        },
        Date.now(),
        janela,
      )
      if (!ehDeVerdade) {
        contagem.pulou += 1
        continue
      }

      let schema = schemas.get(form.id as string)
      if (!schema) {
        schema = await carregarSchema(admin, form)
        schemas.set(form.id as string, schema)
      }

      const r = await processarAbandono(
        admin,
        sessao as LinhaSessao & { last_activity_at?: string; current_field_ref: string | null },
        form as unknown as FormParaAbandono,
        schema,
        baseUrl,
      )
      contagem.processadas += 1
      if (r.leadId) contagem.leads += 1
      if (r.dealId) contagem.negocios += 1
      if (r.classe === "so_visita") contagem.so_visita += 1
      if (r.classe === "sem_contato") contagem.sem_contato += 1
    }

    log.info("abandono.rodada", { ...contagem, candidatas: lista.length, ms: Date.now() - inicio })
    return NextResponse.json({ ok: true, candidatas: lista.length, ...contagem })
  } catch (e) {
    log.error("abandono.erro", { message: (e as Error)?.message })
    return NextResponse.json({ ok: false, error: (e as Error)?.message }, { status: 500 })
  }
}

async function carregarSchema(
  admin: ReturnType<typeof createAdminClient>,
  form: Record<string, unknown>,
): Promise<FormSchema> {
  const versionId = form.published_version_id as string | null
  if (versionId) {
    const { data } = await admin.from("form_versions").select("schema").eq("id", versionId).maybeSingle()
    if (data?.schema) return normalizarSchema(data.schema)
  }
  const { data: campos } = await admin
    .from("crm_form_fields")
    .select("id, field_type, label, placeholder, description, required, position, options, validation, map_to_lead_field")
    .eq("form_id", form.id as string)
    .order("position", { ascending: true })
  return schemaDeCampos((campos ?? []) as CampoLegado[], {
    display_mode: form.display_mode === "conversational" ? "conversational" : "classic",
  })
}

/**
 * A base do link de retomada.
 *
 * `NEXT_PUBLIC_APP_URL` primeiro, porque o link vai para a timeline e é
 * clicado dias depois: o host do request pode ser o domínio interno da
 * Vercel, que ninguém consegue abrir.
 */
function urlBase(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (env) return env
  const proto = request.headers.get("x-forwarded-proto") ?? "https"
  const host = request.headers.get("host") ?? "localhost:3000"
  return `${proto}://${host}`
}
