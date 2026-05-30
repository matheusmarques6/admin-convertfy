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
import { logger } from "@/lib/logger"

const log = logger.child("EmailGenWatchdog")

export const dynamic = "force-dynamic"
export const maxDuration = 300

// ── Tunables (env, com defaults seguros) ──────────────────────────────
const COPY_TIMEOUT_MIN = Number(process.env.WATCHDOG_COPY_TIMEOUT_MIN ?? 15)
const PHASE2_TIMEOUT_MIN = Number(process.env.WATCHDOG_PHASE2_TIMEOUT_MIN ?? 10)
const STALE_COPY_READY_MIN = Number(process.env.WATCHDOG_STALE_COPY_READY_MIN ?? 3)
const MAX_ATTEMPTS = Number(process.env.MAX_GENERATION_ATTEMPTS ?? 3)
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

// ── Mock notify hooks — alinhado com phase2-runner.service.ts. Sera
// substituido pelo dispatcher real de notificacoes (story AE-7). ──────
async function notifyTaggedMock(
  tags: string[],
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  log.info("watchdog.notify.tagged_mock", { tags, event, payload })
}

// ── checkBatchTerminal mock — quando o batch de um email expirado fica
// terminal, sera notificado por phase2-runner em outros caminhos. Aqui
// mantemos o no-op simbolico (story AE-7). ─────────────────────────────
async function checkBatchTerminalMock(batchId: string): Promise<void> {
  log.info("watchdog.notify.batch_terminal_mock", { batchId })
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
    try {
      await notifyTaggedMock(["cto"], "email_generation_failed", {
        email_id: r.id,
        reason: "max_attempts_exhausted",
      })
    } catch {
      /* noop */
    }
    if (r.generation_batch_id) {
      await checkBatchTerminalMock(r.generation_batch_id).catch(() => {})
    }
  }
  return rows.length
}

// ── Front 2b: claima emails com copy travada (attempts < MAX) ─────────
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
      try {
        await notifyTaggedMock(["cto"], "email_generation_failed", {
          email_id: r.id,
          reason: "timeout_phase2",
        })
      } catch {
        /* noop */
      }
      if (r.generation_batch_id) {
        await checkBatchTerminalMock(r.generation_batch_id).catch(() => {})
      }
    }
    total += rows.length
  }
  return total
}

// ── Front 4: re-dispatch copy_ready sem fase 2 iniciada ────────────────
async function redispatchStaleCopyReady(): Promise<number> {
  const admin = createAdminClient()
  const threshold = new Date(
    Date.now() - STALE_COPY_READY_MIN * 60_000,
  ).toISOString()

  const { data, error } = await admin
    .from("email_flow_emails")
    .select("id")
    .eq("status", "copy_ready")
    .lt("copy_ready_at", threshold)
    .order("copy_ready_at", { ascending: true })
    .limit(MAX_STALE_COPY_READY_PER_RUN)

  if (error) {
    log.error("watchdog.stale_copy_ready.query_failed", { error: error.message })
    return 0
  }
  const rows = (data ?? []) as Array<{ id: string }>
  if (rows.length === 0) return 0

  log.warn("watchdog.stale_copy_ready.detected", { count: rows.length })

  const internalSecret = process.env.INTERNAL_SECRET ?? ""
  if (!internalSecret) {
    log.error("watchdog.stale_copy_ready.no_secret", { count: rows.length })
    return 0
  }

  const base = getInternalUrl()
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
      if (resp.ok) dispatched++
      else {
        log.warn("watchdog.stale_copy_ready.dispatch_non_ok", {
          emailId: r.id,
          status: resp.status,
        })
      }
    } catch (err) {
      log.warn("watchdog.stale_copy_ready.dispatch_error", {
        emailId: r.id,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      clearTimeout(timer)
    }
  }
  return dispatched
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
    staleCopyReady = await redispatchStaleCopyReady()
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
