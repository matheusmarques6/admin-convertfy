/**
 * Email Generation Trigger Service (Epic AE - Story AE-2)
 *
 * Lógica core do gatilho híbrido:
 *   - `startOnboarding`: dispara batch de geração de emails para uma loja
 *     (chamado pelo endpoint POST /api/admin/stores/[id]/start-onboarding
 *     e pelo signal consumer).
 *   - `consumeQueueSignal`: pega 1 sinal pendente de
 *     `email_generation_queue_signals`, marca como processing, chama
 *     startOnboarding(mode='fresh', triggered_by='signal_consumer') e
 *     atualiza o sinal para done | failed (com retry até 3x).
 *
 * Suporta 3 modes:
 *   - `fresh`  : valida que nao ha batch em andamento (409 se houver)
 *   - `resume` : idempotente; se ja ha batch, retorna o batch_id existente
 *                sem disparar n8n. Permite continuar sem briefing confirmado.
 *   - `redo`   : marca emails ativos como failed (motivo `superseded_by_redo`)
 *                e prossegue para criar novo batch.
 *
 * Refs:
 *   - docs/stories/AE-2.trigger-hibrido-start-onboarding.md
 *   - docs/architecture/adr-agent-email-generation.md
 */

import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { ConflictError, ValidationError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import type { FlowType } from "@/types/email-workspace"

const log = logger.child("EmailGenTrigger")

// Status que indicam batch em andamento para a loja
const IN_PROGRESS_STATUSES = [
  "copy_generating",
  "copy_generating_recovery",
  "rendering",
  "qa_running",
] as const

// Status que devem ser pulados em mode != 'redo'
const SKIP_IF_NOT_REDO = ["ready"] as const

// Sempre pulado (proteção legacy)
const NEVER_TOUCH = ["live"] as const

const N8N_DISPATCH_TIMEOUT_MS = 15_000

export type StartOnboardingMode = "fresh" | "resume" | "redo"
export type StartOnboardingTriggeredBy = "ui" | "signal_consumer"

export interface StartOnboardingInput {
  storeId: string
  mode: StartOnboardingMode
  flowIds?: string[]
  triggeredBy: StartOnboardingTriggeredBy
  triggeredByUserId?: string | null
}

export interface StartOnboardingResult {
  batch_id: string
  emails_dispatched: number
  dispatched_to_n8n: boolean
  flow_ids_used: string[]
  mode: StartOnboardingMode
  reused_batch?: boolean
  message?: string
}

interface EmailRow {
  id: string
  flow_id: string
  number: number
  name: string | null
  status: string
  generation_batch_id: string | null
}

interface FlowRow {
  id: string
  flow_type: FlowType
}

function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "")
}

/**
 * Resolve o webhook URL do n8n para copy generation.
 * A story menciona N8N_EMAIL_COPY_URL mas o codebase ja tem
 * N8N_EMAIL_COPY_WEBHOOK_URL — aceitamos ambos.
 */
function getN8nCopyUrl(): string | null {
  return process.env.N8N_EMAIL_COPY_URL ?? process.env.N8N_EMAIL_COPY_WEBHOOK_URL ?? null
}

/**
 * Dispara o pipeline de geração para uma loja.
 * Retorna informações do batch criado (ou reutilizado em mode=resume).
 *
 * @throws ValidationError 422 com code 'briefing_not_confirmed' se nao ha
 *   briefing confirmed (exceto mode='resume')
 * @throws ConflictError 409 com code 'batch_in_progress' se ja existe batch
 *   ativo e mode='fresh'
 */
