/**
 * GET /api/sse/admin/agents/executions — tempo real da aba Execuções do
 * Estúdio de Agentes.
 *
 * Eventos:
 *   - `execution_upsert` — uma execução que MEXEU (status do e-mail ou run
 *     de agente). O cliente faz upsert por `email_id`.
 *   - `ping` a cada 30s — heartbeat.
 *
 * ── O laço, e por que ele é de duas perguntas ─────────────────────────
 *
 * A cada 2s pergunta ao banco "mexeu algo desde X?" (delta barato, só
 * ids); só quando a resposta é não-vazia é que monta o payload das
 * execuções mexidas. Conexão ociosa: duas varreduras de índice a cada 2s e
 * ZERO byte no cliente. Sem isso — repetindo a listagem de 2 em 2s — a
 * query cai num OR que o índice parcial de `updated_at` não serve, que é o
 * padrão que custou 372 min de CPU no incidente do inbox (as cinco regras
 * estão em CLAUDE.md, "Inbox — recuperação de custo no banco").
 *
 * O agente acende no canvas no INSTANTE em que começa: o
 * `startGenerationRun` grava a linha com status 'running' antes de
 * invocar o modelo, e a perna 3 do delta enxerga esse INSERT. O que não
 * existe é progresso DENTRO do step — uma chamada de LLM não reporta nada
 * entre o começo e o fim, então o nó fica "rodando" por 30–240s sem
 * fração. Inventar barra ali seria fingir medida.
 *
 * Mesmo padrão de polling-DB do SSE de runs (`/api/sse/admin/agents/runs`)
 * e do de e-mails (AE-6): serverless não mantém conexão pg dedicada, então
 * nada de LISTEN/NOTIFY.
 *
 * Auth: canManagePrompts (admin/owner OU tag 'dev').
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import {
  fetchAgentExecutions,
  fetchChangedExecutionIds,
} from "@/lib/services/agent-executions.service"
import { logger } from "@/lib/logger"

const log = logger.child("AgentExecutionsSSE")

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DELTA_POLL_INTERVAL_MS = 2_000
const HEARTBEAT_INTERVAL_MS = 30_000
/** Teto por tick: um lote grande é sinal de fila destravando, não de uso. */
const MAX_PER_TICK = 20

export async function GET(request: NextRequest) {
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

  // Overlap de 5s: o snapshot REST do cliente e o primeiro delta podem se
  // cruzar. O cliente faz upsert por id e ignora payload mais velho, então
  // repetição é inofensiva — perder um evento não é.
  let lastSeen = new Date(Date.now() - 5_000).toISOString()

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let inFlight = false

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

      const tick = async () => {
        if (closed || inFlight) return
        inFlight = true
        try {
          const changed = await fetchChangedExecutionIds(lastSeen)
          if (changed.length === 0) return

          // O delta vem em ordem CRESCENTE, então o teto corta os mais
          // novos e o cursor avança só até o que foi de fato enviado — a
          // volta seguinte pega o resto. Avançar pelo maior visto (e não
          // pelo maior enviado) descartaria o excedente para sempre.
          const lote = changed.slice(0, MAX_PER_TICK)
          if (changed.length > MAX_PER_TICK) {
            log.info("delta lote cortado, resto na volta seguinte", {
              total: changed.length,
              enviados: lote.length,
            })
          }

          const execucoes = await fetchAgentExecutions({
            emailIds: lote.map((c) => c.emailId),
          })
          for (const exec of execucoes) send("execution_upsert", exec)

          // -1ms porque o delta compara com `>`: duas mudanças no MESMO
          // milissegundo, uma de cada lado do corte, fariam a segunda cair
          // atrás do cursor. Reenviar é inofensivo (o upsert do cliente é
          // idempotente); perder não é.
          const maiorEnviado = lote.reduce(
            (max, c) => (c.changedAt > max ? c.changedAt : max),
            lastSeen,
          )
          if (maiorEnviado > lastSeen) {
            lastSeen = new Date(
              new Date(maiorEnviado).getTime() - 1,
            ).toISOString()
          }
        } catch (err) {
          // Erro de poll não fecha o stream: a próxima volta tenta de novo
          // com o MESMO cursor, então nada é perdido.
          log.error("executions delta poll exception", { err })
        } finally {
          inFlight = false
        }
      }

      const deltaInterval = setInterval(() => void tick(), DELTA_POLL_INTERVAL_MS)
      const heartbeatInterval = setInterval(() => {
        if (closed) return
        send("ping", { ts: Date.now() })
      }, HEARTBEAT_INTERVAL_MS)

      // Primeira volta sem esperar 2s.
      void tick()

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(deltaInterval)
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
