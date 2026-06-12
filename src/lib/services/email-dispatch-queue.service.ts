/**
 * Email Dispatch Queue (fila + cron).
 *
 * O botão "Gerar copies (n8n)" enfileira um job aqui em vez de disparar
 * inline. Um cron (`/api/cron/email-dispatch-queue`, every minute) processa
 * o Montador+Blueprint (Architect) de cada email em lotes e, quando TODOS os
 * emails do job estão settled (reference gerada OU tentativas esgotadas →
 * fallback global), dispara pro n8n UMA vez via `dispatchEmailCopyWebhook`.
 *
 * Resolve o 504: o Architect (Opus, 60-180s/email × N emails) não cabe num
 * request; aqui ele roda fatiado ao longo de vários ticks do cron, sem teto.
 *
 * Tolerância a falha por email (pedido do produto): um email cujo Architect
 * falha repetidamente é marcado `failed` no job — NÃO bloqueia o dispatch; o
 * consumidor (`build-vars`/`blueprint-loader`) usa o template/blueprint global
 * que já funcionava. Só os emails que os agentes não geraram caem no global.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { seedDefaultFlows } from "@/lib/services/flow-seed.service"
import { generateBlueprintAndReference } from "@/lib/agents/architect/generate.service"
import { dispatchEmailCopyWebhook } from "@/lib/services/email-copy-webhook.service"

const log = logger.child("EmailDispatchQueue")

// Quantas tentativas de Architect por email antes de desistir (cai no global).
// Architect é caro — não insistir muito.
const MAX_ARCHITECT_ATTEMPTS = Number(process.env.DISPATCH_MAX_ARCHITECT_ATTEMPTS ?? 2)
// Emails gerados em paralelo por lote dentro de um tick.
const ARCHITECT_BATCH = Number(process.env.DISPATCH_ARCHITECT_BATCH ?? 4)
// Orçamento de tempo de um tick (deixa folga sob maxDuration=300).
const TICK_BUDGET_MS = Number(process.env.DISPATCH_TICK_BUDGET_MS ?? 240_000)
// Lease: um job tocado há menos disso é considerado "em processamento" por
// outro tick e não é reclamado (evita gerar o mesmo email 2x = $$).
const LEASE_MS = Number(process.env.DISPATCH_LEASE_MS ?? 180_000)

export type ArchitectStatus = "pending" | "done" | "failed"

export interface JobEmail {
  flow_type: string
  email_number: number
  architect: ArchitectStatus
  attempts: number
}

export interface EnqueueOptions {
  flowIds?: string[]
  onlyDrafts?: boolean
  triggerSource?: string
  triggeredBy?: string
}

export interface EnqueueResult {
  ok: boolean
  job_id?: string
  email_count?: number
  reason?: string
}

interface FlowRow {
  id: string
  flow_type: string
}

/**
 * Enfileira um job de disparo. Garante que os emails default existam
 * (auto-cura idempotente), resolve a lista de emails-alvo (respeitando
 * onlyDrafts) e insere o job `pending`. Não roda LLM aqui — só o cron roda.
 */