export async function startOnboarding(
  input: StartOnboardingInput,
): Promise<StartOnboardingResult> {
  const { storeId, mode, flowIds, triggeredBy, triggeredByUserId } = input
  const admin = createAdminClient()

  log.info("start.begin", { storeId, mode, flowIds, triggeredBy })

  // ── 1. Validar briefing confirmed (exceto resume) ─────────────
  const { data: briefing } = await admin
    .from("store_briefings")
    .select("id, version, status")
    .eq("store_id", storeId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()

  const briefingVersion = (briefing?.version as number | undefined) ?? null

  if (mode !== "resume") {
    if (!briefing || briefing.status !== "confirmed") {
      log.warn("start.briefing_not_confirmed", {
        storeId,
        mode,
        currentStatus: briefing?.status ?? null,
      })
      const err = new ValidationError("briefing_not_confirmed") as ValidationError & {
        code?: string
      }
      err.code = "briefing_not_confirmed"
      throw err
    }
  }

  // ── 2. Detectar batch em andamento ────────────────────────────
  // Buscar flows da loja primeiro
  let flowQuery = admin.from("email_flows").select("id, flow_type").eq("store_id", storeId)
  if (flowIds && flowIds.length > 0) {
    flowQuery = flowQuery.in("id", flowIds)
  }
  const { data: flowsData, error: flowsErr } = await flowQuery
  if (flowsErr) throw flowsErr
  const flows = (flowsData ?? []) as FlowRow[]
  const allFlowIds = flows.map((f) => f.id)

  if (allFlowIds.length === 0) {
    log.info("start.no_flows", { storeId })
    return {
      batch_id: crypto.randomUUID(),
      emails_dispatched: 0,
      dispatched_to_n8n: false,
      flow_ids_used: [],
      mode,
      message: "nothing_to_generate",
    }
  }

  // Buscar TODOS os emails da loja (via flows) — precisamos para validar
  // batch em andamento + selecionar alvos.
  const { data: emailsData, error: emailsErr } = await admin
    .from("email_flow_emails")
    .select("id, flow_id, number, name, status, generation_batch_id")
    .in("flow_id", allFlowIds)

  if (emailsErr) throw emailsErr
  const emails = (emailsData ?? []) as EmailRow[]

  const inProgressEmails = emails.filter((e) =>
    (IN_PROGRESS_STATUSES as readonly string[]).includes(e.status),
  )
  const currentBatchId = inProgressEmails[0]?.generation_batch_id ?? null

  if (inProgressEmails.length > 0) {
    if (mode === "fresh") {
      log.warn("start.batch_in_progress", {
        storeId,
        currentBatchId,
        emailCount: inProgressEmails.length,
      })
      const err = new ConflictError("batch_in_progress") as ConflictError & {
        code?: string
        details?: Record<string, unknown>
      }
      err.code = "batch_in_progress"
      err.details = { current_batch_id: currentBatchId }
      throw err
    }
    if (mode === "resume" && currentBatchId) {
      // Idempotente: retorna o batch atual sem disparar n8n
      const flowIdsInProgress = Array.from(new Set(inProgressEmails.map((e) => e.flow_id)))
      log.info("start.resume_existing", { storeId, currentBatchId })
      return {
        batch_id: currentBatchId,
        emails_dispatched: inProgressEmails.length,
        dispatched_to_n8n: false,
        flow_ids_used: flowIdsInProgress,
        mode,
        reused_batch: true,
      }
    }
    if (mode === "redo") {
      // Marca emails em andamento como failed
      const { error: failErr } = await admin
        .from("email_flow_emails")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: "superseded_by_redo",
        })
        .in(
          "id",
          inProgressEmails.map((e) => e.id),
        )
      if (failErr) throw failErr
      log.info("start.redo_failed_prev", {
        storeId,
        previousBatchId: currentBatchId,
        count: inProgressEmails.length,
      })
    }
  }

  // ── 3. Selecionar emails alvo ─────────────────────────────────
  const targetEmails = emails.filter((e) => {
    if ((NEVER_TOUCH as readonly string[]).includes(e.status)) return false
    if (
      mode !== "redo" &&
      (SKIP_IF_NOT_REDO as readonly string[]).includes(e.status)
    ) {
      return false
    }
    // Em resume nao deve re-disparar emails em andamento (ja tratados acima
    // pelo early-return). Aqui filtramos qualquer in_progress restante.
    if ((IN_PROGRESS_STATUSES as readonly string[]).includes(e.status)) return false
    return true
  })

  if (targetEmails.length === 0) {
    log.info("start.nothing_to_generate", { storeId, mode })
    return {
      batch_id: crypto.randomUUID(),
      emails_dispatched: 0,
      dispatched_to_n8n: false,
      flow_ids_used: [],
      mode,
      message: "nothing_to_generate",
    }
  }

  // ── 4. UPDATE atomico em batch ────────────────────────────────
  const batchId = crypto.randomUUID()
  const nowIso = new Date().toISOString()
  const targetIds = targetEmails.map((e) => e.id)

  // Garantia adicional via filtro NOT IN ('live') no servidor
  const { data: updated, error: updErr } = await admin
    .from("email_flow_emails")
    .update({
      status: "copy_generating",
      generation_batch_id: batchId,
      copy_started_at: nowIso,
      last_attempt_at: nowIso,
      failure_reason: null,
      qa_issues: [],
    })
    .in("id", targetIds)
    .not("status", "in", "(live)")
    .select("id, flow_id, number, name")

  if (updErr) throw updErr
  const updatedRows = (updated ?? []) as Array<{
    id: string
    flow_id: string
    number: number
    name: string | null
  }>

  if (updatedRows.length === 0) {
    log.info("start.update_no_rows", { storeId, mode })
    return {
      batch_id: batchId,
      emails_dispatched: 0,
      dispatched_to_n8n: false,
      flow_ids_used: [],
      mode,
      message: "nothing_to_generate",
    }
  }

  // Incrementa attempts via RPC atomica em batch. PostgREST nao expoe
  // UPDATE col = col + 1 direto, entao usamos increment_email_attempts(UUID[])
  // criada na migration 20260530b. Falha aqui e degradante (nao bloqueia
  // dispatch) mas e logada — sem isso o watchdog (AE-4) nao consegue
  // aplicar cap de retries.
  const emailIdsForIncrement = updatedRows.map((r) => r.id)
  const { error: incErr } = await admin.rpc("increment_email_attempts", {
    p_email_ids: emailIdsForIncrement,
  })
  if (incErr) {
    log.warn("start.increment_attempts_failed", {
      batchId,
      emailCount: emailIdsForIncrement.length,
      error: incErr.message,
    })
  }

  // Mapa flow_type por flow_id
  const flowTypeById = new Map(flows.map((f) => [f.id, f.flow_type]))
  const flowIdsUsed = Array.from(new Set(updatedRows.map((r) => r.flow_id)))

  // ── 5. Dispatch n8n ───────────────────────────────────────────
  const n8nUrl = getN8nCopyUrl()
  const callbackUrl = `${getAppUrl()}/api/webhooks/n8n/email-copy`
  const callbackSecret = process.env.N8N_WEBHOOK_SECRET ?? ""

  const payload = {
    store_id: storeId,
    batch_id: batchId,
    callback_url: callbackUrl,
    callback_secret: callbackSecret,
    emails: updatedRows.map((r) => ({
      email_id: r.id,
      flow_id: r.flow_id,
      flow_type: flowTypeById.get(r.flow_id) ?? "welcome",
      email_number: r.number,
      name: r.name ?? `Email ${r.number}`,
    })),
    briefing_version: briefingVersion ?? 0,
    options: { generate_images: true },
  }

  let dispatchOk = false
  let dispatchError: string | null = null

  if (!n8nUrl) {
    log.warn("start.no_n8n_url", { storeId, batchId })
    dispatchError = "n8n_url_not_configured"
  } else {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), N8N_DISPATCH_TIMEOUT_MS)
    const t0 = Date.now()
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (callbackSecret) headers["x-webhook-secret"] = callbackSecret

      const resp = await fetch(n8nUrl, {
        method: "POST",
        signal: ctrl.signal,
        headers,
        body: JSON.stringify(payload),
      })
      const ms = Date.now() - t0
      if (resp.ok) {
        dispatchOk = true
        log.info("start.n8n_ok", { storeId, batchId, ms, http_status: resp.status })
      } else {
        const body = await resp.text().catch(() => "")
        dispatchError = `n8n_dispatch_failed:${resp.status}`
        log.error("start.n8n_failed", {
          storeId,
          batchId,
          http_status: resp.status,
          body: body.slice(0, 200),
        })
      }
    } catch (e) {
      const ms = Date.now() - t0
      if (ctrl.signal.aborted) {
        dispatchError = "n8n_dispatch_timeout"
        log.error("start.n8n_timeout", { storeId, batchId, ms })
      } else {
        dispatchError = (e as Error).message
        log.error("start.n8n_error", { storeId, batchId, error: dispatchError })
      }
    } finally {
      clearTimeout(timer)
    }
  }

  // ── 6. Persistir telemetria + reverter em falha ───────────────
  await admin
    .from("email_generation_runs")
    .insert({
      store_id: storeId,
      triggered_by: triggeredByUserId ?? null,
      batch_id: batchId,
      agent: "seed",
      status: dispatchOk ? "success" : "error",
      model: "n8n",
      parsed_output: {
        batch_id: batchId,
        email_ids: updatedRows.map((r) => r.id),
        mode,
        triggered_by: triggeredBy,
        flow_ids: flowIdsUsed,
      },
      error_message: dispatchError,
    })
    .then(() => undefined, (err) => {
      log.warn("start.telemetry_failed", { storeId, batchId, error: (err as Error)?.message })
    })

  if (!dispatchOk) {
    // Reverter emails para `pending` com failure_reason
    await admin
      .from("email_flow_emails")
      .update({
        status: "pending",
        failure_reason: "n8n_dispatch_failed",
      })
      .eq("generation_batch_id", batchId)

    log.error("start.dispatch.reverted", {
      storeId,
      batchId,
      emailCount: updatedRows.length,
      dispatchError,
    })

    const err = new Error("n8n_dispatch_failed") as Error & {
      statusCode?: number
      code?: string
      details?: Record<string, unknown>
    }
    err.statusCode = 502
    err.code = "n8n_dispatch_failed"
    err.details = { batch_id: batchId, reason: dispatchError }
    throw err
  }

  log.info("start.dispatch", {
    storeId,
    batchId,
    emailCount: updatedRows.length,
    mode,
    triggeredBy,
  })

  return {
    batch_id: batchId,
    emails_dispatched: updatedRows.length,
    dispatched_to_n8n: true,
    flow_ids_used: flowIdsUsed,
    mode,
  }
}

