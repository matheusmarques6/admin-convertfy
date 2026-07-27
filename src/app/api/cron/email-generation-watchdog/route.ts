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
 *      `waitUntil(runPhase2InBackground)` crashou. SO re-dispatcha e-mails
 *      de lojas com brand identity CONFIRMADA (GATE 2) — e-mails sem brand
 *      confirmada nao sao "stale", estao legitimamente esperando o portao.
 *      Para cada elegivel: POST `/api/internal/run-phase2/[emailId]`.
 *
 * **Concorrencia**: PostgREST nao expoe `FOR UPDATE SKIP LOCKED`. Usamos
 * UPDATE atomico com filtro de status (`.eq('status', 'copy_generating')`)
 * para garantir que apenas 1 cron pega cada row — o WHERE eh avaliado
 * dentro da transacao.
 *
 * **Telemetria**: resumo por execucao via logs estruturados
 * (`log.info/warn/error("watchdog.summary", ...)`).
 *
 * Refs: docs/stories/AE-4.watchdog-cron-fallback.md
 */

import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { consumeQueueSignal } from "@/lib/services/email-generation-trigger.service"
import { runCopyChainInProcess } from "@/lib/agents/copy-chain-fallback.service"
import { runPhase2HtmlQa } from "@/lib/agents/phase2-runner.service"
import {
  notifyEmailFailed,
  notifyBatchComplete,
  notifyBatchAllFailed,
} from "@/lib/agents/generation-notify.service"
import { logger } from "@/lib/logger"
import { getConfirmedBrandStoreIds } from "@/lib/agents/html/brand-guards"

const log = logger.child("EmailGenWatchdog")

export const dynamic = "force-dynamic"
export const maxDuration = 300