export async function enqueueDispatchJob(
  storeId: string,
  options: EnqueueOptions = {},
): Promise<EnqueueResult> {
  const admin = createAdminClient()
  const onlyDrafts = options.onlyDrafts ?? true

  // Auto-cura: garante 7 flows + 38 emails default (idempotente; só adiciona
  // o que falta). Resolve lojas onde o seed nunca rodou / emails apagados.
  try {
    await seedDefaultFlows(storeId, admin)
  } catch (err) {
    log.warn("enqueue.seed_failed", {
      storeId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Flows selecionados.
  let flowQuery = admin
    .from("email_flows")
    .select("id, flow_type")
    .eq("store_id", storeId)
  if (options.flowIds && options.flowIds.length > 0) {
    flowQuery = flowQuery.in("id", options.flowIds)
  }
  const { data: flowsData, error: flowErr } = await flowQuery
  if (flowErr) {
    log.error("enqueue.flows_query_failed", { storeId, error: flowErr.message })
    return { ok: false, reason: "flows_query_failed" }
  }
  const flows = (flowsData ?? []) as FlowRow[]
  if (flows.length === 0) return { ok: false, reason: "no_flows" }

  const flowTypeById = new Map(flows.map((f) => [f.id, f.flow_type]))
  const flowIds = flows.map((f) => f.id)

  // Emails-alvo (mesma semântica do dispatch: filtro de draft opcional).
  let emailsQuery = admin
    .from("email_flow_emails")
    .select("flow_id, number")
    .in("flow_id", flowIds)
  if (onlyDrafts) emailsQuery = emailsQuery.eq("status", "draft")
  const { data: emailsData, error: emailErr } = await emailsQuery
  if (emailErr) {
    log.error("enqueue.emails_query_failed", { storeId, error: emailErr.message })
    return { ok: false, reason: "emails_query_failed" }
  }
  const rows = (emailsData ?? []) as Array<{ flow_id: string; number: number }>

  if (rows.length === 0) {
    // Distingue "sem draft" de "sem email nenhum" (igual ao dispatch).
    if (onlyDrafts) {
      const { data: anyEmail } = await admin
        .from("email_flow_emails")
        .select("id")
        .in("flow_id", flowIds)
        .limit(1)
      if (anyEmail && anyEmail.length > 0) return { ok: false, reason: "no_draft_emails" }
    }
    return { ok: false, reason: "no_emails" }
  }

  const emails: JobEmail[] = rows
    .map((r): JobEmail | null => {
      const flowType = flowTypeById.get(r.flow_id)
      return flowType
        ? { flow_type: flowType, email_number: r.number, architect: "pending", attempts: 0 }
        : null
    })
    .filter((e): e is JobEmail => e !== null)

  const { data: job, error: insErr } = await admin
    .from("email_dispatch_jobs")
    .insert({
      store_id: storeId,
      flow_ids: options.flowIds && options.flowIds.length > 0 ? options.flowIds : null,
      only_drafts: onlyDrafts,
      trigger_source: options.triggerSource ?? "manual_store_button",
      triggered_by: options.triggeredBy ?? null,
      status: "pending",
      emails,
      architect_total: emails.length,
      architect_done: 0,
    })
    .select("id")
    .single()

  if (insErr || !job) {
    log.error("enqueue.insert_failed", { storeId, error: insErr?.message })
    return { ok: false, reason: "enqueue_failed" }
  }

  log.info("enqueue.ok", { storeId, jobId: job.id, emailCount: emails.length })
  return { ok: true, job_id: job.id as string, email_count: emails.length }
}

interface JobRow {
  id: string
  store_id: string
  flow_ids: string[] | null
  only_drafts: boolean
  trigger_source: string
  triggered_by: string | null
  status: string
  emails: JobEmail[]
  architect_total: number
  architect_done: number
  updated_at: string
}

/**
 * Claim otimista: marca o job como `generating` (heartbeat) só se ninguém o
 * tocou dentro do LEASE. `.eq('updated_at', readVal)` garante que apenas 1
 * tick pega o job (sem FOR UPDATE no PostgREST). Retorna o job ou null.
 */
async function claimNextJob(admin: SupabaseClient): Promise<JobRow | null> {
  const leaseThreshold = new Date(Date.now() - LEASE_MS).toISOString()
  const { data: candidates, error } = await admin
    .from("email_dispatch_jobs")
    .select("*")
    .in("status", ["pending", "generating", "dispatching"])
    .or(`status.eq.pending,updated_at.lt.${leaseThreshold}`)
    .order("created_at", { ascending: true })
    .limit(5)
  if (error) {
    log.error("claim.query_failed", { error: error.message })
    return null
  }
  for (const cand of (candidates ?? []) as JobRow[]) {
    const { data: claimed, error: claimErr } = await admin
      .from("email_dispatch_jobs")
      .update({ status: "generating", updated_at: new Date().toISOString() })
      .eq("id", cand.id)
      .eq("updated_at", cand.updated_at) // optimistic lock
      .select("*")
      .maybeSingle()
    if (claimErr) {
      log.warn("claim.update_failed", { jobId: cand.id, error: claimErr.message })
      continue
    }
    if (claimed) return claimed as JobRow
    // else: outro tick pegou primeiro → tenta o próximo candidato
  }
  return null
}

async function heartbeat(admin: SupabaseClient, job: JobRow): Promise<void> {
  await admin
    .from("email_dispatch_jobs")
    .update({
      emails: job.emails,
      architect_done: job.emails.filter((e) => e.architect === "done").length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
}

/** Roda o Architect de um email e devolve o novo status settled/pending. */
async function runArchitectForEmail(
  admin: SupabaseClient,
  job: JobRow,
  e: JobEmail,
): Promise<ArchitectStatus> {
  try {
    await generateBlueprintAndReference({
      storeId: job.store_id,
      flowType: e.flow_type,
      emailNumber: e.email_number,
      batchId: job.id,
      triggeredBy: job.triggered_by ?? undefined,
    })
  } catch (err) {
    log.warn("architect.threw", {
      jobId: job.id,
      flowType: e.flow_type,
      emailNumber: e.email_number,
      error: err instanceof Error ? err.message : String(err),
    })
  }
  // Settled = reference foi de fato persistida (Montador genuíno). Fallback
  // não persiste → ref ausente → conta tentativa; esgotou → 'failed' (global).
  const { data: ref } = await admin
    .from("store_email_references")
    .select("flow_type")
    .eq("store_id", job.store_id)
    .eq("flow_type", e.flow_type)
    .eq("email_number", e.email_number)
    .maybeSingle()
  if (ref) return "done"
  return e.attempts + 1 >= MAX_ARCHITECT_ATTEMPTS ? "failed" : "pending"
}

/**
 * Processa a fila: claim 1 job, roda o Architect dos emails pendentes em lotes
 * dentro do orçamento de tempo e, quando todos settled, dispara pro n8n.
 * Retorna um resumo pro telemetria do cron.
 */
export async function processDispatchJobs(): Promise<{
  claimed: boolean
  jobId?: string
  architectRan: number
  dispatched: boolean
  done: boolean
}> {
  const admin = createAdminClient()
  const t0 = Date.now()

  const job = await claimNextJob(admin)
  if (!job) return { claimed: false, architectRan: 0, dispatched: false, done: false }

  let architectRan = 0

  // Roda o Architect dos pendentes em lotes paralelos até esgotar ou estourar
  // o orçamento de tempo do tick.
  while (Date.now() - t0 < TICK_BUDGET_MS) {
    const pending = job.emails.filter((e) => e.architect === "pending")
    if (pending.length === 0) break

    const batch = pending.slice(0, ARCHITECT_BATCH)
    await Promise.all(
      batch.map(async (e) => {
        const next = await runArchitectForEmail(admin, job, e)
        e.attempts += 1
        e.architect = next
        architectRan += 1
      }),
    )
    await heartbeat(admin, job)
  }

  const allSettled = job.emails.every((e) => e.architect !== "pending")
  if (!allSettled) {
    // Ainda há pendentes (estourou o orçamento) — próximo tick continua.
    await admin
      .from("email_dispatch_jobs")
      .update({ status: "generating", updated_at: new Date().toISOString() })
      .eq("id", job.id)
    return { claimed: true, jobId: job.id, architectRan, dispatched: false, done: false }
  }

  // Todos settled → dispara pro n8n UMA vez. dispatchEmailCopyWebhook usa as
  // references/blueprints gerados + fallback global para os 'failed'.
  await admin
    .from("email_dispatch_jobs")
    .update({
      status: "dispatching",
      emails: job.emails,
      architect_done: job.emails.filter((e) => e.architect === "done").length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)

  let dispatchOk = false
  let dispatchReason: string | undefined
  try {
    const res = await dispatchEmailCopyWebhook(job.store_id, {
      triggerSource: "manual_store_button",
      flowIds: job.flow_ids ?? undefined,
      triggeredBy: job.triggered_by ?? undefined,
      onlyDrafts: job.only_drafts,
    })
    dispatchOk = res.ok
    dispatchReason = res.reason
  } catch (err) {
    dispatchReason = err instanceof Error ? err.message : String(err)
    log.error("dispatch.threw", { jobId: job.id, error: dispatchReason })
  }

  await admin
    .from("email_dispatch_jobs")
    .update({
      status: dispatchOk ? "done" : "failed",
      error: dispatchOk ? null : (dispatchReason ?? "dispatch_failed"),
      dispatched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)

  log.info("job.dispatched", {
    jobId: job.id,
    storeId: job.store_id,
    dispatchOk,
    architectDone: job.emails.filter((e) => e.architect === "done").length,
    architectFailed: job.emails.filter((e) => e.architect === "failed").length,
  })

  return { claimed: true, jobId: job.id, architectRan, dispatched: dispatchOk, done: true }
}
