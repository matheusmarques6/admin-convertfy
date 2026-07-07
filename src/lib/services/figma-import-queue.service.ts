/**
 * Figma Import Queue (fila + cron).
 *
 * O Figma limita o export de imagem (/v1/images, Tier 1) a 10 req/min por
 * token. Os imports das Telas 1 (corte modelo) e 2 (emails por loja) não
 * exportam mais inline no request: a rota ENFILEIRA um job aqui e o cron
 * `/api/cron/figma-import-queue` (every minute) processa dentro do orçamento
 * interno de 8 exports/min — o pacing em si é imposto pela guarda distribuída
 * `acquireExportSlot` (export-budget.ts) dentro do client do Figma; a fila
 * fatia o trabalho em ticks e persiste progresso parcial pro modal (polling).
 *
 * Mecânica idêntica a email-dispatch-queue.service.ts: claim otimista via
 * CAS na coluna `updated_at` (PostgREST não tem FOR UPDATE), lease, heartbeat
 * por loja settlada, dedup por índice único parcial (1 job ativo por
 * suggestion×kind).
 *
 * Retomada sem perder trabalho: `result.results` guarda as lojas já
 * settladas (heartbeat); ao re-claimar (deadline do tick ou lease expirada),
 * o job roda só as lojas restantes.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/server"
import { AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { FigmaError } from "@/lib/integrations/figma/client"
import { getCampaignHandoff } from "@/lib/services/campaign-central/campaign-handoff.service"
import { importStoreEmailsFromFigma } from "@/lib/services/campaign-central/campaign-figma-import.service"
import {
  importCutModelImageFromFigma,
  type CutModelImportResult,
} from "@/lib/services/campaign-central/campaign-cut-model-import.service"
import type {
  FigmaImportResult,
  FigmaImportStoreResult,
} from "@/types/campaign-store-emails"

const log = logger.child("FigmaImportQueue")

// Orçamento de tempo de um tick (folga sob maxDuration=300). Com o pacing de
// ~7,5s/export, cabem ~30 exports individuais num tick.
const TICK_BUDGET_MS = Number(process.env.FIGMA_IMPORT_TICK_BUDGET_MS ?? 240_000)
// Lease: job tocado há menos disso está "em processamento" por outro tick.
// Precisa cobrir a pior espera de slot (75s) + downloads + folga.
const LEASE_MS = Number(process.env.FIGMA_IMPORT_LEASE_MS ?? 360_000)
// Tentativas top-level (erro retryável: 429/5xx/rede) antes de marcar failed.
const MAX_ATTEMPTS = Number(process.env.FIGMA_IMPORT_MAX_ATTEMPTS ?? 2)

export type FigmaImportJobKind = "store_emails" | "cut_model"
export type FigmaImportJobStatus = "pending" | "processing" | "done" | "failed"

export interface FigmaImportJobPayload {
  store_ids?: string[]
  figma_url?: string
}

export interface FigmaImportJobRow {
  id: string
  suggestion_id: string
  kind: FigmaImportJobKind
  org_id: string | null
  triggered_by: string | null
  payload: FigmaImportJobPayload
  status: FigmaImportJobStatus
  result: FigmaImportResult | CutModelImportResult | null
  progress_total: number
  progress_done: number
  attempts: number
  error: string | null
  created_at: string
  updated_at: string
  finished_at: string | null
}

export type EnqueueFigmaImportInput =
  | {
      kind: "store_emails"
      suggestionId: string
      orgId: string
      userId: string
      storeIds?: string[]
    }
  | { kind: "cut_model"; suggestionId: string; userId: string; figmaUrl: string }

export type EnqueueFigmaImportResult =
  | { ok: true; jobId: string; alreadyQueued: boolean }
  | { ok: false; reason: string }

/**
 * Enfileira um job de import. Dedup: 1 job ativo por (suggestion, kind) —
 * retry individual durante job ativo devolve o job existente e o modal
 * volta a fazer polling dele. Não toca a API do Figma aqui.
 */
