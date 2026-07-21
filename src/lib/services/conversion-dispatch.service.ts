/**
 * Conversion Dispatch (fila + cron) — eventos de conversao server-side.
 *
 * Quando um lead se cadastra num formulario publico, enfileiramos os
 * eventos da Meta Conversions API (evento "Lead" + o custom "Lead
 * qualificado", este so quando as regras batem) em `crm_conversion_events`
 * e tentamos enviar INLINE (best-effort). O que falhar fica pending/failed
 * e o cron `/api/cron/conversion-dispatch` reprocessa com retry.
 *
 * Idempotencia dupla:
 *   - UNIQUE(submission_id, platform, event_name) no banco.
 *   - `event_id` deduplica no lado do Meta (mesmo id de browser+server e
 *     de reenvios do cron) — reenvio e inofensivo.
 *
 * Concorrencia: claim otimista por `updated_at` (o trigger bumpa updated_at
 * a cada UPDATE) — dois workers nao processam a mesma linha no mesmo tick.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { decrypt } from "@/lib/crypto"
import {
  buildMetaServerEvent,
  buildMetaUserData,
  sendMetaConversionEvent,
  type MetaServerEvent,
} from "@/lib/integrations/meta-capi"
import type { QualifiedLeadConfig, QualifiedRule } from "@/types/form-tracking"

const log = logger.child("ConversionDispatch")

/** Tentativas maximas antes de desistir de uma linha. */
const MAX_ATTEMPTS = Number(process.env.CONVERSION_MAX_ATTEMPTS ?? 5)

/** id do evento qualificado derivado do id base (browser espelha isto). */
export function qualifiedEventId(baseEventId: string): string {
  return `${baseEventId}-q`
}

// ── Avaliacao das regras do "Lead qualificado" ───────────────────

function rawToStrings(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.map((v) => String(v))
  const s = String(raw)
  return s === "" ? [] : [s]
}

function ruleValues(value: QualifiedRule["value"]): string[] {
  if (value == null) return []
  if (Array.isArray(value)) return value.map((v) => String(v))
  const s = String(value)
  return s === "" ? [] : [s]
}

/** Campo mínimo p/ resolver a regra por label quando o id não bate. */
export interface QualifiedField {
  id: string
  label?: string | null
}

/**
 * Resolve o valor da resposta para uma regra: tenta o `field_id`; se o id
 * não existe nas answers (ex.: ids regenerados no editor), faz fallback pelo
 * `field_label` — acha o campo atual com esse label e usa o id dele.
 */
function resolveAnswer(
  rule: QualifiedRule,
  answers: Record<string, unknown>,
  fields?: QualifiedField[],
): unknown {
  if (rule.field_id && Object.prototype.hasOwnProperty.call(answers, rule.field_id)) {
    return answers[rule.field_id]
  }
  if (rule.field_label && fields) {
    const f = fields.find((x) => (x.label ?? "") === rule.field_label)
    if (f) return answers[f.id]
  }
  return answers[rule.field_id]
}

function evaluateRule(
  rule: QualifiedRule,
  answers: Record<string, unknown>,
  fields?: QualifiedField[],
): boolean {
  const rawStrings = rawToStrings(resolveAnswer(rule, answers, fields))
  const vals = ruleValues(rule.value)
  const first = vals[0]

  switch (rule.operator) {
    case "is_set":
      return rawStrings.length > 0
    case "equals":
      return rawStrings.length > 0 && rawStrings.every((s) => s === first)
    case "not_equals":
      return !(rawStrings.length > 0 && rawStrings.every((s) => s === first))
    case "in":
      return rawStrings.some((s) => vals.includes(s))
    case "not_in":
      return !rawStrings.some((s) => vals.includes(s))
    case "contains":
      return (
        first !== undefined &&
        rawStrings.some((s) => s.toLowerCase().includes(first.toLowerCase()))
      )
    case "gt":
      return Number(rawStrings[0]) > Number(first)
    case "gte":
      return Number(rawStrings[0]) >= Number(first)
    case "lt":
      return Number(rawStrings[0]) < Number(first)
    case "lte":
      return Number(rawStrings[0]) <= Number(first)
    default:
      return false
  }
}

/**
 * Avalia se o lead e "qualificado" com base nas regras da config e nas
 * respostas do form (indexadas por field_id). Sem regras → nao qualifica
 * (evita marcar todo mundo). Fonte da verdade — o browser so espelha.
 */
