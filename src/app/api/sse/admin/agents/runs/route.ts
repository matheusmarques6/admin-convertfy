/**
 * GET /api/sse/admin/agents/runs — SSE da live view de agentes (AE-9).
 *
 * Eventos:
 *   - `run_upsert` a cada 2s — runs de `email_generation_runs` com
 *     `updated_at > lastSeen`. Captura INSERT (agente ACIONADO, status
 *     'running') e UPDATE (transição pra success/error/skipped). O client
 *     faz upsert por id.
 *   - `pipeline` a cada 5s — visão do flow por loja (fila, dispatch job,
 *     emails por status, agentes rodando agora).
 *   - `ping` a cada 30s — heartbeat.
 *
 * Mesmo padrão de polling-DB do SSE da AE-6
 * (`/api/sse/stores/[id]/emails`): serverless não mantém conexão pg
 * dedicada, então nada de LISTEN/NOTIFY ou Realtime — o índice
 * `idx_gen_runs_updated` torna o poll barato.
 *
 * Query params: `store_id` (opcional) restringe os dois fluxos.
 * Auth: canManagePrompts (admin/owner OU tag 'dev').
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import {
  buildPipelineOverview,
  fetchRunsUpdatedAfter,
} from "@/lib/services/agent-runs-live.service"
import { logger } from "@/lib/logger"

const log = logger.child("AgentRunsSSE")

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const RUNS_POLL_INTERVAL_MS = 2_000
const PIPELINE_POLL_INTERVAL_MS = 5_000
const HEARTBEAT_INTERVAL_MS = 30_000

export async function GET(request: NextRequest) {
  // Auth (sai cedo se não autenticado/sem permissão).
  const sb = await createClient()
  let userId: string
  try {
    const user = await requireAuth(sb)
    userId = user.id
  } catch {
    return new Response("Unauthorized", { status: 401 })
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, tags")
    .eq("id", userId)
    .maybeSingle()
  const actor = {
    id: userId,
    role: (profile as { role?: string | null } | null)?.role ?? null,
    tags: ((profile as { tags?: string[] } | null)?.tags ?? []) as string[],
  }
  if (!canManagePrompts(actor)) {
    return new Response("Forbidden", { status: 403 })
  }

  const storeId = request.nextUrl.searchParams.get("store_id")

  // Overlap de 5s na conexão: o snapshot REST e o primeiro poll podem se
  // cruzar — o client dedup por id+updated_at, então repetição é inofensiva.
  let lastSeen = new Date(Date.now() - 5_000).toISOString()

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false

      const safeEnqueue = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch (err) {
          log.warn("enqueue failed (stream closed)", { err })
          closed = true
        }
      }

      const send = (event: string, data: unknown) => {
        safeEnqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }

      // 1) Polling de runs (INSERTs + UPDATEs via updated_at).
      const runsInterval = setInterval(async () => {
        if (closed) return
        try {
          const runs = await fetchRunsUpdatedAfter(lastSeen, storeId)
          for (const run of runs) {
            send("run_upsert", run)
            if (run.updated_at > lastSeen) lastSeen = run.updated_at
          }
        } catch (err) {
          log.error("runs poll exception", { err })
        }
      }, RUNS_POLL_INTERVAL_MS)

      // 2) Polling da visão de pipeline por loja.
      let pipelineInFlight = false
      const pipelineInterval = setInterval(async () => {
        if (closed || pipelineInFlight) return
        pipelineInFlight = true
        try {
          const stores = await buildPipelineOverview(storeId)
          send("pipeline", { generated_at: new Date().toISOString(), stores })
        } catch (err) {
          log.error("pipeline poll exception", { err })
        } finally {
          pipelineInFlight = false
        }
      }, PIPELINE_POLL_INTERVAL_MS)

      // 3) Heartbeat
      const heartbeatInterval = setInterval(() => {
        if (closed) return
        send("ping", { ts: Date.now() })
      }, HEARTBEAT_INTERVAL_MS)

      // Primeira visão de pipeline sem esperar 5s.
      void (async () => {
        try {
          const stores = await buildPipelineOverview(storeId)
          send("pipeline", { generated_at: new Date().toISOString(), stores })
        } catch (err) {
          log.error("pipeline initial exception", { err })
        }
      })()

      // 4) Cleanup on client disconnect
      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(runsInterval)
        clearInterval(pipelineInterval)
        clearInterval(heartbeatInterval)
        try {
          controller.close()
        } catch {
          // já fechado
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