export async function enqueueFigmaImportJob(
  input: EnqueueFigmaImportInput,
): Promise<EnqueueFigmaImportResult> {
  const admin = createAdminClient()

  const findActive = async (): Promise<string | null> => {
    const { data, error } = await admin
      .from("figma_import_jobs")
      .select("id")
      .eq("suggestion_id", input.suggestionId)
      .eq("kind", input.kind)
      .in("status", ["pending", "processing"])
      .limit(1)
    if (error) {
      log.error("enqueue.dedup_query_failed", {
        suggestionId: input.suggestionId,
        error: error.message,
      })
      return null
    }
    return (data ?? [])[0]?.id ?? null
  }

  const activeId = await findActive()
  if (activeId) {
    log.info("enqueue.dedup", { suggestionId: input.suggestionId, jobId: activeId })
    return { ok: true, jobId: activeId, alreadyQueued: true }
  }

  const row =
    input.kind === "store_emails"
      ? {
          suggestion_id: input.suggestionId,
          kind: input.kind,
          org_id: input.orgId,
          triggered_by: input.userId,
          payload: input.storeIds?.length ? { store_ids: input.storeIds } : {},
          status: "pending",
        }
      : {
          suggestion_id: input.suggestionId,
          kind: input.kind,
          org_id: null,
          triggered_by: input.userId,
          payload: { figma_url: input.figmaUrl },
          status: "pending",
          progress_total: 1,
        }

  const { data: job, error: insErr } = await admin
    .from("figma_import_jobs")
    .insert(row)
    .select("id")
    .single()

  if (insErr || !job) {
    // 23505 = unique_violation no uq_fij_one_active: outra aba/clique criou o
    // job ativo entre o dedup e o insert. Mesmo resultado — não é erro.
    if (insErr?.code === "23505") {
      const raceId = await findActive()
      log.info("enqueue.dedup_race", { suggestionId: input.suggestionId })
      if (raceId) return { ok: true, jobId: raceId, alreadyQueued: true }
      return { ok: false, reason: "enqueue_race_unresolved" }
    }
    log.error("enqueue.insert_failed", {
      suggestionId: input.suggestionId,
      error: insErr?.message,
    })
    return { ok: false, reason: "enqueue_failed" }
  }

  log.info("enqueue.ok", {
    suggestionId: input.suggestionId,
    kind: input.kind,
    jobId: job.id,
  })
  return { ok: true, jobId: job.id as string, alreadyQueued: false }
}

/** Busca um job PELA suggestion (autorização: o job pertence à task/campanha). */
export async function getFigmaImportJob(
  jobId: string,
  suggestionId: string,
): Promise<FigmaImportJobRow | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("figma_import_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("suggestion_id", suggestionId)
    .maybeSingle()
  if (error) {
    log.error("get_job.query_failed", { jobId, error: error.message })
    return null
  }
  return (data as FigmaImportJobRow | null) ?? null
}

/**
 * Claim otimista: marca o job como `processing` só se ninguém o tocou dentro
 * do LEASE. `.eq('updated_at', readVal)` garante que apenas 1 tick pega o job.
 */
async function claimNextJob(admin: SupabaseClient): Promise<FigmaImportJobRow | null> {
  const leaseThreshold = new Date(Date.now() - LEASE_MS).toISOString()
  const { data: candidates, error } = await admin
    .from("figma_import_jobs")
    .select("*")
    .in("status", ["pending", "processing"])
    .or(`status.eq.pending,updated_at.lt.${leaseThreshold}`)
    .order("created_at", { ascending: true })
    .limit(5)
  if (error) {
    log.error("claim.query_failed", { error: error.message })
    return null
  }
  for (const cand of (candidates ?? []) as FigmaImportJobRow[]) {
    const { data: claimed, error: claimErr } = await admin
      .from("figma_import_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", cand.id)
      .eq("updated_at", cand.updated_at) // optimistic lock
      .select("*")
      .maybeSingle()
    if (claimErr) {
      log.warn("claim.update_failed", { jobId: cand.id, error: claimErr.message })
      continue
    }
    if (claimed) return claimed as FigmaImportJobRow
    // else: outro tick pegou primeiro → tenta o próximo candidato
  }
  return null
}

