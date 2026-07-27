"use client"

/**
 * useEmailsLive (Epic AE - Story AE-6)
 *
 * Hook que mantem a lista de emails da loja atualizada em tempo real
 * via SSE (`/api/sse/stores/[id]/emails`). Listeners:
 *   - 'snapshot'              -> substitui state completo
 *   - 'email_status_change'   -> merge na lista
 *   - 'ping'                  -> atualiza lastPingAt (debug/health)
 *
 * Fallback: se EventSource falhar 3x em <30s, fecha conexao e ativa
 * SWR polling a cada 10s no endpoint REST consolidado.
 */

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import type { EmailStatus } from "@/types/email-workspace"
import type { QaIssue } from "@/types/email-generation"

// Mesmo shape que o endpoint /api/admin/stores/[id]/emails retorna.
export interface LiveEmail {
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
  blocks: Array<{
    id: string
    block_type: string
    position: number
    label: string
    content: Record<string, unknown>
  }>
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

export interface EmailStatusChangePayload {
  event_id: number
  email_id: string
  flow_id: string | null
  from_status: string | null
  status: EmailStatus
  batch_id: string | null
  failure_reason: string | null
  qa_issues_count: number
  ts: string
}

export type LiveStatus = "live" | "reconnecting" | "polling"

const RECONNECT_WINDOW_MS = 30_000
const RECONNECT_THRESHOLD = 3
const SWR_REFRESH_MS = 10_000

interface EmailsApiResponse {
  emails: LiveEmail[]
  current_batch_id: string | null
  stats: {
    total: number
    by_status: Record<string, number>
    pct_ready: number
  }
}

/**
 * Aplica um `email_status_change` a uma lista de emails, retornando
 * uma nova lista com o email atualizado in-place. Se o email nao
 * existir na lista, retorna a lista original (snapshot vai cobrir
 * o novo email na proxima conexao).
 *
 * Exportado para testes.
 */
export function mergeStatusChange(
  emails: LiveEmail[],
  change: EmailStatusChangePayload,
): LiveEmail[] {
  const idx = emails.findIndex((e) => e.id === change.email_id)
  if (idx === -1) return emails

  const current = emails[idx]
  if (current.status === change.status && current.failure_reason === change.failure_reason) {
    // No-op: evita re-render desnecessario.
    return emails
  }

  const updated: LiveEmail = {
    ...current,
    status: change.status,
    failure_reason: change.failure_reason ?? current.failure_reason,
    generation_batch_id: change.batch_id ?? current.generation_batch_id,
  }
  const next = emails.slice()
  next[idx] = updated
  return next
}

const swrFetcher = async (url: string): Promise<EmailsApiResponse> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const json = await r.json()
  // successResponse spread o data direto no body.
  return {
    emails: json.emails ?? [],
    current_batch_id: json.current_batch_id ?? null,
    stats: json.stats ?? { total: 0, by_status: {}, pct_ready: 0 },
  }
}

export interface UseEmailsLiveResult {
  emails: LiveEmail[]
  status: LiveStatus
  lastPingAt: number | null
}

