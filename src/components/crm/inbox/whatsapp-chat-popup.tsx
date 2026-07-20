"use client"

/**
 * Popup in-app de conversa WhatsApp — aberto pelo ícone verde do card
 * de deal. Resolve a thread do telefone via
 * POST /api/crm/inbox/threads/resolve e:
 *
 *  - thread existente → reusa o ChatPanel COMPLETO do inbox (composer
 *    texto/mídia/áudio, quick replies, templates, janela 24h,
 *    atribuição, tags, load-more) sem modificá-lo
 *  - sem thread mas com canal → modo "conversa nova": composer de texto
 *    simples; a thread nasce no primeiro envio (resolve create:true)
 *  - sem canal WhatsApp ativo → aviso + link pra /admin/crm/channels e
 *    fallback wa.me
 *
 * Renderiza via portal em document.body: escapa do DOM do card
 * (drag-and-drop do board) — mas eventos React AINDA borbulham pela
 * árvore de componentes, então o overlay corta click/keydown pra não
 * disparar o onClick/onKeyDown do card.
 */

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import useSWR from "swr"
import { ExternalLink, Loader2, MessageSquare, Send, X } from "lucide-react"
import type { ThreadDetail } from "@/types/crm-inbox"
import { useRealtimeInbox } from "@/hooks/use-realtime-inbox"
import { SkeletonShimmer } from "@/components/ui/skeleton"
import { ChatPanel } from "./chat-panel"

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const noop = () => {}

interface WhatsAppChatPopupProps {
  open: boolean
  onClose: () => void
  phone: string
  contactName?: string
  dealId?: string
  clientId?: string
  leadId?: string
}

type ResolveState =
  | { status: "loading" }
  | { status: "no_channel" }
  | { status: "error"; message: string }
  | { status: "ready"; threadId: string | null; channelId: string | null }

export function WhatsAppChatPopup({
  open,
  onClose,
  phone,
  contactName,
  dealId,
  clientId,
  leadId,
}: WhatsAppChatPopupProps) {
  const [state, setState] = useState<ResolveState>({ status: "loading" })

  const resolveThread = useCallback(
    async (create: boolean): Promise<{ thread_id: string | null; channel_id: string | null; reason?: string }> => {
      const res = await fetch("/api/crm/inbox/threads/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          deal_id: dealId,
          client_id: clientId,
          lead_id: leadId,
          contact_name: contactName,
          ...(create ? { create: true } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || "Falha ao resolver a conversa")
      }
      return data
    },
    [phone, dealId, clientId, leadId, contactName],
  )

  // Resolve ao abrir (sem create — criação é lazy, no primeiro envio)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setState({ status: "loading" })
    resolveThread(false)
      .then((data) => {
        if (cancelled) return
        if (data.reason === "no_channel") {
          setState({ status: "no_channel" })
        } else {
          setState({
            status: "ready",
            threadId: data.thread_id,
            channelId: data.channel_id,
          })
        }
      })
      .catch((err) => {
        if (cancelled) return
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Falha ao resolver a conversa",
        })
      })
    return () => {
      cancelled = true
    }
  }, [open, resolveThread])

  // Esc fecha o popup (listener global — não depende de foco interno)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open || typeof document === "undefined") return null

  const waFallback = `https://wa.me/${phone.replace(/\D/g, "")}`

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)", fontFamily: "var(--crm-font-sans)" }}
      onClick={(e) => {
        // Portal borbulha pro card no tree do React — corta aqui
        e.stopPropagation()
        onClose()
      }}
      onKeyDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={`Conversa WhatsApp com ${contactName || phone}`}
    >
      <div
        className="flex w-full flex-col overflow-hidden"
        style={{
          maxWidth: 460,
          height: "80vh",
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: "var(--crm-radius-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {state.status === "loading" && (
          <PopupShell contactName={contactName} phone={phone} onClose={onClose}>
            <div className="flex flex-1 flex-col gap-3 p-6" aria-label="Carregando conversa">
              <SkeletonShimmer className="h-8 w-48 rounded-[4px]" />
              <SkeletonShimmer className="h-3 w-32 rounded-[4px]" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonShimmer
                    key={i}
                    className="h-12 rounded-[6px]"
                    style={{ width: i % 2 === 0 ? "70%" : "55%", marginLeft: i % 2 === 0 ? 0 : "auto" }}
                  />
                ))}
              </div>
            </div>
          </PopupShell>
        )}

        {state.status === "no_channel" && (
          <PopupShell contactName={contactName} phone={phone} onClose={onClose}>
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <MessageSquare className="h-6 w-6" style={{ color: "var(--crm-gray-300)" }} />
              <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-700)" }}>
                Nenhum canal WhatsApp ativo na sua organização.
              </p>
              <a
                href="/admin/crm/channels"
                style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-900)", textDecoration: "underline" }}
              >
                Configurar canal em Canais
              </a>
              <a
                href={waFallback}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5"
                style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}
              >
                Abrir no WhatsApp Web
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </PopupShell>
        )}

        {state.status === "error" && (
          <PopupShell contactName={contactName} phone={phone} onClose={onClose}>
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-danger-fg)" }}>
                {state.message}
              </p>
              <a
                href={waFallback}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5"
                style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}
              >
                Abrir no WhatsApp Web
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </PopupShell>
        )}

        {state.status === "ready" && state.threadId && (
          <PopupConversation threadId={state.threadId} onClose={onClose} />
        )}

        {state.status === "ready" && !state.threadId && (
          <PopupNewConversation
            contactName={contactName}
            phone={phone}
            onClose={onClose}
            resolveThread={resolveThread}
            onThreadReady={(threadId) =>
              setState({ status: "ready", threadId, channelId: state.channelId })
            }
          />
        )}
      </div>
    </div>,
    document.body,
  )
}