// ── Tunables (env, com defaults seguros) ──────────────────────────────
const COPY_TIMEOUT_MIN = Number(process.env.WATCHDOG_COPY_TIMEOUT_MIN ?? 15)
// 10min cortava a fase 2 com reasoning model; com a CADEIA de formatação
// (hero 240s + texto 540s + imagem 180s + cores 240s, worst-case legítimo
// ≈ 14min mesmo com o budget dinâmico cortando antes), 25min cobre a cadeia
// inteira com folga e continua pegando fase 2 genuinamente morta.
const PHASE2_TIMEOUT_MIN = Number(process.env.WATCHDOG_PHASE2_TIMEOUT_MIN ?? 25)
const STALE_COPY_READY_MIN = Number(process.env.WATCHDOG_STALE_COPY_READY_MIN ?? 3)
// Bug 2 split: `image_done` e `rendering` sao estados intermediarios.
// Se ficarem parados alem do threshold, o `after()` que deveria continuar o
// pipeline crashou (cold start, drop de runtime) — recuperacao via Front 5
// (in-process, sem depender de fetch). Threshold conta a partir de
// `rendering_started_at`, que e renovado no claim do html-qa (phase2-runner)
// pra dar budget proprio. Era 5min (cortava render legitimo de reasoning
// model), depois 12min; com a cadeia de formatação o step mais longo
// (texto, 540s) + hero (240s) passam de 12min — 15min de folga. O resume
// por html_pipeline_stage garante que a re-entrada NUNCA perde trabalho.
const STALE_IMAGE_DONE_MIN = Number(process.env.WATCHDOG_STALE_IMAGE_DONE_MIN ?? 15)
const MAX_ATTEMPTS = Number(process.env.MAX_GENERATION_ATTEMPTS ?? 3)
// Cap de re-dispatches do front 4 (POST /api/internal/run-phase2 para
// emails em copy_ready travados). Atingindo o cap, marca como
// failed:stale_copy_ready_exhausted para sair do loop.
const MAX_STALE_DISPATCH = Number(process.env.WATCHDOG_STALE_DISPATCH_MAX ?? 3)
// Runs de telemetria abertos como 'running' e nunca fechados (processo
// morreu no meio — ex.: geração de imagem do hero Luxe Lift 20/jul ficou
// 'running' pra sempre e a falha ficou invisível). 20min >> qualquer
// geração legítima (imagem 90s timeout, HTML 200s).
const STALE_RUN_MIN = Number(process.env.WATCHDOG_STALE_RUN_MIN ?? 20)
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
  stale_image_done: number
  orphan_runs_closed: number
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

  // Trata `rendering`, `image_done` e `qa_running` separadamente por causa
  // dos campos de timing distintos. `image_done` usa `rendering_started_at`
  // porque foi atualizado no inicio da fase imagem (mesmo claim).
  const updates = [
    {
      status: "rendering",
      column: "rendering_started_at",
    },
    {
      status: "image_done",
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
    .select(
      "id, flow_id, generation_batch_id, auto_phase2_relaxed, flow:email_flows(store_id)",
    )
    .eq("status", "copy_ready")
    .lt("copy_ready_at", threshold)
    .lt("copy_ready_dispatch_attempts", MAX_STALE_DISPATCH)
    .order("copy_ready_at", { ascending: true })
    .limit(MAX_STALE_COPY_READY_PER_RUN)

  if (error) {
    log.error("watchdog.stale_copy_ready.query_failed", { error: error.message })
    return { dispatched: 0, exhausted: 0 }
  }
  const allRows = (data ?? []) as Array<{
    id: string
    flow_id: string
    generation_batch_id: string | null
    auto_phase2_relaxed: boolean | null
    flow: { store_id?: string } | Array<{ store_id?: string }> | null
  }>
  if (allRows.length === 0) return { dispatched: 0, exhausted: 0 }

  // GATE 2: e-mails em `copy_ready` cuja loja AINDA NAO confirmou a brand
  // nao sao "stale" — estao corretamente esperando o portao. Re-dispatchar
  // so derrubaria a fase 2 no Guard 0 (skipped). Filtramos pra so manter
  // os de lojas com brand confirmada — os demais sao ignorados.
  // EXCECAO: e-mails do teste "Geração completa" (auto_phase2_relaxed) rodam
  // a fase 2 em modo RELAXADO, ignorando o gate — sempre elegiveis.
  const storeIdByEmail = new Map<string, string>()
  for (const r of allRows) {
    const flowRel = Array.isArray(r.flow) ? r.flow[0] : r.flow
    const storeId = (flowRel as { store_id?: string } | null)?.store_id
    if (storeId) storeIdByEmail.set(r.id, storeId)
  }
  const uniqueStoreIds = [...new Set(storeIdByEmail.values())]
  const confirmedStoreIds = await getConfirmedBrandStoreIds(admin, uniqueStoreIds)

  const rows = allRows.filter((r) => {
    if (r.auto_phase2_relaxed === true) return true
    const storeId = storeIdByEmail.get(r.id)
    return storeId !== undefined && confirmedStoreIds.has(storeId)
  })
  const skippedBrand = allRows.length - rows.length
  if (skippedBrand > 0) {
    log.info("watchdog.stale_copy_ready.skipped_brand_not_confirmed", {
      skipped: skippedBrand,
    })
  }
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
    const relaxed = r.auto_phase2_relaxed === true
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
        // Teste "Geração completa": fase 2 relaxada, sem gate de identidade.
        body: JSON.stringify({ relaxedBrandCheck: relaxed }),
      })
      if (resp.ok) {
        dispatched++
        // Limpa o flag após disparo bem-sucedido (idempotência: não re-dispara).
        if (relaxed) {
          await admin
            .from("email_flow_emails")
            .update({ auto_phase2_relaxed: false })
            .eq("id", r.id)
        }
        log.info("watchdog.stale_copy_ready.dispatch_ok", {
          emailId: r.id,
          status: resp.status,
          relaxed,
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

// ── Front 5: recupera image_done OU rendering sem HTML+QA iniciado ─────
//
// Cobre dois cenarios do bug 2 split:
//   (a) image_done: imagem terminou, mas o after() de `run-phase2-image`
//       que dispara `run-phase2-html-qa` crashou — html-qa nunca rodou.
//   (b) rendering: html-qa foi reclamado (claim renovou `rendering_started_at`)
//       mas o after() da rota html-qa crashou antes do trabalho terminar.
//
// Antes da Mudanca 1 (renovar relogio no claim), (b) era invisivel: o
// rendering_started_at era do tempo da imagem, nunca cruzava a janela
// stale-mas-nao-timeout antes da Front 3 matar. Agora (b) e visivel e
// recuperavel.
//
// Janela: STALE_IMAGE_DONE_MIN (default 15min) <= idade < PHASE2_TIMEOUT_MIN
// (default 25min), medida sobre rendering_started_at. Apos o timeout o
// timeoutPhase2 (Front 3) marca como failed.
//
// Execucao IN-PROCESS via `runPhase2HtmlQa` — o cron e contexto confiavel
// (Vercel garante execucao do scheduled invoke), imune ao drop de after()
// que e exatamente o que causou o stuck. Sequencial, limitado a
// MAX_PHASE2_TIMEOUT_PER_RUN (10) por tick — cada html-qa leva ~100-180s,
// cabem 1-2 por tick dentro do maxDuration=300s do cron. O resto fica pro
// proximo tick (5min depois) ou pra Front 3 matar com timeout_phase2.
/**
 * Decide se um email em rendering/image_done deve ser MORTO em vez de
 * retomado, usando a telemetria (email_generation_runs) como fonte de
 * idade — imune ao rendering_started_at renovado pelo claim.
 *
 * Idade real = a ATIVIDADE mais recente do email: o último run de fase 2
 * do batch vigente OU a última copy aceita (agent='copy', success — a copy
 * é gravada com batch_id NULL pelo callback). Considerar a copy evita o
 * falso positivo do re-dispatch no MESMO batch: copy nova chegou, a fase 2
 * re-claimou e caiu antes do primeiro run — o último run do batch é velho,
 * mas a copy é recente e retomar é exatamente o certo.
 *
 * - "timeout_phase2": nenhuma atividade há mais de PHASE2_TIMEOUT_MIN —
 *   batch morto; retomar é ressuscitar zumbi (incidente Luxe Lift 27/07,
 *   revivido 5h depois).
 * - null: atividade recente (ou sem telemetria pra julgar) — retomar.
 *
 * Invariante que sustenta o classificador: os runs de FASE 1 (assembler/
 * chooser/blueprint) são gravados com email_id NULL (rodam por loja×flow),
 * então nunca entram na conta por email — se entrassem, toda primeira
 * geração pareceria "sem atividade de fase 2" e seria morta cedo demais.
 */
async function classifyStaleBatch(
  emailId: string,
  batchId: string | null,
): Promise<"timeout_phase2" | null> {
  if (!batchId) return null
  const admin = createAdminClient()
  const [batchRes, copyRes] = await Promise.all([
    admin
      .from("email_generation_runs")
      .select("created_at")
      .eq("email_id", emailId)
      .eq("batch_id", batchId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("email_generation_runs")
      .select("created_at")
      .eq("email_id", emailId)
      .eq("agent", "copy")
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const lastBatchRunAt = batchRes.data?.created_at
    ? new Date(batchRes.data.created_at as string).getTime()
    : null
  if (lastBatchRunAt == null) return null

  const lastCopyAt = copyRes.data?.created_at
    ? new Date(copyRes.data.created_at as string).getTime()
    : null
  const lastActivityAt = Math.max(lastBatchRunAt, lastCopyAt ?? 0)

  const ageMs = Date.now() - lastActivityAt
  if (ageMs > PHASE2_TIMEOUT_MIN * 60_000) return "timeout_phase2"

  return null
}

/** Marca o email como failed com o reason do classifyStaleBatch + notifica. */
async function markStaleEmailFailed(
  emailId: string,
  batchId: string | null,
  storeId: string | null,
  reason: "timeout_phase2",
): Promise<void> {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const { data, error } = await admin
    .from("email_flow_emails")
    .update({
      status: "failed",
      failure_reason: reason,
      failed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", emailId)
    // Idempotência + anti-corrida: o snapshot das rows pode ter minutos de
    // idade (o loop retoma outros emails antes). Se uma geração NOVA já
    // assumiu o email (status movido OU batch trocado), o filtro não casa
    // e nada é morto.
    .in("status", ["image_done", "rendering"])
    .eq("generation_batch_id", batchId)
    .select("id")
  if (error) {
    log.error("watchdog.stale_image_done.mark_failed_error", {
      emailId,
      reason,
      error: error.message,
    })
    return
  }
  if (!data || data.length === 0) {
    // Nada afetado: a geração nova moveu o email entre o snapshot e o kill.
    log.info("watchdog.stale_image_done.kill_skipped", { emailId, batchId })
    return
  }
  log.warn("watchdog.stale_image_done.killed", { emailId, batchId, reason })
  await safeNotifyEmailFailed({
    storeId: storeId ?? "",
    emailId,
    failureReason: reason,
    batchId,
  })
  if (batchId) {
    await safeNotifyBatchTerminalIfDone(storeId, batchId)
  }
}

async function redispatchStaleImageDone(): Promise<{ dispatched: number }> {
  const admin = createAdminClient()
  const now = Date.now()
  const staleThresholdIso = new Date(
    now - STALE_IMAGE_DONE_MIN * 60_000,
  ).toISOString()
  const timeoutThresholdIso = new Date(
    now - PHASE2_TIMEOUT_MIN * 60_000,
  ).toISOString()

  const { data, error } = await admin
    .from("email_flow_emails")
    .select("id, generation_batch_id")
    .in("status", ["image_done", "rendering"])
    .lt("rendering_started_at", staleThresholdIso)
    .gte("rendering_started_at", timeoutThresholdIso)
    .order("rendering_started_at", { ascending: true })
    .limit(MAX_PHASE2_TIMEOUT_PER_RUN)

  if (error) {
    log.error("watchdog.stale_image_done.query_failed", { error: error.message })
    return { dispatched: 0 }
  }
  const rows = (data ?? []) as Array<{
    id: string
    generation_batch_id: string | null
  }>
  if (rows.length === 0) return { dispatched: 0 }

  log.warn("watchdog.stale_image_done.detected", { count: rows.length })

  let dispatched = 0
  for (const r of rows) {
    const storeId = await getStoreIdForEmail(r.id)
    if (!storeId) {
      log.warn("watchdog.stale_image_done.no_store", { emailId: r.id })
      continue
    }
    // Guard anti-zumbi: o claim do html-qa RENOVA rendering_started_at a
    // cada retomada, então a coluna nunca envelhece até o Front 3 (25min)
    // enquanto este front continuar reclamando — loop de ressurreição
    // indefinido (incidente Luxe Lift 27/07: batch das 12:26 revivido às
    // 17:51). A idade REAL vem da telemetria (último run do batch OU última
    // copy aceita): sem atividade há mais de PHASE2_TIMEOUT_MIN, o batch
    // está morto — failed:timeout_phase2. Senão vale retomar.
    const verdict = await classifyStaleBatch(r.id, r.generation_batch_id)
    if (verdict) {
      await markStaleEmailFailed(r.id, r.generation_batch_id, storeId, verdict)
      continue
    }
    try {
      // In-process: o cron e o contexto confiavel — sem fetch, sem after().
      // `runPhase2HtmlQa` ja e idempotente (claim atomico) e tolera retry.
      // `relaxedBrandCheck=true` mantem coerencia com a flag historica do
      // pipeline de teste (brand parcial degradada ao inves de bloquear).
      // budgetMs=240s: o cron tem maxDuration=300 — com o resume por
      // html_pipeline_stage a cadeia progride >=1 step por tick em vez de
      // morrer no meio e perder o trabalho.
      const result = await runPhase2HtmlQa({
        storeId,
        emailId: r.id,
        triggeredBy: "watchdog:stale_image_done",
        relaxedBrandCheck: true,
        budgetMs: 240_000,
      })
      dispatched++
      log.info("watchdog.stale_image_done.recovered", {
        emailId: r.id,
        result: result.status,
      })
    } catch (err) {
      log.error("watchdog.stale_image_done.recover_error", {
        emailId: r.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { dispatched }
}

// ── Front 6: fecha runs de telemetria órfãos em 'running' ──────────────
//
// email_generation_runs abre um run 'running' antes da chamada ao modelo e
// atualiza pra success/error ao fim. Se o processo morre no meio (drop de
// runtime, timeout de função), o run fica 'running' PARA SEMPRE e a falha
// some da telemetria — o hero da Luxe Lift (20/jul) perdeu a imagem assim,
// sem nenhum erro registrado. Não re-dispatcha nada (os fronts 3/5 cuidam
// do EMAIL); só fecha o RUN pra falha ficar visível na UI/queries.
async function closeOrphanRunningRuns(): Promise<number> {
  const admin = createAdminClient()
  const threshold = new Date(Date.now() - STALE_RUN_MIN * 60_000).toISOString()
  const { data, error } = await admin
    .from("email_generation_runs")
    .update({
      status: "error",
      error_message: `watchdog: run órfão em 'running' há mais de ${STALE_RUN_MIN}min — processo morreu sem fechar o run`,
    })
    .eq("status", "running")
    .lt("created_at", threshold)
    .select("id, agent, email_id")

  if (error) {
    log.error("watchdog.orphan_runs.close_failed", { error: error.message })
    return 0
  }
  const rows = (data ?? []) as Array<{ id: string; agent: string; email_id: string | null }>
  if (rows.length > 0) {
    log.warn("watchdog.orphan_runs.closed", {
      count: rows.length,
      agents: [...new Set(rows.map((r) => r.agent))],
      emailIds: [...new Set(rows.map((r) => r.email_id).filter(Boolean))].slice(0, 10),
    })
  }
  return rows.length
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
  let staleImageDone = 0
  let orphanRunsClosed = 0

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

  // Front 5: image_done stale (Bug 2 split)
  try {
    const r = await redispatchStaleImageDone()
    staleImageDone = r.dispatched
  } catch (err) {
    log.error("watchdog.stale_image_done.fatal", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Front 6: runs de telemetria órfãos em 'running'
  try {
    orphanRunsClosed = await closeOrphanRunningRuns()
  } catch (err) {
    log.error("watchdog.orphan_runs.fatal", {
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
    stale_image_done: staleImageDone,
    orphan_runs_closed: orphanRunsClosed,
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

  return NextResponse.json({ success: true, ...summary })
}