export function evaluateQualified(
  config: QualifiedLeadConfig | undefined,
  answers: Record<string, unknown>,
  fields?: QualifiedField[],
): boolean {
  if (!config?.enabled) return false
  const rules = config.rules ?? []
  if (rules.length === 0) return false
  const results = rules.map((r) => evaluateRule(r, answers, fields))
  return config.logic === "or" ? results.some(Boolean) : results.every(Boolean)
}

// ── Enqueue + envio ──────────────────────────────────────────────

interface FormMetaConfig {
  pixelId: string
  accessToken: string
  testEventCode: string | null
}

interface ConversionRow {
  id: string
  form_id: string | null
  updated_at: string
  attempts: number
  payload: unknown
}

export interface EnqueueConversionParams {
  orgId: string
  formId: string
  submissionId: string | null
  leadId: string | null
  /** id base do evento Lead (gerado no submit; espelhado pelo browser). */
  eventId: string
  qualified: boolean
  qualifiedEventName: string
  eventSourceUrl?: string | null
  meta: {
    pixelId: string
    /** Token cifrado (enc:v1:) — descriptografado aqui. */
    capiTokenEnc: string
    testEventCode?: string | null
  }
  lead: {
    email?: string | null
    phone?: string | null
    firstName?: string | null
    lastName?: string | null
  }
  /** Parametros extras do lead (company, faturamento, UTMs) p/ custom_data. */
  customData?: Record<string, unknown>
  request: {
    ip?: string | null
    userAgent?: string | null
    fbc?: string | null
    fbp?: string | null
  }
}

/**
 * Enfileira os eventos Meta (Lead + qualificado) e tenta enviar inline.
 * Fire-and-forget: nunca lanca (log em caso de erro). Chamado pelo submit.
 */