// ─── Shell (header simples pros estados sem ChatPanel) ────────────

function PopupShell({
  contactName,
  phone,
  onClose,
  children,
}: {
  contactName?: string
  phone: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <>
      <div
        className="flex items-center justify-between border-b px-4"
        style={{
          height: "var(--crm-topbar-height)",
          borderColor: "var(--crm-gray-200)",
          background: "var(--crm-gray-0)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-3.5 w-3.5 shrink-0" style={{ color: "#25D366" }} />
          <span
            className="truncate"
            style={{
              fontSize: "var(--crm-text-md)",
              fontWeight: "var(--crm-weight-medium)" as React.CSSProperties["fontWeight"],
              color: "var(--crm-gray-900)",
            }}
          >
            {contactName || phone}
          </span>
          {contactName && (
            <span className="hidden sm:inline" style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
              {phone}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
          style={{ background: "transparent", border: "none", color: "var(--crm-gray-500)", cursor: "pointer" }}
          aria-label="Fechar conversa"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {children}
    </>
  )
}

// ─── Modo conversa: mini-ciclo do InboxView + ChatPanel ───────────

function PopupConversation({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const [realtimeConnected, setRealtimeConnected] = useState(false)

  // Mesmo ciclo do inbox: realtime conectado relaxa o polling pra 30s;
  // sem realtime mantém 5s.
  const { data: detail, mutate: mutateDetail } = useSWR<ThreadDetail>(
    `/api/crm/inbox/threads/${threadId}`,
    fetcher,
    { refreshInterval: realtimeConnected ? 30000 : 5000 },
  )

  const onDetailUpdate = useCallback(() => {
    mutateDetail()
  }, [mutateDetail])

  // use-realtime-inbox não tem acoplamento com a página do inbox — só
  // supabase postgres_changes + callbacks. onThreadsUpdate é noop
  // porque o popup não tem lista de conversas.
  const { realtimeConnected: rtConnected } = useRealtimeInbox({
    onThreadsUpdate: noop,
    onDetailUpdate,
    activeThreadId: threadId,
  })
  useEffect(() => setRealtimeConnected(rtConnected), [rtConnected])

  // Marca como lida ao abrir (zera unread + read receipt no provider)
  useEffect(() => {
    fetch(`/api/crm/inbox/threads/${threadId}/read`, { method: "POST" }).catch(() => {})
  }, [threadId])

  if (!detail?.thread) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-6" aria-label="Carregando conversa">
        <SkeletonShimmer className="h-8 w-48 rounded-[4px]" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonShimmer
              key={i}
              className="h-12 rounded-[6px]"
              style={{ width: i % 2 === 0 ? "70%" : "55%", marginLeft: i % 2 === 0 ? 0 : "auto" }}
            />
          ))}
        </div>
      </div>
    )
  }

  // ChatPanel exige container flex-col com altura definida — o wrapper
  // dá o layout; o ChatPanel em si NÃO é modificado.
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <ChatPanel
        detail={detail}
        onBack={onClose}
        onRefresh={mutateDetail}
        onThreadsRefresh={noop}
      />
    </div>
  )
}

