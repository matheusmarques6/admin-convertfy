/**
 * GET /api/admin/stores/[id]/emails (Epic AE - Story AE-6)
 *
 * Endpoint consolidado de leitura: retorna todos os emails da loja
 * enriquecidos com flow, blocks, timing, telemetria. Usado como:
 *   1. Snapshot inicial da pagina /admin/stores/[id]/emails
 *   2. Fallback de polling quando SSE falha (SWR 10s)
 *
 * Filtros via query string:
 *   - flow_id   : limita a um flow especifico
 *   - status    : EmailStatus (uma ou multiplas via ',')
 *   - batch_id  : limita a um batch de geracao
 *
 * Performance alvo: < 500ms para 50 emails (1 query JOIN + 1 stats rollup).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import type { EmailStatus, EmailBlock } from "@/types/email-workspace"
import type { QaIssue } from "@/types/email-generation"
import { logger } from "@/lib/logger"

const log = logger.child("StoreEmailsAPI")

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface EnrichedEmail {
  id: string
  flow_id: string
  flow_type: string
  flow_name: string
  number: number
  name: string
  status: EmailStatus
  subject: string | null
  preheader: string | null
  html: string | null
  blocks: EmailBlock[]
  timing: {
    copy_started_at: string | null
    copy_ready_at: string | null
    rendering_started_at: string | null
    qa_started_at: string | null
    ready_at: string | null
    failed_at: string | null
  }
  failure_reason: string | null
  qa_issues: QaIssue[]
  total_cost_cents: number
  attempts: number
  generation_batch_id: string | null
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { searchParams } = new URL(request.url)
    const flowIdFilter = searchParams.get("flow_id")
    const statusFilter = searchParams.get("status")
    const batchIdFilter = searchParams.get("batch_id")

    // 1) Carrega flows da loja (1 query)
    let flowsQ = admin
      .from("email_flows")
      .select("id, flow_type, name")
      .eq("store_id", storeId)
    if (flowIdFilter) flowsQ = flowsQ.eq("id", flowIdFilter)
    const { data: flows, error: flowsErr } = await flowsQ
    if (flowsErr) throw flowsErr

    const flowIds = (flows ?? []).map((f) => f.id as string)
    if (flowIds.length === 0) {
      return successResponse(request, {
        emails: [] as EnrichedEmail[],
        current_batch_id: null,
        stats: { total: 0, by_status: {}, pct_ready: 0 },
      })
    }

    // 2) Emails com blocks (1 query JOIN). Filtros opcionais.
    let emailsQ = admin
      .from("email_flow_emails")
      .select(
        `id, flow_id, number, name, status, subject, preheader, html,
         generation_batch_id, auto_phase2_relaxed, copy_started_at, copy_ready_at,
         rendering_started_at, qa_started_at, ready_at, failed_at,
         failure_reason, qa_issues, total_cost_cents, attempts,
         blocks:email_blocks(id, email_id, block_type, position, label, content, applied, applied_at, applied_by, created_at)`,
      )
      .in("flow_id", flowIds)
      .order("number", { ascending: true })

    if (statusFilter) {
      const parts = statusFilter.split(",").map((s) => s.trim()).filter(Boolean)
      if (parts.length === 1) emailsQ = emailsQ.eq("status", parts[0])
      else if (parts.length > 1) emailsQ = emailsQ.in("status", parts)
    }
    if (batchIdFilter) emailsQ = emailsQ.eq("generation_batch_id", batchIdFilter)

    const { data: emailsRaw, error: emailsErr } = await emailsQ
    if (emailsErr) throw emailsErr

    // Map flow_id -> {flow_type, flow_name}
    const flowMeta = new Map<string, { flow_type: string; flow_name: string }>()
    for (const f of flows ?? []) {
      flowMeta.set(f.id as string, {
        flow_type: (f.flow_type as string) ?? "custom",
        flow_name: (f.name as string) ?? "",
      })
    }

    const INTERMEDIATE: EmailStatus[] = [
      "pending",
      "copy_generating",
      "copy_generating_recovery",
      "copy_ready",
      "rendering",
      "qa_running",
    ]

    const emails: EnrichedEmail[] = (emailsRaw ?? []).map((e) => {
      const meta = flowMeta.get(e.flow_id as string)
      const blocks = (e.blocks as EmailBlock[] | null) ?? []
      // Sort blocks by position (Supabase nested select nao garante ordem)
      blocks.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      return {
        id: e.id as string,
        flow_id: e.flow_id as string,
        flow_type: meta?.flow_type ?? "custom",
        flow_name: meta?.flow_name ?? "",
        number: (e.number as number) ?? 0,
        name: (e.name as string) ?? "",
        status: (e.status as EmailStatus) ?? "draft",
        subject: (e.subject as string | null) ?? null,
        preheader: (e.preheader as string | null) ?? null,
        html: (e.html as string | null) ?? null,
        blocks,
        timing: {
          copy_started_at: (e.copy_started_at as string | null) ?? null,
          copy_ready_at: (e.copy_ready_at as string | null) ?? null,
          rendering_started_at: (e.rendering_started_at as string | null) ?? null,
          qa_started_at: (e.qa_started_at as string | null) ?? null,
          ready_at: (e.ready_at as string | null) ?? null,
          failed_at: (e.failed_at as string | null) ?? null,
        },
        failure_reason: (e.failure_reason as string | null) ?? null,
        qa_issues: ((e.qa_issues as QaIssue[] | null) ?? []) as QaIssue[],
        total_cost_cents: (e.total_cost_cents as number) ?? 0,
        attempts: (e.attempts as number) ?? 0,
        generation_batch_id: (e.generation_batch_id as string | null) ?? null,
      }
    })

    // 3) Stats rollup
    const by_status: Record<string, number> = {}
    let readyCount = 0
    let currentBatchId: string | null = null
    for (const e of emails) {
      by_status[e.status] = (by_status[e.status] ?? 0) + 1
      if (e.status === "ready") readyCount++
      if (
        e.generation_batch_id &&
        INTERMEDIATE.includes(e.status) &&
        (currentBatchId === null || e.generation_batch_id > currentBatchId)
      ) {
        currentBatchId = e.generation_batch_id
      }
    }
    const total = emails.length
    const pct_ready = total > 0 ? Math.round((readyCount / total) * 100) : 0

    return successResponse(request, {
      emails,
      current_batch_id: currentBatchId,
      stats: { total, by_status, pct_ready },
    })
  } catch (error) {
    log.error("emails endpoint failed", { error })
    return errorResponse(request, error, "StoreEmailsAPI")
  }
}
