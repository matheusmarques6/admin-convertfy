/**
 * GET /api/sse/stores/[id]/emails (Epic AE - Story AE-6)
 *
 * Server-Sent Events stream que emite:
 *   - 1x evento `snapshot` ao conectar (estado inicial)
 *   - Eventos `email_status_change` a cada 2s (polling email_status_events)
 *   - Eventos `ping` a cada 30s (heartbeat para detectar conexao morta)
 *
 * Runtime: nodejs (precisa de long-lived ReadableStream + setInterval).
 * Cleanup: request.signal.addEventListener('abort', ...) fecha intervals.
 *
 * Por que polling DB e nao pg LISTEN/NOTIFY ou Realtime?
 *   - Supabase serverless functions nao mantem conexoes pg dedicadas
 *   - Realtime via @supabase/supabase-js custaria 1 channel por cliente
 *   - Polling do email_status_events e simples, indexado
 *     (idx_ese_store_recent) e suficiente para volume atual
 *   - Latencia: ~2s no pior caso
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import type { EmailStatus } from "@/types/email-workspace"

const log = logger.child("EmailsSSE")

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const POLL_INTERVAL_MS = 2_000
const HEARTBEAT_INTERVAL_MS = 30_000

interface EmailSnapshotRow {
  id: string
  flow_id: string
  status: EmailStatus
  generation_batch_id: string | null
  ready_at: string | null
  failed_at: string | null
  failure_reason: string | null
}

interface StatusEventRow {
  id: number
  email_id: string
  flow_id: string | null
  from_status: string | null
  to_status: string
  batch_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: storeId } = await context.params

  // Auth (sai cedo se nao autenticado).
  const sb = await createClient()
  try {
    await requireAuth(sb)
  } catch {
    return new Response("Unauthorized", { status: 401 })
  }

  const admin = createAdminClient()

  // Snapshot inicial (emails da loja) + last event id observado.
  const [snapshotRes, lastEventRes] = await Promise.all([
    admin
      .from("email_flow_emails")
      .select(
        `id, flow_id, status, generation_batch_id, ready_at, failed_at, failure_reason,
         flow:email_flows!inner(store_id)`,
      )
      .eq("flow.store_id", storeId),
    admin
      .from("email_status_events")
      .select("id")
      .eq("store_id", storeId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const initialEmails: EmailSnapshotRow[] = ((snapshotRes.data as unknown[]) ?? []).map(
    (raw) => {
      const r = raw as Record<string, unknown>
      return {
        id: r.id as string,
        flow_id: r.flow_id as string,
        status: r.status as EmailStatus,
        generation_batch_id: (r.generation_batch_id as string | null) ?? null,
        ready_at: (r.ready_at as string | null) ?? null,
        failed_at: (r.failed_at as string | null) ?? null,
        failure_reason: (r.failure_reason as string | null) ?? null,
      }
    },
  )

  let lastEventId =
    ((lastEventRes.data as { id?: number } | null)?.id as number | undefined) ?? 0

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false

      const safeEnqueue = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch (err) {
          // Stream pode ter sido fechado entre o check e o enqueue.
          log.warn("enqueue failed (stream closed)", { err })
          closed = true
        }
      }

      const send = (event: string, data: unknown) => {
        safeEnqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }

      // 1) Snapshot inicial
      send("snapshot", { emails: initialEmails })

      // 2) Polling de email_status_events
      const pollInterval = setInterval(async () => {
        if (closed) return
        try {
          const { data, error } = await admin
            .from("email_status_events")
            .select(
              "id, email_id, flow_id, from_status, to_status, batch_id, metadata, created_at",
            )
            .eq("store_id", storeId)
            .gt("id", lastEventId)
            .order("id", { ascending: true })
            .limit(100)

          if (error) {
            log.warn("poll failed", { storeId, error: error.message })
            return
          }

          const rows = (data ?? []) as StatusEventRow[]
          for (const row of rows) {
            send("email_status_change", {
              event_id: row.id,
              email_id: row.email_id,
              flow_id: row.flow_id,
              from_status: row.from_status,
              status: row.to_status,
              batch_id: row.batch_id,
              failure_reason: (row.metadata?.failure_reason as string | null) ?? null,
              qa_issues_count:
                (row.metadata?.qa_issues_count as number | undefined) ?? 0,
              ts: row.created_at,
            })
            lastEventId = row.id
          }
        } catch (err) {
          log.error("poll exception", { storeId, err })
        }
      }, POLL_INTERVAL_MS)

      // 3) Heartbeat
      const heartbeatInterval = setInterval(() => {
        if (closed) return
        send("ping", { ts: Date.now() })
      }, HEARTBEAT_INTERVAL_MS)

      // 4) Cleanup on client disconnect
      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(pollInterval)
        clearInterval(heartbeatInterval)
        try {
          controller.close()
        } catch {
          // ja fechado
        }
      }

      request.signal.addEventListener("abort", cleanup)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