export function useEmailsLive(
  storeId: string,
  initialEmails: LiveEmail[],
): UseEmailsLiveResult {
  const [emails, setEmails] = useState<LiveEmail[]>(initialEmails)
  const [status, setStatus] = useState<LiveStatus>("live")
  const [lastPingAt, setLastPingAt] = useState<number | null>(null)

  // Se snapshot inicial mudar (ex: SSR re-render), sincroniza state local.
  const initialRef = useRef(initialEmails)
  useEffect(() => {
    if (initialRef.current !== initialEmails) {
      initialRef.current = initialEmails
      setEmails(initialEmails)
    }
  }, [initialEmails])

  // Contagem de erros recentes (sliding window de 30s)
  const errorTimestamps = useRef<number[]>([])
  const sseDisabledRef = useRef(false)
  const [sseDisabled, setSseDisabled] = useState(false)

  useEffect(() => {
    if (sseDisabled || typeof window === "undefined") return
    if (typeof EventSource === "undefined") {
      // SSR ou ambiente sem EventSource: cai pra polling direto.
      setStatus("polling")
      setSseDisabled(true)
      sseDisabledRef.current = true
      return
    }

    const url = `/api/sse/stores/${storeId}/emails`
    const es = new EventSource(url)

    const onOpen = () => {
      setStatus("live")
    }

    const onSnapshot = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { emails: Partial<LiveEmail>[] }
        // Snapshot do SSE so traz campos minimos (id, flow_id, status,
        // generation_batch_id, ready_at, failed_at, failure_reason).
        // Fundimos com initialEmails (REST consolidado) para nao
        // perder html/blocks/timing.
        setEmails((current) => {
          const byId = new Map(current.map((e) => [e.id, e]))
          for (const partial of data.emails ?? []) {
            const id = partial.id
            if (!id) continue
            const existing = byId.get(id)
            if (existing) {
              byId.set(id, {
                ...existing,
                status: partial.status ?? existing.status,
                generation_batch_id:
                  partial.generation_batch_id ?? existing.generation_batch_id,
                failure_reason:
                  partial.failure_reason ?? existing.failure_reason,
              })
            }
            // Emails novos no SSE snapshot que nao estavam no initial
            // sao ignorados aqui — proximo SWR/REST vai pegar.
          }
          return Array.from(byId.values())
        })
      } catch {
        // payload invalido — ignora
      }
    }

    const onStatusChange = (event: MessageEvent) => {
      try {
        const change = JSON.parse(event.data) as EmailStatusChangePayload
        setEmails((current) => mergeStatusChange(current, change))
      } catch {
        // payload invalido — ignora
      }
    }

    const onPing = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { ts: number }
        setLastPingAt(data.ts)
      } catch {
        setLastPingAt(Date.now())
      }
    }

    const onError = () => {
      setStatus("reconnecting")
      const now = Date.now()
      errorTimestamps.current.push(now)
      // Mantem apenas erros dentro da janela.
      errorTimestamps.current = errorTimestamps.current.filter(
        (t) => now - t < RECONNECT_WINDOW_MS,
      )
      if (errorTimestamps.current.length >= RECONNECT_THRESHOLD) {
        // Desiste do SSE, ativa SWR fallback.
        sseDisabledRef.current = true
        setSseDisabled(true)
        setStatus("polling")
        es.close()
      }
    }

    es.addEventListener("open", onOpen)
    es.addEventListener("snapshot", onSnapshot)
    es.addEventListener("email_status_change", onStatusChange)
    es.addEventListener("ping", onPing)
    es.addEventListener("error", onError)

    return () => {
      es.removeEventListener("open", onOpen)
      es.removeEventListener("snapshot", onSnapshot)
      es.removeEventListener("email_status_change", onStatusChange)
      es.removeEventListener("ping", onPing)
      es.removeEventListener("error", onError)
      es.close()
    }
  }, [storeId, sseDisabled])

  // SWR fallback — so dispara quando SSE foi desabilitado.
  const { data: swrData } = useSWR<EmailsApiResponse>(
    sseDisabled ? `/api/admin/stores/${storeId}/emails` : null,
    swrFetcher,
    { refreshInterval: SWR_REFRESH_MS, revalidateOnFocus: false },
  )

  useEffect(() => {
    if (swrData?.emails) {
      setEmails(swrData.emails)
    }
  }, [swrData])

  return { emails, status, lastPingAt }
}

// ── Helpers de status (PT-BR) ───────────────────────────────

export interface StatusLabel {
  label: string
  variant: "neutral" | "info" | "positive" | "negative" | "warning"
}

export function getStatusLabel(status: EmailStatus): StatusLabel {
  switch (status) {
    case "draft":
    case "pending":
      return { label: "Aguardando", variant: "neutral" }
    case "copy_generating":
    case "copy_generating_recovery":
      return { label: "Gerando copy", variant: "info" }
    case "copy_ready":
    case "rendering":
      return { label: "Renderizando", variant: "info" }
    case "qa_running":
      return { label: "Revisando QA", variant: "info" }
    case "ready":
      return { label: "Pronto", variant: "positive" }
    case "failed":
      return { label: "Erro", variant: "negative" }
    case "approved":
      return { label: "Aprovado", variant: "positive" }
    case "live":
      return { label: "No ar", variant: "positive" }
    case "in_progress":
      return { label: "Em progresso", variant: "info" }
    default:
      return { label: status, variant: "neutral" }
  }
}

const FAILURE_REASON_LABELS: Record<string, string> = {
  superseded_by_redo: "Substituido por novo batch",
  superseded: "Substituido por geracao mais nova",
  timeout_phase2: "Timeout na fase de render (HTML/imagem)",
  copy_timeout: "Timeout na geracao da copy",
  copy_invalid_output: "Copy gerada nao validou no schema",
  rendering_failed: "Falha ao renderizar HTML/imagem",
  html_failed: "Falha ao gerar o HTML",
  // Cadeia de formatação (split do HTML agent): reason aponta o agente exato.
  hero_failed: "Falha ao montar a hero section",
  text_format_failed: "Falha ao formatar a copy no HTML",
  image_format_failed: "Falha ao posicionar as imagens no HTML",
  qa_failed: "QA reprovou (issues criticas)",
  qa_timeout: "Timeout no QA",
  max_attempts_exceeded: "Numero maximo de tentativas excedido",
  brand_incomplete: "Loja sem identidade visual completa (cores e/ou logo)",
  store_data_incomplete: "Loja sem dados pra gerar (nicho e/ou produtos)",
}

export function translateFailureReason(reason: string | null | undefined): string {
  if (!reason) return "Erro nao identificado"
  return FAILURE_REASON_LABELS[reason] ?? reason
}
