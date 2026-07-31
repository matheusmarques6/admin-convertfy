/**
 * Importação do histórico do WhatsApp (Evolution / QR).
 *
 * Modelo PULL: o histórico entregue pelo WhatsApp no pareamento fica no
 * banco da Evolution (DATABASE_SAVE_DATA_HISTORIC); aqui lemos de lá em
 * páginas. Nada nesta rotina fala com o WhatsApp — é HTTP entre nossos
 * servidores, então o volume não altera o risco de banimento.
 *
 * O job carrega o próprio cursor (conversa + página). Cada execução
 * trabalha por um budget de tempo e devolve o controle; a próxima
 * retoma exatamente de onde parou. Timeout ou crash custam uma página.
 *
 * Ver docs/crm/whatsapp-history-sync-plano.md.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { createEvolutionClient, type EvolutionAPI } from "@/lib/whatsapp/evolution-api"
import { getEvolutionRuntimeConfig } from "@/lib/whatsapp/evolution-settings"
import { handleEvolutionMessage } from "@/lib/whatsapp/evolution-processor"
import { shouldSkipRemoteJid } from "@/lib/whatsapp/evolution-content"
import { logger } from "@/lib/logger"

const log = logger.child("CrmHistoryImport")

/** Página pequena: cabe no budget e limita o estrago de um erro. */
const PAGE_SIZE = 100

/** Sai antes do teto da rota (maxDuration 300) para salvar o cursor. */
export const DEFAULT_BUDGET_MS = 240_000

export interface HistoryImportJob {
  id: string
  org_id: string
  channel_id: string
  mode: "dry_run" | "import"
  status: "pending" | "running" | "paused" | "completed" | "failed"
  since_days: number | null
  include_media: boolean
  chats: string[]
  chats_total: number
  cursor_chat_index: number
  cursor_page: number
  messages_seen: number
  messages_imported: number
  messages_skipped: number
}

interface ChannelRow {
  id: string
  org_id: string
  external_id: string
  config: Record<string, unknown> | null
}

export interface RunResult {
  status: HistoryImportJob["status"]
  chats_done: number
  chats_total: number
  messages_seen: number
  messages_imported: number
  messages_skipped: number
  exhausted_budget: boolean
}

const JOB_COLUMNS =
  "id, org_id, channel_id, mode, status, since_days, include_media, chats, chats_total, cursor_chat_index, cursor_page, messages_seen, messages_imported, messages_skipped"

/**
 * Um worker morto deixa o job em 'running' para sempre. Passado este
 * tempo sem heartbeat (last_progress_at), outra execução pode assumir.
 * Maior que o maxDuration da rota, senão duas execuções vivas brigam
 * pelo mesmo job.
 */
const STALE_MS = 360_000

/**
 * Claim atômico. O cron dispara a cada minuto e uma execução dura
 * minutos: sem isto, várias pegariam o mesmo job e avançariam o cursor
 * por cima uma da outra. O UPDATE condicional resolve — quem perde a
 * corrida recebe zero linhas.
 */