// ──────────────────────────────────────────────────────────────
// Signal Consumer (chamado pelo watchdog AE-4)
// ──────────────────────────────────────────────────────────────

export interface ConsumeSignalResult {
  signal_id: string
  status: "done" | "failed" | "skipped"
  reason?: string
  batch_id?: string
  emails_dispatched?: number
}

/**
 * Consome 1 sinal pendente e dispara startOnboarding.
 *
 * Comportamento:
 *   - Marca sinal como `processing` antes de chamar startOnboarding
 *     (best-effort: nao temos SELECT FOR UPDATE no PostgREST; o flag
 *     status='processing' atua como lock leve)
 *   - Em sucesso: status='done', processed_at=now()
 *   - Em ConflictError (batch ja em andamento): trata como `done` —
 *     a UI ja disparou, sinal e idempotente
 *   - Em outra falha: attempts++, se attempts < 3 volta pra `pending`,
 *     senao marca como `failed`
 */
export async function consumeQueueSignal(signalId: string): Promise<ConsumeSignalResult> {
  const admin = createAdminClient()

  // 1. Buscar sinal e tentar marcar como processing atomicamente
  // Usa eq(status,'pending') para evitar processar mesmo sinal 2x
  const { data: signal, error: fetchErr } = await admin
    .from("email_generation_queue_signals")
    .update({ status: "processing" })
    .eq("id", signalId)
    .eq("status", "pending")
    .select("id, store_id, attempts, payload")
    .maybeSingle()

  if (fetchErr) throw fetchErr
  if (!signal) {
    log.info("consume.skip_not_pending", { signalId })
    return { signal_id: signalId, status: "skipped", reason: "not_pending" }
  }

  const storeId = signal.store_id as string
  const attempts = (signal.attempts as number) ?? 0

  log.info("consume.start", { signalId, storeId, attempts })

  try {
    const result = await startOnboarding({
      storeId,
      mode: "fresh",
      triggeredBy: "signal_consumer",
    })

    await admin
      .from("email_generation_queue_signals")
      .update({
        status: "done",
        processed_at: new Date().toISOString(),
      })
      .eq("id", signalId)

    log.info("consume.done", { signalId, storeId, batchId: result.batch_id })

    return {
      signal_id: signalId,
      status: "done",
      batch_id: result.batch_id,
      emails_dispatched: result.emails_dispatched,
    }
  } catch (err) {
    const errCode = (err as { code?: string }).code
    const errMsg = err instanceof Error ? err.message : "unknown"

    // ConflictError: batch ja iniciado pela UI — trata como done
    if (errCode === "batch_in_progress") {
      await admin
        .from("email_generation_queue_signals")
        .update({
          status: "done",
          processed_at: new Date().toISOString(),
        })
        .eq("id", signalId)
      log.info("consume.skip_batch_exists", { signalId, storeId })
      return { signal_id: signalId, status: "done", reason: "batch_already_running" }
    }

    // briefing_not_confirmed: nao retry — operador confirmou e desconfirmou?
    // Marcar como failed para nao reprocessar.
    if (errCode === "briefing_not_confirmed") {
      await admin
        .from("email_generation_queue_signals")
        .update({
          status: "failed",
          processed_at: new Date().toISOString(),
          attempts: attempts + 1,
        })
        .eq("id", signalId)
      log.warn("consume.failed_briefing_not_confirmed", { signalId, storeId })
      return {
        signal_id: signalId,
        status: "failed",
        reason: "briefing_not_confirmed",
      }
    }

    // Outras falhas: retry ate 3x
    const newAttempts = attempts + 1
    const shouldRetry = newAttempts < 3
    await admin
      .from("email_generation_queue_signals")
      .update({
        status: shouldRetry ? "pending" : "failed",
        attempts: newAttempts,
        processed_at: shouldRetry ? null : new Date().toISOString(),
      })
      .eq("id", signalId)

    log.error("consume.error", {
      signalId,
      storeId,
      attempts: newAttempts,
      shouldRetry,
      error: errMsg,
    })

    return {
      signal_id: signalId,
      status: "failed",
      reason: errMsg,
    }
  }
}
