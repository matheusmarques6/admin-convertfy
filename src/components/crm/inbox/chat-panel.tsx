"use client"

/**
 * Painel da conversa: header (contato, atribuição, status), barra da
 * janela de 24h, mensagens com load-more (cursor `before`) e composer
 * com mídia/áudio/quick-replies/templates.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, ChevronUp, Loader2, Phone } from "lucide-react"
import type { InboxMessage, ThreadDetail } from "@/types/crm-inbox"
import { AssignDropdown } from "./assign-dropdown"
import { Composer } from "./composer"
import { MessageBubble } from "./message-bubble"
import { ServiceWindowBar, windowIsOpen } from "./service-window-bar"
import { TemplatePickerModal } from "./template-picker-modal"
import { ThreadTags } from "./thread-tags"

interface ChatPanelProps {
  detail: ThreadDetail
  onBack: () => void
  onRefresh: () => Promise<unknown> | void
  onThreadsRefresh: () => void
}

export function ChatPanel({ detail, onBack, onRefresh, onThreadsRefresh }: ChatPanelProps) {
  const thread = detail.thread
  const isWhatsApp = thread.channel?.type === "whatsapp"
  const isEvolution = thread.channel?.provider === "evolution"
  // Janela de 24h e templates são exclusivos do WhatsApp OFICIAL
  // (Cloud API) — Evolution/Baileys é free-form sempre.
  const isCloudWhatsApp = isWhatsApp && !isEvolution
  const windowOpen = windowIsOpen(thread.is_window_open, thread.window_expires_at)

  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [olderMessages, setOlderMessages] = useState<InboxMessage[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(detail.messages.length >= 100)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const wasAtBottomRef = useRef(true)
  const lastThreadIdRef = useRef<string | null>(null)
  const lastMessageCountRef = useRef(0)

  // Histórico carregado via cursor fica em olderMessages; o SWR só traz
  // a página mais recente. Troca de thread reseta.
  useEffect(() => {
    if (lastThreadIdRef.current !== thread.id) {
      setOlderMessages([])
      setHasMore(detail.messages.length >= 100)
    }
  }, [thread.id, detail.messages.length])

  const allMessages = useMemo(
    () => [...olderMessages, ...detail.messages.filter((m) => !olderMessages.some((o) => o.id === m.id))],
    [olderMessages, detail.messages],
  )

  // Auto-scroll: instantâneo na troca de thread, smooth em mensagem nova
  // (só se o usuário já estava no fim — não interrompe leitura de histórico)
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const messageCount = allMessages.length
    const threadChanged = lastThreadIdRef.current !== thread.id
    const newMessages = messageCount > lastMessageCountRef.current

    lastThreadIdRef.current = thread.id
    lastMessageCountRef.current = messageCount

    if (threadChanged || (newMessages && wasAtBottomRef.current)) {
      messagesEndRef.current?.scrollIntoView({ behavior: threadChanged ? "auto" : "smooth" })
    }
  }, [allMessages.length, thread.id])

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    wasAtBottomRef.current = distanceFromBottom < 80
  }

  const loadMore = useCallback(async () => {
    if (loadingMore || allMessages.length === 0) return
    setLoadingMore(true)
    try {
      const oldest = allMessages[0]
      const res = await fetch(
        `/api/crm/inbox/threads/${thread.id}?before=${encodeURIComponent(oldest.created_at)}&limit=100`,
      )
      const data = (await res.json()) as ThreadDetail
      const older = (data.messages ?? []).filter((m) => !allMessages.some((a) => a.id === m.id))
      setOlderMessages((prev) => [...older, ...prev])
      setHasMore((data.messages ?? []).length >= 100)
    } finally {
      setLoadingMore(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, allMessages, thread.id])

  // ── Ações de envio ─────────────────────────────────────────────
  const sendText = async (body: string) => {
    const res = await fetch(`/api/crm/inbox/threads/${thread.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "text", body }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Falha no envio")
    }
    await onRefresh()
    onThreadsRefresh()
  }

  const sendMedia = async (file: File, mediaType: string, caption?: string) => {
    const form = new FormData()
    form.append("file", file)
    form.append("media_type", mediaType)
    if (caption) form.append("caption", caption)
    const res = await fetch(`/api/crm/inbox/threads/${thread.id}/media`, {
      method: "POST",
      body: form,
    })
    if (!res.ok) {
      // 413 vem da PLATAFORMA (limite de body da Vercel ~4,5MB) — o JSON
      // de erro nem existe nesse caso.
      if (res.status === 413) {
        throw new Error("Arquivo grande demais para enviar (limite ~4,5 MB). Comprima ou envie um arquivo menor.")
      }
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Falha no envio da mídia")
    }
    await onRefresh()
    onThreadsRefresh()
  }

  const sendTemplate = async (args: { templateName: string; language: string; params: string[] }) => {
    const res = await fetch(`/api/crm/inbox/threads/${thread.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "template",
        template_name: args.templateName,
        template_language: args.language,
        template_params: args.params,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Falha no envio do template")
    }
    await onRefresh()
    onThreadsRefresh()
  }

  const retryMessage = async (m: InboxMessage) => {
    if (m.content_type === "text" && m.body) {
      await sendText(m.body)
    }
    // Retry de mídia exigiria o arquivo original — o agente reanexa.
  }

  const handleStatusChange = async (newStatus: string) => {
    await fetch(`/api/crm/inbox/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    await onRefresh()
    onThreadsRefresh()
  }

  return (
    <>
      {/* Header — no mobile as ações (tags/atribuir/status) caem numa
          segunda linha rolável; no desktop (md) tudo numa linha só de 44px. */}
      <div
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-2 md:flex-nowrap md:py-0"
        style={{
          minHeight: "var(--crm-topbar-height)",
          borderColor: "var(--crm-gray-200)",
          background: "var(--crm-gray-0)",
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            onClick={onBack}
            className="md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px]"
            style={{ color: "var(--crm-gray-600)", background: "var(--crm-gray-100)" }}
            aria-label="Voltar para lista de conversas"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Phone className="hidden md:block h-3.5 w-3.5 shrink-0" style={{ color: "var(--crm-gray-500)" }} />
          <span
            className="truncate"
            style={{
              fontSize: "var(--crm-text-md)",
              fontWeight: "var(--crm-weight-medium)" as React.CSSProperties["fontWeight"],
              color: "var(--crm-gray-900)",
            }}
          >
            {thread.contact_name || thread.contact_external_id}
          </span>
          {thread.contact_name && (
            <span className="hidden sm:inline" style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
              {thread.contact_external_id}
            </span>
          )}
          {isWhatsApp && (
            <span
              className="hidden sm:inline shrink-0"
              title={isEvolution ? "WhatsApp via QR (não-oficial)" : "WhatsApp Oficial (Cloud API)"}
              style={{
                fontSize: "10px",
                fontWeight: "var(--crm-weight-medium)" as React.CSSProperties["fontWeight"],
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--crm-gray-600)",
                background: "var(--crm-gray-100)",
                border: "1px solid var(--crm-gray-200)",
                borderRadius: "var(--crm-radius-sm)",
                padding: "1px 6px",
              }}
            >
              {isEvolution ? "QR" : "Oficial"}
            </span>
          )}
        </div>
        <div className="flex w-full items-center justify-end gap-2 overflow-x-auto scrollbar-hide md:w-auto">
          <ThreadTags
            threadId={thread.id}
            tags={thread.tags ?? []}
            onChanged={() => {
              onRefresh()
              onThreadsRefresh()
            }}
          />
          <AssignDropdown
            threadId={thread.id}
            assignedTo={thread.assigned_to}
            onAssigned={() => {
              onRefresh()
              onThreadsRefresh()
            }}
          />
          <select
            value={thread.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="crm-input"
            style={{ height: "var(--crm-button-height-sm)" }}
            aria-label="Status da conversa"
          >
            <option value="open">Aberto</option>
            <option value="pending">Pendente</option>
            <option value="resolved">Resolvido</option>
            <option value="archived">Arquivado</option>
          </select>
        </div>
      </div>

      {/* Janela de 24h (só WhatsApp OFICIAL — Evolution não tem janela) */}
      {isCloudWhatsApp && (
        <ServiceWindowBar
          isWindowOpen={thread.is_window_open}
          windowExpiresAt={thread.window_expires_at}
          onOpenTemplates={() => setTemplatesOpen(true)}
        />
      )}

      {/* Mensagens */}
      <div
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
        className="flex-1 overflow-auto px-4 py-4 space-y-3"
        style={{ background: "var(--crm-gray-50)" }}
      >
        {hasMore && allMessages.length > 0 && (
          <div className="flex justify-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center gap-1.5"
              style={{
                fontSize: "var(--crm-text-xs)",
                color: "var(--crm-gray-600)",
                background: "var(--crm-gray-0)",
                border: "1px solid var(--crm-gray-200)",
                borderRadius: "var(--crm-radius-full)",
                padding: "4px 12px",
                cursor: "pointer",
              }}
            >
              {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
              Carregar anteriores
            </button>
          </div>
        )}

        {allMessages.length === 0 ? (
          <div
            className="text-center py-12"
            style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}
          >
            Nenhuma mensagem ainda.
          </div>
        ) : (
          allMessages.map((m) => (
            <MessageBubble key={m.id} message={m} threadId={thread.id} onRetry={retryMessage} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer — evolution mantém anexo/áudio, mas nunca bloqueia por
          janela e não oferece template (exclusivos do cloud oficial) */}
      <Composer
        disabled={false}
        windowClosed={Boolean(isCloudWhatsApp) && !windowOpen}
        isWhatsApp={Boolean(isWhatsApp)}
        supportsTemplates={Boolean(isCloudWhatsApp)}
        onSendText={sendText}
        onSendMedia={sendMedia}
        onOpenTemplates={() => setTemplatesOpen(true)}
      />

      {templatesOpen && (
        <TemplatePickerModal
          channelId={thread.channel_id}
          onSend={sendTemplate}
          onClose={() => setTemplatesOpen(false)}
        />
      )}
    </>
  )
}