async function tryClaim(
  admin: SupabaseClient,
  id: string,
  expected: "pending" | "running",
  staleIso: string,
): Promise<HistoryImportJob | null> {
  let q = admin
    .from("crm_history_import_jobs")
    .update({ status: "running", last_progress_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", expected)

  // Retomada de órfão: só vale se o heartbeat continua velho no momento
  // do UPDATE — é o que impede dois crons de assumirem o mesmo órfão.
  if (expected === "running") q = q.lt("last_progress_at", staleIso)

  const { data } = await q.select(JOB_COLUMNS).maybeSingle<HistoryImportJob>()
  return data ?? null
}

/** Job novo primeiro; depois órfão de worker morto. Nunca 'paused'. */
export async function claimNextJob(admin: SupabaseClient): Promise<HistoryImportJob | null> {
  const staleIso = new Date(Date.now() - STALE_MS).toISOString()

  const { data: pending } = await admin
    .from("crm_history_import_jobs")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (pending) {
    const claimed = await tryClaim(admin, pending.id, "pending", staleIso)
    if (claimed) return claimed
  }

  const { data: orphan } = await admin
    .from("crm_history_import_jobs")
    .select("id")
    .eq("status", "running")
    .lt("last_progress_at", staleIso)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (orphan) {
    const claimed = await tryClaim(admin, orphan.id, "running", staleIso)
    if (claimed) {
      log.warn("job órfão retomado (worker anterior morreu)", { jobId: orphan.id })
      return claimed
    }
  }

  return null
}

async function loadChannel(admin: SupabaseClient, channelId: string): Promise<ChannelRow | null> {
  const { data } = await admin
    .from("crm_channels")
    .select("id, org_id, external_id, config")
    .eq("id", channelId)
    .maybeSingle<ChannelRow>()
  return data ?? null
}

async function buildClient(admin: SupabaseClient, instanceName: string): Promise<EvolutionAPI | null> {
  const cfg = await getEvolutionRuntimeConfig(admin)
  if (!cfg) return null
  return createEvolutionClient({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, instanceName })
}

/**
 * Executa uma fatia do job. Retorna quando acaba o histórico ou o
 * budget — nos dois casos o cursor fica persistido.
 */
export async function runImportJob(
  admin: SupabaseClient,
  job: HistoryImportJob,
  opts: { budgetMs?: number; now?: number } = {},
): Promise<RunResult> {
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS
  const startedAt = opts.now ?? Date.now()
  const deadline = startedAt + budgetMs

  const channel = await loadChannel(admin, job.channel_id)
  if (!channel) return failJob(admin, job, "Canal não encontrado")

  const client = await buildClient(admin, channel.external_id)
  if (!client) return failJob(admin, job, "Evolution não configurada nesta instalação")

  let chats = job.chats ?? []
  let chatIndex = job.cursor_chat_index
  let page = job.cursor_page
  let seen = job.messages_seen
  let imported = job.messages_imported
  let skipped = job.messages_skipped

  // Primeira execução: descobre as conversas e congela a lista no job —
  // o cursor precisa de uma ordem estável entre execuções.
  if (chats.length === 0 && chatIndex === 0) {
    try {
      const found = await client.findChats()
      chats = found.filter((jid) => !shouldSkipRemoteJid(jid))
    } catch (error) {
      return failJob(admin, job, `findChats falhou: ${errMsg(error)}`)
    }

    await admin
      .from("crm_history_import_jobs")
      .update({
        chats,
        chats_total: chats.length,
        started_at: new Date(startedAt).toISOString(),
        last_progress_at: new Date().toISOString(),
      })
      .eq("id", job.id)

    log.info("conversas descobertas", { jobId: job.id, chats: chats.length })
  }

  const cutoff = job.since_days ? startedAt - job.since_days * 86_400_000 : null
  let exhausted = false

  while (chatIndex < chats.length) {
    if (Date.now() >= deadline) {
      exhausted = true
      break
    }

    const remoteJid = chats[chatIndex]
    let recordsLength = 0

    try {
      const { records } = await client.findMessages({ remoteJid, page, pageSize: PAGE_SIZE })
      recordsLength = records.length

      for (const record of records) {
        seen++

        // Fora da janela de data pedida: não conta como erro.
        if (cutoff !== null) {
          const ts = Number((record as { messageTimestamp?: unknown }).messageTimestamp)
          if (Number.isFinite(ts) && ts > 0 && ts * 1000 < cutoff) {
            skipped++
            continue
          }
        }

        if (job.mode === "dry_run") {
          // Mede o volume sem escrever uma linha.
          skipped++
          continue
        }

        try {
          const ok = await handleEvolutionMessage(admin, channel, channel.external_id, record, {
            historical: true,
            includeMedia: job.include_media,
          })
          if (ok) imported++
          else skipped++
        } catch (error) {
          // Uma mensagem malformada não derruba a importação inteira.
          skipped++
          log.warn("mensagem histórica falhou", { jobId: job.id, message: errMsg(error) })
        }
      }
    } catch (error) {
      return failJob(admin, job, `findMessages falhou (${remoteJid}): ${errMsg(error)}`)
    }

    // Página cheia = provavelmente há mais; página curta encerra a conversa.
    if (recordsLength >= PAGE_SIZE) {
      page++
    } else {
      chatIndex++
      page = 1
    }

    // O update devolve o status atual: se o operador pausou ou cancelou
    // no meio, o worker para aqui em vez de terminar a fatia inteira.
    const { data: current } = await admin
      .from("crm_history_import_jobs")
      .update({
        cursor_chat_index: chatIndex,
        cursor_page: page,
        messages_seen: seen,
        messages_imported: imported,
        messages_skipped: skipped,
        last_progress_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .select("status")
      .maybeSingle<{ status: HistoryImportJob["status"] }>()

    if (current && current.status !== "running") {
      log.info("job interrompido pelo operador", { jobId: job.id, status: current.status })
      return {
        status: current.status,
        chats_done: chatIndex,
        chats_total: chats.length,
        messages_seen: seen,
        messages_imported: imported,
        messages_skipped: skipped,
        exhausted_budget: false,
      }
    }

    // Respiro entre páginas: a Evolution atende outras instâncias e o
    // Postgres acabou de levar um lote de inserts.
    await sleep(120)
  }

  const done = chatIndex >= chats.length
  if (done) {
    if (job.mode === "import") await reconcileThreads(admin, job.channel_id)
    await admin
      .from("crm_history_import_jobs")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", job.id)
  } else {
    // Devolve para a fila: a próxima execução do cron retoma na hora, em
    // vez de esperar o job ser considerado órfão.
    await admin
      .from("crm_history_import_jobs")
      .update({ status: "pending" })
      .eq("id", job.id)
      .eq("status", "running")
  }

  log.info("fatia concluída", {
    jobId: job.id,
    mode: job.mode,
    chatsDone: chatIndex,
    chatsTotal: chats.length,
    imported,
    skipped,
    done,
  })

  return {
    status: done ? "completed" : "running",
    chats_done: chatIndex,
    chats_total: chats.length,
    messages_seen: seen,
    messages_imported: imported,
    messages_skipped: skipped,
    exhausted_budget: exhausted,
  }
}

/**
 * Fecha a importação: `last_message_at` de cada thread passa a refletir
 * a mensagem mais recente de verdade e o histórico não deixa não-lidas.
 *
 * O trigger já mantém as duas coisas (GREATEST + is_historical), mas a
 * reconciliação cobre thread que existia ANTES da importação com data
 * divergente — e é barata o suficiente para rodar uma vez no fim.
 */
export async function reconcileThreads(admin: SupabaseClient, channelId: string): Promise<void> {
  const { error } = await admin.rpc("crm_reconcile_thread_timestamps", { p_channel_id: channelId })
  if (error) {
    log.warn("reconciliação falhou (importação segue válida)", {
      channelId,
      message: error.message,
    })
  }
}

async function failJob(
  admin: SupabaseClient,
  job: HistoryImportJob,
  message: string,
): Promise<RunResult> {
  log.error("job de importação falhou", { jobId: job.id, message })
  await admin
    .from("crm_history_import_jobs")
    .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
    .eq("id", job.id)

  return {
    status: "failed",
    chats_done: job.cursor_chat_index,
    chats_total: job.chats_total,
    messages_seen: job.messages_seen,
    messages_imported: job.messages_imported,
    messages_skipped: job.messages_skipped,
    exhausted_budget: false,
  }
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
