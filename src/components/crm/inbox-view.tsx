"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { Search, Send, MessageSquare, Filter, Phone } from "lucide-react"
import { CrmEmptyState } from "./crm-empty-state"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface ThreadSummary {
  id: string
  status: string
  contact_name: string | null
  contact_external_id: string
  contact_avatar_url: string | null
  last_message_at: string
  last_message_preview: string | null
  last_message_direction: string | null
  unread_count: number
  assigned_to: string | null
  assignee?: { id: string; name: string; avatar_url: string | null } | null
  channel?: { id: string; type: string; display_name: string } | null
}

interface ThreadDetail {
  thread: {
    id: string
    contact_name: string | null
    contact_external_id: string
    status: string
    assigned_to: string | null
    lead_id: string | null
    deal_id: string | null
    client_id: string | null
    channel?: { id: string; type: string; display_name: string }
    assignee?: { id: string; name: string; avatar_url: string | null } | null
  }
  messages: Array<{
    id: string
    direction: "inbound" | "outbound"
    content_type: string
    body: string | null
    media_url: string | null
    media_mime: string | null
    sent_by_kind: string
    status: string
    created_at: string
    error_message?: string
    sender?: { id: string; name: string; avatar_url: string | null } | null
  }>
}

export function InboxView() {
  const [statusFilter, setStatusFilter] = useState<"open" | "pending" | "resolved" | "all">("open")
  const [mineOnly, setMineOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [composer, setComposer] = useState("")
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const wasAtBottomRef = useRef(true)
  const lastThreadIdRef = useRef<string | null>(null)
  const lastMessageCountRef = useRef(0)

  const params = new URLSearchParams()
  params.set("status", statusFilter)
  if (mineOnly) params.set("mine", "1")
  if (search) params.set("search", search)

  const { data: threadsData, mutate: mutateThreads } = useSWR<{ threads: ThreadSummary[] }>(
    `/api/crm/inbox/threads?${params.toString()}`,
    fetcher,
    { refreshInterval: 10000 },
  )

  const { data: detailData, mutate: mutateDetail } = useSWR<ThreadDetail>(
    activeThreadId ? `/api/crm/inbox/threads/${activeThreadId}` : null,
    fetcher,
    { refreshInterval: 5000 },
  )

  const threads = threadsData?.threads || []
  const detail = detailData

  // Auto-scroll quando novas mensagens chegam — somente se o usuario ja
  // estava perto do fim. Caso esteja lendo historico, nao interrompe.
  // Quando muda de thread, sempre rola pro fim.
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const messageCount = detail?.messages?.length || 0
    const threadChanged = lastThreadIdRef.current !== (detail?.thread?.id || null)
    const newMessages = messageCount > lastMessageCountRef.current

    lastThreadIdRef.current = detail?.thread?.id || null
    lastMessageCountRef.current = messageCount

    if (threadChanged || (newMessages && wasAtBottomRef.current)) {
      // Scroll instantaneo na troca de thread, smooth em mensagens novas
      messagesEndRef.current?.scrollIntoView({
        behavior: threadChanged ? "auto" : "smooth",
      })
    }
  }, [detail?.messages?.length, detail?.thread?.id])

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current
    if (!container) return
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight
    wasAtBottomRef.current = distanceFromBottom < 80
  }

  // Mark as read when thread opens
  useEffect(() => {
    if (activeThreadId) {
      fetch(`/api/crm/inbox/threads/${activeThreadId}/read`, { method: "POST" })
        .then(() => mutateThreads())
        .catch(() => {})
    }
  }, [activeThreadId, mutateThreads])

  const totalUnread = useMemo(
    () => threads.reduce((sum, t) => sum + (t.unread_count || 0), 0),
    [threads],
  )

  const send = async () => {
    if (!activeThreadId || !composer.trim() || sending) return
    setSending(true)
    try {
      await fetch(`/api/crm/inbox/threads/${activeThreadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "text", body: composer.trim() }),
      })
      setComposer("")
      await Promise.all([mutateDetail(), mutateThreads()])
    } finally {
      setSending(false)
    }
  }

  const handleStatusChange = async (newStatus: "open" | "pending" | "resolved" | "archived") => {
    if (!activeThreadId) return
    await fetch(`/api/crm/inbox/threads/${activeThreadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    await Promise.all([mutateDetail(), mutateThreads()])
  }

  return (
    <div
      className="flex h-full"
      style={{ background: "var(--crm-gray-50)", fontFamily: "var(--crm-font-sans)" }}
    >
      {/* Threads list */}
      <aside
        className="flex flex-col border-r"
        style={{ width: 320, borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-0)" }}
      >
        <div
          className="border-b px-3 py-3"
          style={{ borderColor: "var(--crm-gray-200)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <h2
              style={{
                fontSize: "var(--crm-text-md)",
                fontWeight: "var(--crm-weight-medium)",
                color: "var(--crm-gray-900)",
              }}
            >
              Inbox{totalUnread > 0 && (
                <span
                  className="ml-2"
                  style={{
                    fontSize: "var(--crm-text-xs)",
                    color: "var(--crm-brand-fg)",
                    background: "var(--crm-brand)",
                    padding: "2px 8px",
                    borderRadius: "var(--crm-radius-full)",
                    fontFamily: "var(--crm-font-mono)",
                  }}
                >
                  {totalUnread}
                </span>
              )}
            </h2>
          </div>

          <div className="relative mb-2">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
              style={{ color: "var(--crm-gray-400)" }}
            />
            <input
              type="text"
              className="crm-input w-full"
              style={{ paddingLeft: 30 }}
              placeholder="Buscar contato..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1">
            {(["open", "pending", "resolved", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  fontSize: "var(--crm-text-xs)",
                  fontWeight: "var(--crm-weight-medium)",
                  padding: "4px 8px",
                  borderRadius: "var(--crm-radius-sm)",
                  background: statusFilter === s ? "var(--crm-gray-900)" : "var(--crm-gray-100)",
                  color: statusFilter === s ? "var(--crm-gray-0)" : "var(--crm-gray-700)",
                  cursor: "pointer",
                  border: "none",
                  textTransform: "capitalize",
                }}
              >
                {s === "open" ? "Abertos" : s === "pending" ? "Pendentes" : s === "resolved" ? "Resolvidos" : "Todos"}
              </button>
            ))}
            <button
              onClick={() => setMineOnly((v) => !v)}
              title="Apenas meus"
              style={{
                marginLeft: "auto",
                padding: 4,
                borderRadius: "var(--crm-radius-sm)",
                background: mineOnly ? "var(--crm-gray-900)" : "transparent",
                color: mineOnly ? "var(--crm-gray-0)" : "var(--crm-gray-500)",
                border: mineOnly ? "none" : "1px solid var(--crm-gray-200)",
                cursor: "pointer",
              }}
            >
              <Filter className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {threads.length === 0 ? (
            <div
              className="px-4 py-12 text-center"
              style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}
            >
              Nenhuma conversa
            </div>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveThreadId(t.id)}
                className="w-full text-left"
                style={{
                  borderBottom: "1px solid var(--crm-gray-100)",
                  padding: "10px 12px",
                  background: activeThreadId === t.id ? "var(--crm-gray-100)" : "transparent",
                  cursor: "pointer",
                  display: "block",
                }}
              >
                <div className="flex items-start gap-2">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center text-xs font-medium"
                    style={{
                      background: "var(--crm-gray-200)",
                      color: "var(--crm-gray-700)",
                      borderRadius: "var(--crm-radius-full)",
                    }}
                  >
                    {(t.contact_name || t.contact_external_id).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span
                        className="truncate"
                        style={{
                          fontSize: "var(--crm-text-sm)",
                          fontWeight: t.unread_count > 0 ? "var(--crm-weight-medium)" : "var(--crm-weight-regular)",
                          color: "var(--crm-gray-900)",
                        }}
                      >
                        {t.contact_name || t.contact_external_id}
                      </span>
                      {t.unread_count > 0 && (
                        <span
                          style={{
                            fontSize: 10,
                            background: "var(--crm-brand)",
                            color: "var(--crm-brand-fg)",
                            borderRadius: "var(--crm-radius-full)",
                            padding: "1px 6px",
                            fontFamily: "var(--crm-font-mono)",
                          }}
                        >
                          {t.unread_count}
                        </span>
                      )}
                    </div>
                    <p
                      className="truncate"
                      style={{
                        fontSize: "var(--crm-text-xs)",
                        color: "var(--crm-gray-500)",
                        marginTop: 2,
                      }}
                    >
                      {t.last_message_direction === "outbound" ? "Voce: " : ""}
                      {t.last_message_preview || "Sem mensagens"}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span style={{ fontSize: 10, color: "var(--crm-gray-400)" }}>
                        {t.channel?.display_name || "—"}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--crm-gray-400)" }}>
                        {formatRelativeTime(t.last_message_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Conversation panel */}
      <main className="flex flex-1 flex-col">
        {!activeThreadId ? (
          <div className="flex flex-1 items-center justify-center">
            <CrmEmptyState
              icon={<MessageSquare className="h-5 w-5" />}
              title="Selecione uma conversa"
              description="Clique em qualquer thread a esquerda para abrir."
            />
          </div>
        ) : !detail ? (
          <div className="flex flex-1 items-center justify-center">
            <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}>
              Carregando...
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div
              className="flex items-center justify-between border-b px-4"
              style={{
                height: "var(--crm-topbar-height)",
                borderColor: "var(--crm-gray-200)",
                background: "var(--crm-gray-0)",
              }}
            >
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5" style={{ color: "var(--crm-gray-500)" }} />
                <span
                  style={{
                    fontSize: "var(--crm-text-md)",
                    fontWeight: "var(--crm-weight-medium)",
                    color: "var(--crm-gray-900)",
                  }}
                >
                  {detail.thread.contact_name || detail.thread.contact_external_id}
                </span>
                {detail.thread.contact_name && (
                  <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
                    {detail.thread.contact_external_id}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={detail.thread.status}
                  onChange={(e) => handleStatusChange(e.target.value as "open" | "pending" | "resolved" | "archived")}
                  className="crm-input"
                  style={{ height: "var(--crm-button-height-sm)" }}
                >
                  <option value="open">Aberto</option>
                  <option value="pending">Pendente</option>
                  <option value="resolved">Resolvido</option>
                  <option value="archived">Arquivado</option>
                </select>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              className="flex-1 overflow-auto px-4 py-4 space-y-3"
              style={{ background: "var(--crm-gray-50)" }}
            >
              {detail.messages.length === 0 ? (
                <div
                  className="text-center py-12"
                  style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}
                >
                  Nenhuma mensagem ainda.
                </div>
              ) : (
                detail.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      style={{
                        maxWidth: "70%",
                        background:
                          m.direction === "outbound" ? "var(--crm-gray-900)" : "var(--crm-gray-0)",
                        color:
                          m.direction === "outbound" ? "var(--crm-gray-0)" : "var(--crm-gray-900)",
                        padding: "8px 12px",
                        borderRadius: "var(--crm-radius-md)",
                        border:
                          m.direction === "outbound"
                            ? "none"
                            : "1px solid var(--crm-gray-200)",
                        fontSize: "var(--crm-text-base)",
                        lineHeight: "var(--crm-leading-normal)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {m.body || `[${m.content_type}]`}
                      <div
                        className="mt-1 flex items-center justify-end gap-1"
                        style={{
                          fontSize: 10,
                          color:
                            m.direction === "outbound"
                              ? "rgba(255,255,255,0.5)"
                              : "var(--crm-gray-400)",
                        }}
                      >
                        <span>{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                        {m.direction === "outbound" && (
                          <span>· {statusLabel(m.status)}</span>
                        )}
                      </div>
                      {m.status === "failed" && m.error_message && (
                        <p
                          className="mt-1"
                          style={{
                            fontSize: 10,
                            color: "var(--crm-danger-fg)",
                          }}
                        >
                          ✕ {m.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div
              className="border-t px-4 py-3"
              style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-0)" }}
            >
              <div className="flex items-end gap-2">
                <textarea
                  className="crm-input flex-1"
                  style={{ height: "auto", minHeight: 38, padding: 8, resize: "none" }}
                  placeholder="Digite sua mensagem..."
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  rows={2}
                />
                <button
                  onClick={send}
                  disabled={!composer.trim() || sending}
                  className="crm-button-primary"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--crm-space-2)",
                    opacity: !composer.trim() || sending ? 0.5 : 1,
                  }}
                >
                  {sending ? "..." : <Send className="h-3.5 w-3.5" />}
                  Enviar
                </button>
              </div>
              <div
                className="mt-1"
                style={{
                  fontSize: 10,
                  color: "var(--crm-gray-400)",
                }}
              >
                ⌘/Ctrl + Enter para enviar
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function statusLabel(s: string): string {
  switch (s) {
    case "queued": return "Enviando"
    case "sent": return "Enviado"
    case "delivered": return "Entregue"
    case "read": return "Lido"
    case "failed": return "Falhou"
    case "received": return ""
    default: return s
  }
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return "agora"
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}
