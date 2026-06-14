/**
 * POST /api/webhooks/n8n/campaign-copy
 *
 * Callback streaming do n8n para geração de copy de campanha por loja.
 * Para cada loja na lista do job, o n8n chama esse endpoint uma vez
 * com o resultado (success: copy completa | error: mensagem).
 *
 * Idempotência:
 *  - Callback com status='success' e existe entry com quality='good' -> no-op.
 *    Preserva copy aprovada manualmente pelo COO.
 *  - Re-callback após erro: sobrescreve normalmente (recovery).
 *
 * Update concorrente:
 *  - Re-lê campaign_suggestions.copy_results antes de cada merge — mesmo
 *    padrão de generateCampaignCopy:429 — pra não perder writes de callbacks
 *    paralelos do n8n (cada loja em request separado).
 *
 * Job tracking:
 *  - Incrementa campaign_copy_jobs.completed_count (success) ou failed_count.
 *  - Quando completed+failed == stores_count -> status='done'.
 */

import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import {
  errorResponse,
  successResponse,
  AppError,
  NotFoundError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { campaignCopyCallbackSchema } from "@/lib/validations/campaign-central"
import { newBlockId } from "@/components/campaign-central/email-builder/default-draft"
import type { CampaignSuggestion, CopyResultEntry } from "@/types/campaign-central"

const log = logger.child("N8nCampaignCopy")

export const dynamic = "force-dynamic"

interface JobRow {
  id: string
  suggestion_id: string
  org_id: string
  mode: "test" | "production"
  stores_count: number
  completed_count: number
  failed_count: number
  status: string
}

export async function POST(request: NextRequest) {
  // Body bruto antes de validar — qualquer rejeição (secret/schema) deixa
  // rastro do que o n8n mandou. Espelha o pattern do email-copy callback.
  const rawText = await request.text().catch(() => "")
  let rawJson: Record<string, unknown> = {}
  try {
    rawJson = JSON.parse(rawText) as Record<string, unknown>
  } catch {
    /* corpo não-JSON */
  }
  log.info("campaign_copy.received", {
    has_secret_header: !!request.headers.get("x-webhook-secret"),
    body_keys: Object.keys(rawJson),
    job_id: rawJson.job_id ?? null,
    store_id: rawJson.store_id ?? null,
    status: rawJson.status ?? null,
    raw_len: rawText.length,
  })

  try {
    requireWebhookSecret(request)

    const validated = campaignCopyCallbackSchema.safeParse(rawJson)
    if (!validated.success) {
      log.warn("campaign_copy.validation_failed", {
        job_id: rawJson.job_id ?? null,
        store_id: rawJson.store_id ?? null,
        issues: validated.error.issues.slice(0, 8),
      })
      throw new AppError("Payload do n8n inválido (schema campaign-copy)", 400)
    }
    const body = validated.data

    if (body.status === "success" && !body.copy) {
      throw new AppError("status=success exige campo copy", 400)
    }

    const admin = createAdminClient()

    // 1) Job + suggestion existem e estão consistentes
    const { data: job, error: jobErr } = await admin
      .from("campaign_copy_jobs")
      .select("id, suggestion_id, org_id, mode, stores_count, completed_count, failed_count, status")
      .eq("id", body.job_id)
      .maybeSingle<JobRow>()

    if (jobErr || !job) {
      log.warn("campaign_copy.job_not_found", {
        job_id: body.job_id,
        db_error: jobErr?.message ?? null,
      })
      throw new NotFoundError("Job de copy de campanha")
    }

    if (job.suggestion_id !== body.suggestion_id) {
      log.warn("campaign_copy.job_mismatch", {
        job_id: body.job_id,
        body_suggestion_id: body.suggestion_id,
        job_suggestion_id: job.suggestion_id,
      })
      throw new AppError("suggestion_id não bate com o job", 400)
    }

    if (job.mode !== body.mode) {
      throw new AppError("mode não bate com o job", 400)
    }

    // 1.5) Se o job já caiu no fallback inline (watchdog promoveu), descarta
    //      o callback. O inline ja gravou copy_results pras lojas pendentes —
    //      escrever em cima criaria race com o run inline ainda em voo.
    if (job.status === "fallback_inline" || job.status === "done") {
      log.info("campaign_copy.skip_inactive_job", {
        job_id: body.job_id,
        store_id: body.store_id,
        job_status: job.status,
      })
      return successResponse(request, {
        idempotent: true,
        reason: `job_${job.status}`,
      })
    }

    // 2) Re-lê copy_results pra merge consistente (writes concorrentes do
    //    n8n em paralelo — uma loja por callback).
    const { data: fresh, error: freshErr } = await admin
      .from("campaign_suggestions")
      .select("copy_results")
      .eq("id", body.suggestion_id)
      .eq("org_id", job.org_id)
      .maybeSingle()

    if (freshErr || !fresh) {
      throw new NotFoundError("Sugestão da campanha")
    }

    const copyResults = (fresh.copy_results ?? {}) as CampaignSuggestion["copy_results"]
    const modeResults = copyResults[body.mode] ?? {}
    const prevEntry = modeResults[body.store_id] as CopyResultEntry | undefined

    // 3) Idempotência: copy aprovada (quality='good') NÃO é sobrescrita.
    //    Cobre o caso de callback duplicado depois do COO ter marcado "Boa".
    if (body.status === "success" && prevEntry?.quality === "good") {
      log.info("campaign_copy.skip_approved", {
        job_id: body.job_id,
        store_id: body.store_id,
        mode: body.mode,
      })
      return successResponse(request, {
        idempotent: true,
        reason: "approved_copy_preserved",
      })
    }

    // 4) Monta nova entry
    const nowIso = new Date().toISOString()
    let newEntry: CopyResultEntry
    let jobFieldDelta: { completed_count?: number; failed_count?: number }

    if (body.status === "success") {
      const copy = body.copy!
      const blocks = copy.blocks.map((b) => ({ ...b, id: b.id ?? newBlockId() }))
      newEntry = {
        subject: copy.subject,
        preview: copy.preheader,
        preheader: copy.preheader,
        strategy: copy.strategy,
        blocks,
        quality: prevEntry?.quality ?? null,
        generated_at: nowIso,
        generated_via: "n8n",
        status: "success",
        dispatched_at: prevEntry?.dispatched_at,
      }
      jobFieldDelta = { completed_count: job.completed_count + 1 }
    } else {
      newEntry = {
        ...prevEntry,
        subject: prevEntry?.subject ?? "",
        preview: prevEntry?.preview ?? "",
        quality: prevEntry?.quality ?? null,
        generated_at: nowIso,
        generated_via: "n8n",
        status: "error",
        error_message: body.error_message ?? "Erro reportado pelo n8n sem mensagem",
        dispatched_at: prevEntry?.dispatched_at,
      }
      jobFieldDelta = { failed_count: job.failed_count + 1 }
    }

    // 5) Merge + UPDATE da suggestion
    const merged: CampaignSuggestion["copy_results"] = {
      ...copyResults,
      [body.mode]: { ...modeResults, [body.store_id]: newEntry },
    }

    const { error: updErr } = await admin
      .from("campaign_suggestions")
      .update({ copy_results: merged })
      .eq("id", body.suggestion_id)
    if (updErr) throw updErr

    // 6) Atualiza job + marca como done se já bateu todas as lojas
    const newCompleted = jobFieldDelta.completed_count ?? job.completed_count
    const newFailed = jobFieldDelta.failed_count ?? job.failed_count
    const finished = newCompleted + newFailed >= job.stores_count
    const newStatus = finished ? "done" : "running"

    const jobUpdate: Record<string, unknown> = {
      completed_count: newCompleted,
      failed_count: newFailed,
      status: newStatus,
      updated_at: nowIso,
    }
    if (finished) jobUpdate.done_at = nowIso

    const { error: jobUpdErr } = await admin
      .from("campaign_copy_jobs")
      .update(jobUpdate)
      .eq("id", body.job_id)
    if (jobUpdErr) {
      log.warn("campaign_copy.job_update_failed", {
        job_id: body.job_id,
        error: jobUpdErr.message,
      })
    }

    // 7) Telemetria — campaign_ai_runs (kind='copy', model='n8n')
    const aiRunInsert = await admin.from("campaign_ai_runs").insert({
      org_id: job.org_id,
      suggestion_id: body.suggestion_id,
      kind: "copy",
      model: body.meta?.model ?? "n8n",
      status: body.status === "success" ? "completed" : "failed",
      input_vars: {
        store_id: body.store_id,
        mode: body.mode,
        job_id: body.job_id,
      },
      parsed_output: body.status === "success" ? newEntry : null,
      error_message: body.status === "error" ? newEntry.error_message : null,
      tokens_input: body.meta?.tokens_input ?? 0,
      tokens_output: body.meta?.tokens_output ?? 0,
      duration_ms: body.meta?.duration_ms ?? null,
    })
    if (aiRunInsert.error) {
      log.warn("campaign_copy.ai_run_insert_failed", {
        job_id: body.job_id,
        error: aiRunInsert.error.message,
      })
    }

    log.info("campaign_copy.persisted", {
      job_id: body.job_id,
      store_id: body.store_id,
      mode: body.mode,
      status: body.status,
      completed: newCompleted,
      failed: newFailed,
      total: job.stores_count,
      job_status: newStatus,
    })

    return successResponse(request, {
      ok: true,
      job_id: body.job_id,
      store_id: body.store_id,
      job_status: newStatus,
    })
  } catch (e) {
    return errorResponse(request, e, "n8n:campaign-copy")
  }
}
