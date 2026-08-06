/**
 * GET  /api/crm/forms/[id]/conversion-events — diagnóstico do envio de
 *      eventos de conversão (Meta) deste formulário.
 * POST /api/crm/forms/[id]/conversion-events — reprocessa as falhas.
 *
 * Existe porque o recurso falhava de forma invisível: a fila registrava
 * `failed` com o erro da Meta, ou o "Lead qualificado" nunca disparava
 * porque a condição não batia, e nada disso aparecia em lugar nenhum do
 * admin. Quem configura o formulário só descobria olhando o Gerenciador
 * de Eventos da Meta e vendo que faltava evento.
 *
 * O GET devolve três coisas:
 *   1. contagem por status (enviado / na fila / falhou) e por evento;
 *   2. os últimos eventos com o erro real da Meta;
 *   3. o teste das condições do lead qualificado contra as submissões
 *      recentes — dizendo, submissão a submissão, por que não qualificou.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { normalizeTrackingConfig } from "@/types/form-tracking"
import { diagnoseQualified } from "@/lib/services/conversion-dispatch.service"

const log = logger.child("FormConversionEvents")

export const dynamic = "force-dynamic"
export const maxDuration = 60

type EventRow = {
  id: string
  event_name: string
  status: string
  attempts: number
  last_error: string | null
  created_at: string
  sent_at: string | null
  submission_id: string | null
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: formId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const { data: form } = await admin
      .from("crm_forms")
      .select("id, org_id, name, facebook_pixel_id, meta_capi_token, meta_test_event_code, tracking_config")
      .eq("id", formId)
      .maybeSingle<{
        id: string
        org_id: string
        name: string
        facebook_pixel_id: string | null
        meta_capi_token: string | null
        meta_test_event_code: string | null
        tracking_config: unknown
      }>()

    if (!form || form.org_id !== orgId) {
      throw new AppError("Formulário não encontrado", 404, "not-found")
    }

    const cfg = normalizeTrackingConfig(form.tracking_config)

    // ── Estado da configuração (o que impede o envio antes de tudo) ──
    const setup = {
      meta_enabled: cfg.meta.enabled,
      has_pixel: Boolean(form.facebook_pixel_id),
      has_token: Boolean(form.meta_capi_token),
      browser_pixel: cfg.meta.browser_pixel,
      test_event_code: form.meta_test_event_code,
      qualified_enabled: cfg.qualified_lead.enabled,
      qualified_event_name: cfg.qualified_lead.event_name,
      qualified_rules: cfg.qualified_lead.rules.length,
      qualified_logic: cfg.qualified_lead.logic,
    }

    const blockers: string[] = []
    if (!cfg.meta.enabled) blockers.push("A integração com a Meta está desligada neste formulário.")
    if (!form.facebook_pixel_id) blockers.push("Falta o ID do pixel.")
    if (!form.meta_capi_token) {
      blockers.push("Falta o token da Conversions API — sem ele nenhum evento sai do servidor.")
    }
    if (cfg.meta.enabled && !cfg.qualified_lead.enabled) {
      blockers.push('O evento de lead qualificado está desligado — só o evento "Lead" é enviado.')
    } else if (cfg.qualified_lead.enabled && cfg.qualified_lead.rules.length === 0) {
      blockers.push(
        "O lead qualificado está ligado, mas sem nenhuma condição — nenhum lead será marcado como qualificado.",
      )
    }

    // ── Fila: contagens e últimos eventos ────────────────────────────
    const { data: events } = await admin
      .from("crm_conversion_events")
      .select("id, event_name, status, attempts, last_error, created_at, sent_at, submission_id")
      .eq("form_id", formId)
      .eq("platform", "meta")
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<EventRow[]>()

    const rows = events ?? []
    const byStatus: Record<string, number> = {}
    const byEvent: Record<string, { sent: number; failed: number; queued: number }> = {}
    for (const e of rows) {
      byStatus[e.status] = (byStatus[e.status] ?? 0) + 1
      const bucket = (byEvent[e.event_name] ??= { sent: 0, failed: 0, queued: 0 })
      if (e.status === "sent") bucket.sent++
      else if (e.status === "failed") bucket.failed++
      else bucket.queued++
    }

    // ── Teste das condições contra as submissões recentes ────────────
    // Responde a pergunta que a tela não respondia: "por que nenhum lead
    // qualifica?". Roda a MESMA função do envio, sem mandar nada.
    const { data: fields } = await admin
      .from("crm_form_fields")
      .select("id, label")
      .eq("form_id", formId)
      .returns<Array<{ id: string; label: string | null }>>()

    const { data: subs } = await admin
      .from("crm_form_submissions")
      .select("id, created_at, answers")
      .eq("form_id", formId)
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<Array<{ id: string; created_at: string; answers: Record<string, unknown> | null }>>()

    const submissionTests = (subs ?? []).map((s) => {
      const d = diagnoseQualified(cfg.qualified_lead, s.answers ?? {}, fields ?? undefined)
      return {
        submission_id: s.id,
        created_at: s.created_at,
        qualified: d.qualified,
        reason: d.reason,
        rules: d.rules,
      }
    })

    const wouldQualify = submissionTests.filter((t) => t.qualified).length

    return successResponse(request, {
      setup,
      blockers,
      totals: {
        events: rows.length,
        sent: byStatus.sent ?? 0,
        failed: byStatus.failed ?? 0,
        queued: (byStatus.pending ?? 0) + (byStatus.processing ?? 0),
      },
      by_event: byEvent,
      recent_events: rows.slice(0, 25),
      qualified_test: {
        submissions_checked: submissionTests.length,
        would_qualify: wouldQualify,
        results: submissionTests,
      },
    })
  } catch (error) {
    log.error("conversion events GET error:", error)
    return errorResponse(request, error, "form-conversion-events")
  }
}

/** Reenfileira as falhas deste formulário (zera as tentativas). */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: formId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const { data: form } = await admin
      .from("crm_forms")
      .select("id, org_id")
      .eq("id", formId)
      .maybeSingle<{ id: string; org_id: string }>()
    if (!form || form.org_id !== orgId) {
      throw new AppError("Formulário não encontrado", 404, "not-found")
    }

    const { data: reset, error } = await admin
      .from("crm_conversion_events")
      .update({ status: "pending", attempts: 0, last_error: null })
      .eq("form_id", formId)
      .eq("platform", "meta")
      .in("status", ["failed", "processing"])
      .select("id")
    if (error) throw error

    log.info("conversion events requeued", { formId, count: reset?.length ?? 0, by: user.id })
    return successResponse(request, {
      requeued: reset?.length ?? 0,
      note: "O envio acontece em até um minuto, pelo processamento automático.",
    })
  } catch (error) {
    log.error("conversion events POST error:", error)
    return errorResponse(request, error, "form-conversion-events-retry")
  }
}