// ─── Modo "conversa nova": thread nasce no primeiro envio ─────────

/**
 * Composer próprio minimalista (não o Composer do inbox): antes da
 * thread existir não há janela de 24h conhecida, mídia exige thread e
 * template exige o fluxo do ChatPanel — texto simples cobre o caso.
 */
function PopupNewConversation({
  contactName,
  phone,
  onClose,
  resolveThread,
  onThreadReady,
}: {
  contactName?: string
  phone: string
  onClose: () => void
  resolveThread: (create: boolean) => Promise<{ thread_id: string | null; channel_id: string | null }>
  onThreadReady: (threadId: string) => void
}) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  // Thread já criada num envio que falhou depois (ex.: janela 24h) —
  // reusa no retry e permite abrir a conversa mesmo assim.
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null)

  const send = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setSendError(null)
    try {
      let threadId = createdThreadId
      if (!threadId) {
        const created = await resolveThread(true)
        if (!created.thread_id) throw new Error("Falha ao criar a conversa")
        threadId = created.thread_id
        setCreatedThreadId(threadId)
      }

      const res = await fetch(`/api/crm/inbox/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "text", body }),
      })
      const data = await res.json().catch(() => ({}))
      // A rota devolve 200 com sent:false quando o provider recusa —
      // os dois caminhos são erro pro usuário.
      if (!res.ok || data.sent === false) {
        throw new Error(data.error?.message || data.error || "Falha no envio")
      }

      onThreadReady(threadId)
    } catch (err) {
      // Mantém o texto digitado pra re-tentativa.
      setSendError(err instanceof Error ? err.message : "Falha no envio")
    } finally {
      setSending(false)
    }
  }

  return (
    <PopupShell contactName={contactName} phone={phone} onClose={onClose}>
      <div
        className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center"
        style={{ background: "var(--crm-gray-50)" }}
      >
        <MessageSquare className="h-6 w-6" style={{ color: "var(--crm-gray-300)" }} />
        <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-600)" }}>
          Nenhuma conversa com este número ainda.
        </p>
        <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
          Envie a primeira mensagem pra iniciar a thread no inbox.
        </p>
      </div>

      <div className="border-t p-3" style={{ borderColor: "var(--crm-gray-200)" }}>
        {sendError && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-danger-fg)" }}>{sendError}</p>
            {createdThreadId && (
              <button
                onClick={() => onThreadReady(createdThreadId)}
                className="crm-button-ghost shrink-0"
                style={{ fontSize: "var(--crm-text-xs)" }}
              >
                Abrir conversa
              </button>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            className="crm-input flex-1 resize-none"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Escreva a primeira mensagem…"
            aria-label="Primeira mensagem"
            disabled={sending}
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="crm-button-primary flex items-center gap-1.5"
            style={{ opacity: sending || !text.trim() ? 0.6 : 1 }}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar
          </button>
        </div>
      </div>
    </PopupShell>
  )
}