/**
 * Erro permanente = 4xx que re-tentar não resolve (link inválido, arquivo com
 * N frames, sem acesso…). 429/5xx/rede são retryáveis (attempts).
 */
function isPermanentError(err: unknown): boolean {
  const status =
    err instanceof FigmaError
      ? err.status
      : err instanceof AppError
        ? err.statusCode
        : null
  return status !== null && status >= 400 && status < 500 && status !== 429
}

async function markFailed(
  admin: SupabaseClient,
  jobId: string,
  error: string,
): Promise<void> {
  await admin
    .from("figma_import_jobs")
    .update({
      status: "failed",
      error,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
}

/** Erro retryável: volta `pending` (attempts++) ou vira `failed` se esgotou. */
async function markRetryOrFailed(
  admin: SupabaseClient,
  job: FigmaImportJobRow,
  error: string,
): Promise<FigmaImportJobStatus> {
  const attempts = job.attempts + 1
  const exhausted = attempts >= MAX_ATTEMPTS
  await admin
    .from("figma_import_jobs")
    .update({
      status: exhausted ? "failed" : "pending",
      attempts,
      error,
      finished_at: exhausted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
  return exhausted ? "failed" : "pending"
}

function isStoreEmailsResult(
  result: FigmaImportJobRow["result"],
): result is FigmaImportResult {
  return Boolean(result && Array.isArray((result as FigmaImportResult).results))
}

/** Tela 2: import por loja com retomada + progresso parcial via heartbeat. */
async function processStoreEmailsJob(
  admin: SupabaseClient,
  job: FigmaImportJobRow,
  deadlineAt: number,
): Promise<FigmaImportJobStatus> {
  if (!job.org_id || !job.triggered_by) {
    await markFailed(
      admin,
      job.id,
      "Job sem org_id/triggered_by — enfileirado incorretamente",
    )
    return "failed"
  }

  // Alvos do JOB (payload) — o handoff dá a lista completa quando o payload
  // não restringe. Precisamos dela pra progress_total e pra retomada.
  const handoff = await getCampaignHandoff(job.suggestion_id, job.org_id)
  let targetIds = handoff.stores.map((s) => s.store_id)
  if (job.payload.store_ids?.length) {
    const wanted = new Set(job.payload.store_ids)
    targetIds = targetIds.filter((id) => wanted.has(id))
  }

  // Retomada: lojas já settladas em result.results não re-rodam.
  const settled = new Map<string, FigmaImportStoreResult>()
  const priorResult = isStoreEmailsResult(job.result) ? job.result : null
  for (const r of priorResult?.results ?? []) settled.set(r.store_id, r)
  const remaining = targetIds.filter((id) => !settled.has(id))

  const buildResult = (
    meta: Pick<FigmaImportResult, "file_key" | "frames_found" | "frame_names"> | null,
  ): FigmaImportResult => ({
    file_key: meta?.file_key ?? priorResult?.file_key ?? "",
    frames_found: meta?.frames_found ?? priorResult?.frames_found ?? 0,
    frame_names: meta?.frame_names ?? priorResult?.frame_names ?? [],
    results: targetIds
      .map((id) => settled.get(id))
      .filter((r): r is FigmaImportStoreResult => Boolean(r)),
  })

  if (remaining.length === 0) {
    // Órfão que morreu depois de settlar tudo e antes do update final.
    await admin
      .from("figma_import_jobs")
      .update({
        status: "done",
        result: buildResult(null),
        progress_total: targetIds.length,
        progress_done: settled.size,
        error: null,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
    return "done"
  }

  await admin
    .from("figma_import_jobs")
    .update({
      progress_total: targetIds.length,
      progress_done: settled.size,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)

  // Heartbeat por loja settlada: persiste progresso parcial (modal vê ao
  // vivo) e renova o lease — nenhuma loja é paga 2x se o tick morrer.
  const onStoreResult = async (r: FigmaImportStoreResult): Promise<void> => {
    settled.set(r.store_id, r)
    await admin
      .from("figma_import_jobs")
      .update({
        result: buildResult(null),
        progress_done: settled.size,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
  }

  const runResult = await importStoreEmailsFromFigma(
    job.suggestion_id,
    job.org_id,
    job.triggered_by,
    { storeIds: remaining, deadlineAt, onStoreResult },
  )

  // Belt-and-suspenders: o retorno é a fonte de verdade final — mescla por
  // cima do que o heartbeat já registrou (normalmente idêntico).
  for (const r of runResult.results) settled.set(r.store_id, r)

  const finalResult = buildResult(runResult)
  const allSettled = targetIds.every((id) => settled.has(id))

  await admin
    .from("figma_import_jobs")
    .update({
      // Não settlou tudo (deadline do tick) → volta `pending`: claimável já
      // no próximo tick, sem esperar a lease expirar.
      status: allSettled ? "done" : "pending",
      result: finalResult,
      progress_total: targetIds.length,
      progress_done: settled.size,
      error: null,
      finished_at: allSettled ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)

  return allSettled ? "done" : "pending"
}

/** Tela 1: export único do frame do corte modelo. */
async function processCutModelJob(
  admin: SupabaseClient,
  job: FigmaImportJobRow,
): Promise<FigmaImportJobStatus> {
  const figmaUrl = job.payload.figma_url
  if (!figmaUrl) {
    await markFailed(admin, job.id, "Job sem figma_url — enfileirado incorretamente")
    return "failed"
  }

  const result = await importCutModelImageFromFigma(job.suggestion_id, figmaUrl)
  await admin
    .from("figma_import_jobs")
    .update({
      status: "done",
      result,
      progress_total: 1,
      progress_done: 1,
      error: null,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
  return "done"
}

export interface ProcessSummary {
  claimed: number
  jobs: Array<{ jobId: string; kind: FigmaImportJobKind; status: FigmaImportJobStatus }>
}

/**
 * Processa a fila: enquanto houver orçamento de tempo no tick, claima o job
 * mais antigo e roda. O pacing de exports (8/min) é imposto pelo client do
 * Figma via acquireExportSlot — aqui só fatiamos o trabalho e persistimos.
 */
export async function processFigmaImportJobs(): Promise<ProcessSummary> {
  const admin = createAdminClient()
  const t0 = Date.now()
  const summary: ProcessSummary = { claimed: 0, jobs: [] }

  while (Date.now() - t0 < TICK_BUDGET_MS) {
    const job = await claimNextJob(admin)
    if (!job) break
    summary.claimed += 1

    const deadlineAt = t0 + TICK_BUDGET_MS
    let status: FigmaImportJobStatus
    try {
      status =
        job.kind === "cut_model"
          ? await processCutModelJob(admin, job)
          : await processStoreEmailsJob(admin, job, deadlineAt)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error("job.threw", { jobId: job.id, kind: job.kind, error: msg })
      status = isPermanentError(err)
        ? (await markFailed(admin, job.id, msg), "failed")
        : await markRetryOrFailed(admin, job, msg)
    }

    summary.jobs.push({ jobId: job.id, kind: job.kind, status })
    log.info("job.processed", { jobId: job.id, kind: job.kind, status })

    // Job voltou pending por deadline/retry: não re-claimar no MESMO tick
    // (deadline já estourou ou o erro tende a se repetir imediatamente).
    if (status === "pending") break
  }

  return summary
}
