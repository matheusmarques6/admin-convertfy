/**
 * Vercel Cron — Email Generation Watchdog (Epic AE — Story AE-4)
 *
 * Schedule: every 5 minutes (cron: see vercel.json)
 *
 * Detecta emails travados no pipeline AE e age em 4 frentes sequenciais
 * (nao-paralelas — evita pressao concorrente no DB):
 *
 *   1. Consome ate 20 sinais `pending` em `email_generation_queue_signals`
 *      via `consumeQueueSignal` (story AE-2).
 *
 *   2. Detecta copy travada: emails em `copy_generating` ha mais de
 *      `WATCHDOG_COPY_TIMEOUT_MIN` (default 15min). UPDATE atomico
 *      WHERE status='copy_generating' AND attempts < MAX_GENERATION_ATTEMPTS
 *      claima o lote para `copy_generating_recovery`. Emails com
 *      attempts >= MAX_GENERATION_ATTEMPTS sao marcados `failed` direto
 *      (`max_attempts_exhausted`). Para cada claim valido, dispatcha
 *      `runCopyChainInProcess` via `after()`.
 *
 *   3. Detecta fase 2 travada: emails em `rendering` ou `qa_running` ha
 *      mais de `WATCHDOG_PHASE2_TIMEOUT_MIN` (default 10min). UPDATE
 *      atomico marca `failed` com `timeout_phase2`.
 *
 *   4. Detecta `copy_ready` sem fase 2 iniciada ha mais de 3min — cobre
 *      o caso onde o webhook n8n persistiu a copy mas a invocacao
 *      `waitUntil(runPhase2InBackground)` crashou. Para cada: POST
 *      `/api/internal/run-phase2/[emailId]` (story AE-3).
 *
 * **Concorrencia**: PostgREST nao expoe `FOR UPDATE SKIP LOCKED`. Usamos
 * UPDATE atomico com filtro de status (`.eq('status', 'copy_generating')`)
 * para garantir que apenas 1 cron pega cada row — o WHERE eh avaliado
 * dentro da transacao.
 *
 * **Telemetria**: 1 INSERT em `email_generation_runs` com
 * `agent='seed', email_id=NULL, parsed_output=summary` por execucao.
 *
 * Refs: docs/stories/AE-4.watchdog-cron-fallback.md
 */

import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { consumeQueueSignal } from "@/lib/services/email-generation-trigger.service"
import { runCopyChainInProcess } from "@/lib/agents/copy-chain-fallback.service"
import {
  notifyEmailFailed,
  notifyBatchComplete,
  notifyBatchAllFailed,
} from "@/lib/agents/generation-notify.service"
import { logger } from "@/lib/logger"

const log = logger.child("EmailGenWatchdog")

export const dynamic = "force-dynamic"
export const maxDuration = 300

// ── Tunables (env, com defaults seguros) ──────────────────────────────
const COPY_TIMEOUT_MIN = Number(process.env.WATCHDOG_COPY_TIMEOUT_MIN ?? 15)
const PHASE2_TIMEOUT_MIN = Number(process.env.WATCHDOG_PHASE2_TIMEOUT_MIN ?? 10)
const STALE_COPY_READY_MIN = Number(process.env.WATCHDOG_STALE_COPY_READY_MIN ?? 3)
const MAX_ATTEMPTS = Number(process.env.MAX_GENERATION_ATTEMPTS ?? 3)
// Cap de re-dispatches do front 4 (POST /api/internal/run-phase2 para
// emails em copy_ready travados). Atingindo o cap, marca como
// failed:stale_copy_ready_exhausted para sair do loop.
const MAX_STALE_DISPATCH = Number(process.env.WATCHDOG_STALE_DISPATCH_MAX ?? 3)
const MAX_SIGNALS_PER_RUN = 20
const MAX_COPY_RECOVERY_PER_RUN = 10
const MAX_PHASE2_TIMEOUT_PER_RUN = 10
const MAX_STALE_COPY_READY_PER_RUN = 10

interface WatchdogSummary {
  signals_processed: number
  signals_failed: number
  copy_recovered: number
  max_attempts_exhausted: number
  phase2_timed_out: number
  stale_copy_ready: number
  stale_dispatch_exhausted: number
  started_at: string
  finished_at: string
  duration_ms: number
}

function getInternalUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "")
}

// ── Notify wrappers — story AE-7: real dispatchers via generation-notify.
// Try/catch envolve cada chamada para garantir que falha de notify NUNCA
// derrubar o cron. O service ja faz try/catch interno; isso e seguranca
// adicional contra falhas de import/runtime.

async function safeNotifyEmailFailed(params: {
  storeId: string
  emailId: string
  failureReason: string
  batchId: string | null
}): Promise<void> {
  if (!params.storeId) {
    // storeId vazio significa que getStoreIdForEmail nao resolveu o flow
    // do email (registro orfao ou flow deletado). Logamos para visibilidade
    // mas seguimos — notifyEmailFailed degrada gracefully com "Loja" como
    // fallback no template.
    log.warn("watchdog.notify.email_failed.missing_store_id", {
      emailId: params.emailId,
      failureReason: params.failureReason,
    })
  }
  try {
    await notifyEmailFailed(params)
  } catch (err) {
    log.warn("watchdog.notify.email_failed_unexpected", {
      emailId: params.emailId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// Quando um email do batch atinge terminal por timeout/exhaust, checa
// se o batch inteiro acabou e dispara notifyBatchComplete (ou
// notifyBatchAllFailed). Idempotente via dedup-key no service.
async function safeNotifyBatchTerminalIfDone(
  storeId: string | null,
  batchId: string,
): Promise<void> {
  if (!storeId) return
  try {
    const admin = createAdminClient()
    const { data: rows } = await admin
      .from("email_flow_emails")
      .select("status")
      .eq("generation_batch_id", batchId)
    const list = (rows ?? []) as Array<{ status: string }>
    if (list.length === 0) return
    const allTerminal = list.every(
      (e) => e.status === "ready" || e.status === "failed",
    )
    if (!allTerminal) return
    const allFailed = list.every((e) => e.status === "failed")
    if (allFailed) {
      await notifyBatchAllFailed({ storeId, batchId })
    } else {
      await notifyBatchComplete({ storeId, batchId })
    }
  } catch (err) {
    log.warn("watchdog.notify.batch_terminal_unexpected", {
      batchId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// Helper: resolve storeId a partir do email (necessario porque os
// updates do watchdog so tem `id` + `generation_batch_id`, nao `store_id`).
async function getStoreIdForEmail(emailId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("email_flow_emails")
    .select("flow:email_flows(store_id)")
    .eq("id", emailId)
    .maybeSingle()
  const flow = (data as { flow?: { store_id?: string } | Array<{ store_id?: string }> } | null)
    ?.flow
  const flowRel = Array.isArray(flow) ? flow[0] : flow
  return (flowRel as { store_id?: string } | undefined)?.store_id ?? null
}

// ── Front 1: consome sinais pendentes ─────────────────────────────────
async function processSignals(): Promise<{ processed: number; failed: number }> {
  const admin = createAdminClient()
  const { data: pendingSignals, error } = await admin
    .from("email_generation_queue_signals")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(MAX_SIGNALS_PER_RUN)

  if (error) {
    log.error("watchdog.signals.query_failed", { error: error.message })
    return { processed: 0, failed: 0 }
  }

  let processed = 0
  let failed = 0
  for (const sig of pendingSignals ?? []) {
    try {
      const result = await consumeQueueSignal(sig.id as string)
      if (result.status === "done") processed++
      else if (result.status === "failed") failed++
    } catch (err) {
      failed++
      log.error("watchdog.signals.consume_error", {
        signalId: sig.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { processed, failed }
}

// ── Front 2a: marca emails com attempts esgotados como failed ─────────
async function exhaustMaxAttempts(thresholdIso: string): Promise<number> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("email_flow_emails")
    .update({
      status: "failed",
      failure_reason: "max_attempts_exhausted",
      failed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("status", "copy_generating")
    .lt("copy_started_at", thresholdIso)
    .gte("attempts", MAX_ATTEMPTS)
    .select("id, generation_batch_id")

  if (error) {
    log.error("watchdog.copy.exhaust_failed", { error: error.message })
    return 0
  }
  const rows = (data ?? []) as Array<{ id: string; generation_batch_id: string | null }>
  if (rows.length === 0) return 0

  log.error("watchdog.copy.max_attempts_exhausted", { count: rows.length })

  for (const r of rows) {
    const storeId = await getStoreIdForEmail(r.id)
    await safeNotifyEmailFailed({
      storeId: storeId ?? "",
      emailId: r.id,
      failureReason: "max_attempts_exhausted",
      batchId: r.generation_batch_id,
    })
    if (r.generation_batch_id) {
      await safeNotifyBatchTerminalIfDone(storeId, r.generation_batch_id)
    }
  }
  return rows.length
}

// ── Front 2b: claima emails com copy travada (attempts < MAX) ─────────
//
// DESIGN NOTE — por que NAO incrementamos `attempts` neste claim?
//
// AE-2 (`startOnboarding`) ja chama `increment_email_attempts(UUID[])`
// ANTES de despachar pro n8n. Quando n8n falha em 15min, o email esta
// em `copy_generating` com `attempts >= 1` ja contado.
//
// Aqui no watchdog mudamos status para `copy_generating_recovery` e
// disparamos o fallback Claude in-process. Se o fallback der sucesso
// -> status vira `copy_ready` (sai do filtro deste front, nao volta).
// Se der falha -> `runCopyChainInProcess` marca status='failed' (sai
// do filtro tambem). Em ambos os casos a proxima execucao do cron
// NAO reclama o mesmo email porque o filtro requer `status='copy_generating'`.
//
// Consequencia intencional para MVP: cada email recebe EXATAMENTE 1
// tentativa de fallback (alem do envio original do n8n). Se mais
// tentativas forem necessarias no futuro, basta chamar
// `increment_email_attempts` aqui — o cap `< MAX_ATTEMPTS` no WHERE
// abaixo passa a contar.
async function recoverStuckCopy(thresholdIso: string): Promise<number> {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: claimed, error } = await admin
    .from("email_flow_emails")
    .update({
      status: "copy_generating_recovery",
      last_attempt_at: nowIso,
      updated_at: nowIso,
    })
    .eq("status", "copy_generating")
    .lt("copy_started_at", thresholdIso)
    .lt("attempts", MAX_ATTEMPTS)
    .select("id, flow_id, generation_batch_id, flow:email_flows(store_id)")
    .limit(MAX_COPY_RECOVERY_PER_RUN)

  if (error) {
    log.error("watchdog.copy.recover_failed", { error: error.message })
    return 0
  }

  const rows = (claimed ?? []) as Array<{
    id: string
    flow_id: string
    generation_batch_id: string | null
    flow: { store_id?: string } | Array<{ store_id?: string }> | null
  }>

  if (rows.length === 0) return 0

  log.warn("watchdog.copy.recovering", { count: rows.length })

  for (const r of rows) {
    const flowRel = Array.isArray(r.flow) ? r.flow[0] : r.flow
    const storeId = (flowRel as { store_id?: string } | null)?.store_id
    if (!storeId) {
      log.warn("watchdog.copy.no_store_id", { emailId: r.id })
      continue
    }
    try {
      after(
        runCopyChainInProcess({
          emailId: r.id,
          storeId,
          triggeredBy: "watchdog:copy_fallback",
        }),
      )
    } catch (err) {
      log.warn("watchdog.copy.after_unavailable", {
        error: err instanceof Error ? err.message : String(err),
      })
      void runCopyChainInProcess({
        emailId: r.id,
        storeId,
        triggeredBy: "watchdog:copy_fallback",
      }).catch((e: unknown) =>
        log.error("watchdog.copy.bg_error", {
          emailId: r.id,
          error: e instanceof Error ? e.message : String(e),
        }),
      )
    }
  }
  return rows.length
}

// ── Front 3: marca fase 2 travada como failed ──────────────────────────
async function timeoutPhase2(): Promise<number> {
  const admin = createAdminClient()
  const now = Date.now()
  const phase2ThresholdIso = new Date(now - PHASE2_TIMEOUT_MIN * 60_000).toISOString()
  const nowIso = new Date().toISOString()

  // Trata `rendering` e `qa_running` separadamente por causa dos
  // campos de timing distintos.
  const updates = [
    {
      status: "rendering",
      column: "rendering_started_at",
    },
    {
      status: "qa_running",
      column: "qa_started_at",
    },
  ] as const

  let total = 0
  for (const u of updates) {
    const { data, error } = await admin
      .from("email_flow_emails")
      .update({
        status: "failed",
        failure_reason: "timeout_phase2",
        failed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("status", u.status)
      .lt(u.column, phase2ThresholdIso)
      .select("id, generation_batch_id")
      .limit(MAX_PHASE2_TIMEOUT_PER_RUN)

    if (error) {
      log.error("watchdog.phase2.timeout_failed", {
        status: u.status,
        error: error.message,
      })
      continue
    }
    const rows = (data ?? []) as Array<{ id: string; generation_batch_id: string | null }>
    for (const r of rows) {
      const storeId = await getStoreIdForEmail(r.id)
      await safeNotifyEmailFailed({
        storeId: storeId ?? "",
        emailId: r.id,
        failureReason: "timeout_phase2",
        batchId: r.generation_batch_id,
      })
      if (r.generation_batch_id) {
        await safeNotifyBatchTerminalIfDone(storeId, r.generation_batch_id)
      }
    }
    total += rows.length
  }
  return total
}

// ── Front 4: re-dispatch copy_ready sem fase 2 iniciada ────────────────
//
// Cap de tentativas: se o POST para /api/internal/run-phase2 falha
// repetidamente (5xx, timeout, network), incrementa
// `copy_ready_dispatch_attempts` (RPC criada em
// `20260530c_copy_ready_dispatch_attempts.sql`). Ao atingir
// MAX_STALE_DISPATCH, marca o email como
// `failed:stale_copy_ready_exhausted` para evitar loop infinito.
async function redispatchStaleCopyReady(): Promise<{
  dispatched: number
  exhausted: number
}> {
  const admin = createAdminClient()
  const threshold = new Date(
    Date.now() - STALE_COPY_READY_MIN * 60_000,
  ).toISOString()

  const { data, error } = await admin
    .from("email_flow_emails")
    .select("id, flow_id, generation_batch_id")
    .eq("status", "copy_ready")
    .lt("copy_ready_at", threshold)
    .lt("copy_ready_dispatch_attempts", MAX_STALE_DISPATCH)
    .order("copy_ready_at", { ascending: true })
    .limit(MAX_STALE_COPY_READY_PER_RUN)

  if (error) {
    log.error("watchdog.stale_copy_ready.query_failed", { error: error.message })
    return { dispatched: 0, exhausted: 0 }
  }
  const rows = (data ?? []) as Array<{
    id: string
    flow_id: string
    generation_batch_id: string | null
  }>
  if (rows.length === 0) return { dispatched: 0, exhausted: 0 }

  log.warn("watchdog.stale_copy_ready.detected", { count: rows.length })

  const internalSecret = process.env.INTERNAL_SECRET ?? ""
  if (!internalSecret) {
    log.error("watchdog.stale_copy_ready.no_secret", { count: rows.length })
    return { dispatched: 0, exhausted: 0 }
  }

  const base = getInternalUrl()
  const failedIds: string[] = []
  let dispatched = 0

  for (const r of rows) {
    const url = `${base}/api/internal/run-phase2/${r.id}`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5_000)
    try {
      const resp = await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": internalSecret,
        },
      })
      if (resp.ok) {
        dispatched++
        log.info("watchdog.stale_copy_ready.dispatch_ok", {
          emailId: r.id,
          status: resp.status,
        })
      } else {
        failedIds.push(r.id)
        log.warn("watchdog.stale_copy_ready.dispatch_non_ok", {
          emailId: r.id,
          status: resp.status,
        })
      }
    } catch (err) {
      failedIds.push(r.id)
      log.warn("watchdog.stale_copy_ready.dispatch_error", {
        emailId: r.id,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      clearTimeout(timer)
    }
  }

  // Incrementa contador para todos os emails que falharam o POST e marca
  // como `failed:stale_copy_ready_exhausted` os que atingiram o cap.
  let exhausted = 0
  if (failedIds.length > 0) {
    const { data: incData, error: incErr } = await admin.rpc(
      "increment_copy_ready_dispatch_attempts",
      { p_email_ids: failedIds },
    )
    if (incErr) {
      log.error("watchdog.stale_copy_ready.increment_failed", {
        error: incErr.message,
        count: failedIds.length,
      })
    } else {
      const exhaustedIds = (
        (incData ?? []) as Array<{ email_id: string; attempts: number }>
      )
        .filter((d) => d.attempts >= MAX_STALE_DISPATCH)
        .map((d) => d.email_id)

      if (exhaustedIds.length > 0) {
        const nowIso = new Date().toISOString()
        const { error: failErr } = await admin
          .from("email_flow_emails")
          .update({
            status: "failed",
            failure_reason: "stale_copy_ready_exhausted",
            failed_at: nowIso,
          })
          .in("id", exhaustedIds)

        if (failErr) {
          log.error("watchdog.stale_copy_ready.exhaust_failed", {
            error: failErr.message,
            count: exhaustedIds.length,
          })
        } else {
          exhausted = exhaustedIds.length
          log.error("watchdog.stale_copy_ready.exhausted", {
            count: exhausted,
            email_ids: exhaustedIds,
          })
          // Notifica tag CTO + checkBatchTerminal (story AE-7).
          for (const r of rows.filter((row) => exhaustedIds.includes(row.id))) {
            const storeId = await getStoreIdForEmail(r.id)
            await safeNotifyEmailFailed({
              storeId: storeId ?? "",
              emailId: r.id,
              failureReason: "stale_copy_ready_exhausted",
              batchId: r.generation_batch_id,
            })
            if (r.generation_batch_id) {
              await safeNotifyBatchTerminalIfDone(storeId, r.generation_batch_id)
            }
          }
        }
      }
    }
  }

  return { dispatched, exhausted }
}

// ── Persistir telemetria final do cron ────────────────────────────────
async function persistRunSummary(summary: WatchdogSummary): Promise<void> {
  const admin = createAdminClient()
  try {
    await admin.from("email_generation_runs").insert({
      // batch_id eh obrigatorio no schema; usamos um UUID por execucao
      // para indexar 1 row por watchdog tick. email_id NULL eh permitido.
      batch_id: crypto.randomUUID(),
      agent: "seed",
      status: "success",
      model: "watchdog",
      parsed_output: summary,
      duration_ms: summary.duration_ms,
    })
  } catch (err) {
    log.warn("watchdog.summary.insert_failed", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  log.info("watchdog.start", { startedAt })

  let signalsProcessed = 0
  let signalsFailed = 0
  let copyRecovered = 0
  let maxAttemptsExhausted = 0
  let phase2TimedOut = 0
  let staleCopyReady = 0
  let staleDispatchExhausted = 0

  // Front 1: sinais
  try {
    const r = await processSignals()
    signalsProcessed = r.processed
    signalsFailed = r.failed
  } catch (err) {
    log.error("watchdog.signals.fatal", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Front 2: copy travada
  try {
    const copyThresholdIso = new Date(
      Date.now() - COPY_TIMEOUT_MIN * 60_000,
    ).toISOString()
    maxAttemptsExhausted = await exhaustMaxAttempts(copyThresholdIso)
    copyRecovered = await recoverStuckCopy(copyThresholdIso)
  } catch (err) {
    log.error("watchdog.copy.fatal", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Front 3: fase 2 travada
  try {
    phase2TimedOut = await timeoutPhase2()
  } catch (err) {
    log.error("watchdog.phase2.fatal", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Front 4: copy_ready stale
  try {
    const r = await redispatchStaleCopyReady()
    staleCopyReady = r.dispatched
    staleDispatchExhausted = r.exhausted
  } catch (err) {
    log.error("watchdog.stale_copy_ready.fatal", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const finishedAt = new Date().toISOString()
  const duration = Date.now() - t0

  const summary: WatchdogSummary = {
    signals_processed: signalsProcessed,
    signals_failed: signalsFailed,
    copy_recovered: copyRecovered,
    max_attempts_exhausted: maxAttemptsExhausted,
    phase2_timed_out: phase2TimedOut,
    stale_copy_ready: staleCopyReady,
    stale_dispatch_exhausted: staleDispatchExhausted,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: duration,
  }

  // Logs com niveis apropriados para visibilidade operacional
  if (copyRecovered > 0) {
    log.warn("watchdog.summary", summary)
  } else if (phase2TimedOut > 0 || maxAttemptsExhausted > 0) {
    log.error("watchdog.summary", summary)
  } else {
    log.info("watchdog.summary", summary)
  }

  await persistRunSummary(summary)

  return NextResponse.json({ success: true, ...summary })
}
