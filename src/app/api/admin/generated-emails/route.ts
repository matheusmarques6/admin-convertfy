/**
 * Listagem global de emails gerados pelo pipeline AE (aba Geradas).
 *
 * GET: emails de `email_flow_emails` que passaram pelo pipeline
 * (generation_batch_id preenchido), mais recentes primeiro, com loja,
 * flow, status agrupado em bucket, contagem de blocos e custo.
 * Filtros: ?store_id= , ?status=success|error|running , ?limit=.
 */
import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("GeneratedEmails")

export const dynamic = "force-dynamic"

export type GeneratedStatusBucket = "success" | "error" | "running"

const SUCCESS_STATUSES = ["ready", "approved", "live"]
const ERROR_STATUSES = ["failed"]
const RUNNING_STATUSES = [
  "draft",
  "in_progress",
  "pending",
  "copy_generating",
  "copy_generating_recovery",
  "copy_ready",
  "rendering",
  "image_done",
  "qa_running",
]

function bucketOf(status: string): GeneratedStatusBucket {
  if (SUCCESS_STATUSES.includes(status)) return "success"
  if (ERROR_STATUSES.includes(status)) return "error"
  return "running"
}

interface RawRow {
  id: string
  number: number
  name: string | null
  subject: string | null
  status: string
  total_cost_cents: number | null
  generation_batch_id: string | null
  ready_at: string | null
  failed_at: string | null
  updated_at: string
  flow: {
    id: string
    flow_type: string
    store_id: string
    store: { id: string; store_name: string | null } | null
  } | null
  blocks: Array<{ count: number }> | null
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const storeId = sp.get("store_id")
    const statusBucket = sp.get("status") as GeneratedStatusBucket | null
    const limit = Math.min(
      Math.max(parseInt(sp.get("limit") ?? "100", 10) || 100, 1),
      200,
    )

    let query = admin
      .from("email_flow_emails")
      .select(
        `id, number, name, subject, status, total_cost_cents,
         generation_batch_id, ready_at, failed_at, updated_at,
         flow:email_flows!inner(id, flow_type, store_id,
           store:client_stores!inner(id, store_name)),
         blocks:email_blocks(count)`,
      )
      .not("generation_batch_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(limit)

    if (storeId) query = query.eq("flow.store_id", storeId)
    if (statusBucket === "success") query = query.in("status", SUCCESS_STATUSES)
    else if (statusBucket === "error") query = query.in("status", ERROR_STATUSES)
    else if (statusBucket === "running")
      query = query.in("status", RUNNING_STATUSES)

    const { data, error } = await query
    if (error) throw error

    const items = ((data as unknown as RawRow[]) ?? []).map((r) => ({
      email_id: r.id,
      email_number: r.number,
      email_name: r.name,
      subject: r.subject,
      status: r.status,
      status_bucket: bucketOf(r.status),
      cost_cents: r.total_cost_cents ?? 0,
      batch_id: r.generation_batch_id,
      store_id: r.flow?.store_id ?? null,
      store_name: r.flow?.store?.store_name ?? "—",
      flow_type: r.flow?.flow_type ?? "—",
      blocks_count: r.blocks?.[0]?.count ?? 0,
      when: r.ready_at ?? r.failed_at ?? r.updated_at,
    }))

    return successResponse(request, { items })
  } catch (error) {
    log.error("generated-emails.get", error)
    return errorResponse(request, error, "generated-emails-get")
  }
}
