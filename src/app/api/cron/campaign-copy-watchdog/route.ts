/**
 * Vercel Cron — Campaign Copy Watchdog
 *
 * Schedule: every 5 minutes (vercel.json).
 *
 * Detecta jobs em campaign_copy_jobs travados (dispatch falhou OU n8n
 * silencioso por mais de WATCHDOG_CAMPAIGN_COPY_TIMEOUT_MIN, default 10min)
 * e promove pra fallback inline:
 *
 *  1. Marca status='fallback_inline', fallback_at=NOW().
 *  2. Re-le copy_results pra identificar lojas ainda com status='pending'.
 *  3. Roda generateCampaignCopy() inline pras lojas pendentes (Anthropic
 *     direto, mesmo prompt do caminho manual original).
 *  4. Marca generated_via='inline_fallback' — distingue nas metricas.
 *  5. Marca job.done_at = NOW() quando termina o batch.
 *
 * Cap: max WATCHDOG_CAMPAIGN_COPY_BATCH (default 5) jobs por execucao pra
 * nao criar tempestade caso o n8n caia em massa.
 *
 * Concorrencia: UPDATE atomico WHERE status IN ('dispatched','running','failed')
 * pra claimar o job — se outro cron pegou primeiro, o nosso vê 0 rows e segue.
 * Quando o job esta 'fallback_inline', o callback do n8n NAO escreve mais
 * (guard em /webhooks/n8n/campaign-copy:104) — evita race write-write.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { generateCampaignCopy } from "@/lib/services/campaign-central/campaign-copy.service"
import { logger } from "@/lib/logger"
import type { CampaignSuggestion, CopyResultEntry } from "@/types/campaign-central"

const log = logger.child("CampaignCopyWatchdog")

export const dynamic = "force-dynamic"
export const maxDuration = 300

const TIMEOUT_MIN = Number(process.env.WATCHDOG_CAMPAIGN_COPY_TIMEOUT_MIN ?? 10)
const MAX_BATCH = Number(process.env.WATCHDOG_CAMPAIGN_COPY_BATCH ?? 5)

interface JobRow {
  id: string
  suggestion_id: string
  org_id: string
  mode: "test" | "production"
  store_ids: string[]
  stores_count: number
  status: string
  updated_at: string
}

interface RunSummary {
  jobs_claimed: number
  jobs_recovered: number
  jobs_failed: number
  total_stores_inline: number
  duration_ms: number
  error?: string
}

export async function GET(request: NextRequest) {
  const t0 = Date.now()
  const authError = requireCronAuth(request)
  if (authError) return authError

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - TIMEOUT_MIN * 60_000).toISOString()

  const summary: RunSummary = {
    jobs_claimed: 0,
    jobs_recovered: 0,
    jobs_failed: 0,
    total_stores_inline: 0,
    duration_ms: 0,
  }

  try {
    // 1) Busca jobs candidatos (dispatched/running/failed parados ha > cutoff)
    const { data: candidates, error: selErr } = await admin
      .from("campaign_copy_jobs")
      .select("id, suggestion_id, org_id, mode, store_ids, stores_count, status, updated_at")
      .in("status", ["dispatched", "running", "failed"])
      .lt("updated_at", cutoff)
      .order("updated_at", { ascending: true })
      .limit(MAX_BATCH)

    if (selErr) {
      summary.error = `select_failed: ${selErr.message}`
      log.error("watchdog.select.error", { error: selErr.message })
    }

    const jobs = (candidates ?? []) as JobRow[]
    log.info("watchdog.tick", {
      cutoff,
      candidates: jobs.length,
      cap: MAX_BATCH,
    })

    // 2) Pra cada job: claima atomicamente -> roda inline -> finaliza
    for (const job of jobs) {
      // Claim atomico: so 1 cron pode promover esse job pra fallback_inline
      const claimRes = await admin
        .from("campaign_copy_jobs")
        .update({
          status: "fallback_inline",
          fallback_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .in("status", ["dispatched", "running", "failed"])
        .select("id")

      if (claimRes.error || !claimRes.data || claimRes.data.length === 0) {
        log.info("watchdog.claim.skip", {
          job_id: job.id,
          reason: claimRes.error?.message ?? "already_claimed",
        })
        continue
      }
      summary.jobs_claimed++

      // Re-le copy_results da suggestion pra identificar lojas pendentes
      const { data: sugRow } = await admin
        .from("campaign_suggestions")
        .select("copy_results")
        .eq("id", job.suggestion_id)
        .maybeSingle()

      const copyResults = (sugRow?.copy_results ?? {}) as CampaignSuggestion["copy_results"]
      const modeResults = (copyResults[job.mode] ?? {}) as Record<string, CopyResultEntry>
      const pendingIds = job.store_ids.filter(
        (id) => (modeResults[id]?.status ?? "pending") === "pending",
      )

      if (pendingIds.length === 0) {
        // Nada a recuperar — marca como done. Edge case: callback chegou
        // entre o select e o claim.
        await admin
          .from("campaign_copy_jobs")
          .update({
            status: "done",
            done_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
        log.info("watchdog.nothing_pending", { job_id: job.id })
        continue
      }

      log.info("watchdog.inline.start", {
        job_id: job.id,
        suggestion_id: job.suggestion_id,
        mode: job.mode,
        pending: pendingIds.length,
        of: job.stores_count,
      })

      try {
        const result = await generateCampaignCopy({
          suggestionId: job.suggestion_id,
          orgId: job.org_id,
          mode: job.mode,
          storeIds: pendingIds,
          generatedVia: "inline_fallback",
        })

        const generated = Object.keys(result.results).length
        const failed = Object.keys(result.errors).length
        summary.jobs_recovered++
        summary.total_stores_inline += pendingIds.length

        await admin
          .from("campaign_copy_jobs")
          .update({
            completed_count: generated,
            failed_count: failed,
            status: "done",
            done_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)

        log.info("watchdog.inline.done", {
          job_id: job.id,
          generated,
          failed,
        })
      } catch (err) {
        summary.jobs_failed++
        const msg = err instanceof Error ? err.message : String(err)
        await admin
          .from("campaign_copy_jobs")
          .update({
            status: "failed",
            dispatch_error: `inline_fallback_failed: ${msg.slice(0, 200)}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
        log.error("watchdog.inline.error", { job_id: job.id, error: msg })
      }
    }

    summary.duration_ms = Date.now() - t0
    log.info("watchdog.summary", summary)
    return NextResponse.json(summary)
  } catch (err) {
    summary.error = err instanceof Error ? err.message : String(err)
    summary.duration_ms = Date.now() - t0
    log.error("watchdog.fatal", { error: summary.error })
    return NextResponse.json(summary, { status: 500 })
  }
}