export async function enqueueConversionEvents(
  params: EnqueueConversionParams,
): Promise<void> {
  try {
    if (!params.meta.pixelId || !params.meta.capiTokenEnc) return
    const admin = createAdminClient()

    const userData = buildMetaUserData({
      email: params.lead.email,
      phone: params.lead.phone,
      firstName: params.lead.firstName,
      lastName: params.lead.lastName,
      externalId: params.leadId,
      clientIpAddress: params.request.ip,
      clientUserAgent: params.request.userAgent,
      fbc: params.request.fbc,
      fbp: params.request.fbp,
    })

    const eventTime = Math.floor(Date.now() / 1000)
    const customData = params.customData

    const events: Array<{ event_name: string; event_id: string; payload: MetaServerEvent }> = [
      {
        event_name: "Lead",
        event_id: params.eventId,
        payload: buildMetaServerEvent({
          eventName: "Lead",
          eventId: params.eventId,
          eventSourceUrl: params.eventSourceUrl,
          eventTime,
          userData,
          customData,
        }),
      },
    ]

    if (params.qualified) {
      const qid = qualifiedEventId(params.eventId)
      events.push({
        event_name: params.qualifiedEventName,
        event_id: qid,
        payload: buildMetaServerEvent({
          eventName: params.qualifiedEventName,
          eventId: qid,
          eventSourceUrl: params.eventSourceUrl,
          eventTime,
          userData,
          customData,
        }),
      })
    }

    const rows = events.map((e) => ({
      org_id: params.orgId,
      form_id: params.formId,
      submission_id: params.submissionId,
      lead_id: params.leadId,
      platform: "meta" as const,
      event_name: e.event_name,
      event_id: e.event_id,
      payload: e.payload,
      status: "pending" as const,
      attempts: 0,
    }))

    const { data: inserted, error } = await admin
      .from("crm_conversion_events")
      .insert(rows)
      .select("id, form_id, updated_at, attempts, payload")

    if (error) {
      // Conflito de UNIQUE (reenvio do submit) nao e erro fatal.
      log.warn("enqueue.insert_failed", { formId: params.formId, error: error.message })
      return
    }

    let accessToken: string
    try {
      accessToken = decrypt(params.meta.capiTokenEnc)
    } catch {
      log.error("enqueue.decrypt_token_failed", { formId: params.formId })
      return
    }

    const formConfig: FormMetaConfig = {
      pixelId: params.meta.pixelId,
      accessToken,
      testEventCode: params.meta.testEventCode ?? null,
    }

    // A INSERT acima ja garante durabilidade (o cron entrega o que faltar).
    // O envio inline e best-effort e NAO e aguardado: em serverless o
    // handler pode congelar apos a resposta, entao nao seguramos a request
    // esperando o HTTP do Meta — quem garante a entrega e o cron.
    void Promise.allSettled(
      (inserted ?? []).map((row) => sendConversionRow(admin, row as ConversionRow, formConfig)),
    )
  } catch (err) {
    log.error("enqueue.unexpected", {
      formId: params.formId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function extractError(body: Record<string, unknown>): string {
  const err = body?.error
  if (err && typeof err === "object") {
    const m = (err as Record<string, unknown>).message
    if (typeof m === "string") return m.slice(0, 500)
  }
  return JSON.stringify(body ?? {}).slice(0, 500)
}

/**
 * Reivindica (claim otimista por updated_at) e envia UMA linha.
 * Retorna true se o Meta confirmou o evento.
 */
async function sendConversionRow(
  admin: SupabaseClient,
  row: ConversionRow,
  cfg: FormMetaConfig,
): Promise<boolean> {
  // Claim: bumpa attempts com lease em updated_at. Se outro worker ja
  // tocou a linha, o WHERE nao casa e desistimos (evita envio duplo).
  const { data: claimed } = await admin
    .from("crm_conversion_events")
    .update({ attempts: (row.attempts ?? 0) + 1 })
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .select("id")
    .maybeSingle()

  if (!claimed) return false

  const result = await sendMetaConversionEvent({
    pixelId: cfg.pixelId,
    accessToken: cfg.accessToken,
    testEventCode: cfg.testEventCode,
    event: row.payload as MetaServerEvent,
  })

  const received = Number((result.body?.events_received as number | undefined) ?? 0)
  const success = result.ok && received >= 1

  await admin
    .from("crm_conversion_events")
    .update({
      status: success ? "sent" : "failed",
      last_error: success ? null : extractError(result.body),
      response: result.body,
      sent_at: success ? new Date().toISOString() : null,
    })
    .eq("id", row.id)

  return success
}

// ── Cron worker ──────────────────────────────────────────────────

export interface ProcessResult {
  processed: number
  sent: number
  failed: number
}

/**
 * Processa linhas pendentes/falhas da fila (chamado pelo cron). Reenvio e
 * seguro (dedup por event_id no Meta). Rows sem pixel/token configurado
 * sao marcadas failed e param de ser reprocessadas.
 */
export async function processPendingConversionEvents(
  limit = 100,
): Promise<ProcessResult> {
  const admin = createAdminClient()

  const { data: candidates, error } = await admin
    .from("crm_conversion_events")
    .select("id, form_id, updated_at, attempts, payload")
    .eq("platform", "meta")
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(limit)

  if (error) {
    log.error("cron.select_failed", { error: error.message })
    return { processed: 0, sent: 0, failed: 0 }
  }
  if (!candidates || candidates.length === 0) {
    return { processed: 0, sent: 0, failed: 0 }
  }

  // Carrega a config de cada form uma vez (pixel + token descriptografado).
  const formIds = [...new Set(candidates.map((c) => c.form_id).filter(Boolean))] as string[]
  const configs = new Map<string, FormMetaConfig | null>()
  for (const fid of formIds) {
    const { data: form } = await admin
      .from("crm_forms")
      .select("facebook_pixel_id, meta_capi_token, meta_test_event_code")
      .eq("id", fid)
      .maybeSingle()
    if (form?.facebook_pixel_id && form.meta_capi_token) {
      try {
        configs.set(fid, {
          pixelId: form.facebook_pixel_id,
          accessToken: decrypt(form.meta_capi_token),
          testEventCode: form.meta_test_event_code ?? null,
        })
      } catch {
        configs.set(fid, null)
      }
    } else {
      configs.set(fid, null)
    }
  }

  let sent = 0
  let failed = 0
  for (const row of candidates) {
    const cfg = row.form_id ? configs.get(row.form_id) : null
    if (!cfg) {
      // Sem config → nao adianta reprocessar. Encerra a linha.
      await admin
        .from("crm_conversion_events")
        .update({
          status: "failed",
          last_error: "form sem pixel/token da CAPI configurado",
          attempts: MAX_ATTEMPTS,
        })
        .eq("id", row.id)
        .eq("updated_at", row.updated_at)
      failed++
      continue
    }
    const ok = await sendConversionRow(admin, row as ConversionRow, cfg)
    if (ok) sent++
    else failed++
  }

  log.info("cron.processed", { processed: candidates.length, sent, failed })
  return { processed: candidates.length, sent, failed }
}
