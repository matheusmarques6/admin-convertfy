"use client"

/**
 * Painel da conversa — design v3: header com identidade + chip da
 * janela de 24h + atribuir/resolver, card do post nas threads de
 * comentário, mensagens agrupadas por dia E por sequência de autor
 * (meta só na última da sequência), composer novo.
 *
 * Contexto de CRM/tags/status migrou pro ContextPanel (coluna direita);
 * este componente segue dono das ações de envio e do histórico.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  Check,
  ChevronUp,
  Loader2,
  PanelRight,
  X,
} from "lucide-react"
import { groupMessagesByDay, shouldShowAuthor } from "@/lib/services/crm-inbox-format"
import type { InboxMessage, ThreadDetail } from "@/types/crm-inbox"
import {
  AvatarWithChannel,
  ChBadge,
  ChLabel,
  IcoBtn,
  threadKind,
  windowHoursLeft,
  TNUM,
} from "./inbox-theme"
import { AssignDropdown } from "./assign-dropdown"
import { Composer } from "./composer"
import { MessageBubble } from "./message-bubble"
import { windowIsOpen } from "./service-window-bar"
import { TemplatePickerModal } from "./template-picker-modal"

interface ChatPanelProps {
  detail: ThreadDetail
  onBack: () => void
  onRefresh: () => Promise<unknown> | void
  onThreadsRefresh: () => void
  /** Largura do container do inbox (px) — condicionais do header. */
  containerWidth?: number
  /** Painel de contexto: coluna fixa (wide) ou overlay (toggle).
   *  Defaults cobrem o uso embutido (whatsapp-chat-popup), que não tem
   *  painel de contexto. */
  contextIsColumn?: boolean
  contextOpen?: boolean
  onToggleContext?: () => void
}

export function ChatPanel({
  detail,
  onBack,
  onRefresh,
  onThreadsRefresh,
  containerWidth = 0,
  contextIsColumn = true,
  contextOpen = false,
  onToggleContext,
}: ChatPanelProps) {
  const thread = detail.thread
  const isWhatsApp = thread.channel?.type === "whatsapp"
  const isInstagram = thread.channel?.type === "instagram"
  const isEvolution = thread.channel?.provider === "evolution"
  const isComment = threadKind(thread) === "comment"
  // Janela de 24h: WhatsApp OFICIAL (Cloud) e Instagram têm; Evolution
  // (Baileys) é free-form sempre.
  const isCloudWhatsApp = isWhatsApp && !isEvolution
  const hasServiceWindow = (isCloudWhatsApp || isInstagram) && !isComment
  const windowOpen = windowIsOpen(thread.is_window_open, thread.window_expires_at)
  const hoursLeft = windowHoursLeft(thread.window_expires_at)

  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [olderMessages, setOlderMessages] = useState<InboxMessage[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(detail.messages.length >= 100)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [savingStatus, setSavingStatus] = useState(false)
  const [hasNewBelow, setHasNewBelow] = useState(false)

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
      setPanelError(null)
      setHasNewBelow(false)
    }
  }, [thread.id, detail.messages.length])

  const allMessages = useMemo(
    () => [...olderMessages, ...detail.messages.filter((m) => !olderMessages.some((o) => o.id === m.id))],
    [olderMessages, detail.messages],
  )

  const dayGroups = useMemo(() => groupMessagesByDay(allMessages), [allMessages])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior })
    setHasNewBelow(false)
  }, [])

  // Auto-scroll: instantâneo na troca de thread, smooth em mensagem nova
  // (só se o usuário já estava no fim).
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
      setHasNewBelow(false)
    } else if (newMessages) {
      setHasNewBelow(true)
    }
  }, [allMessages.length, thread.id])

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    wasAtBottomRef.current = distanceFromBottom < 80
    if (wasAtBottomRef.current) setHasNewBelow(false)
  }

  const loadMore = useCallback(async () => {
    if (loadingMore || allMessages.length === 0) return
    setLoadingMore(true)
    setPanelError(null)
    const container = messagesContainerRef.current
    const prevHeight = container?.scrollHeight ?? 0
    const prevTop = container?.scrollTop ?? 0
    try {
      const oldest = allMessages[0]
      const res = await fetch(
        `/api/crm/inbox/threads/${thread.id}?before=${encodeURIComponent(oldest.created_at)}&limit=100`,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((data as { error?: string })?.error || "Não foi possível carregar o histórico")
      }
      const page = (data as ThreadDetail).messages ?? []
      const older = page.filter((m) => !allMessages.some((a) => a.id === m.id))
      setOlderMessages((prev) => [...older, ...prev])
      setHasMore(page.length >= 100)
      // Prepend empurra o conteúdo pra baixo — compensa o scroll.
      requestAnimationFrame(() => {
        const c = messagesContainerRef.current
        if (c) c.scrollTop = prevTop + (c.scrollHeight - prevHeight)
      })
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Não foi possível carregar o histórico")
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
      // A rota devolve 502 quando o provedor recusa — o texto volta pro
      // composer e o erro aparece, em vez de sumir.
      await onRefresh()
      onThreadsRefresh()
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
      // 413 vem da PLATAFORMA (limite de body da Vercel ~4,5MB).
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
      await onRefresh()
      onThreadsRefresh()
      throw new Error(data.error || "Falha no envio do template")
    }
    await onRefresh()
    onThreadsRefresh()
  }

  /** Reenvio: só texto tem como ser refeito pelo servidor. */
  const retryMessage = async (m: InboxMessage) => {
    setPanelError(null)
    if (m.content_type !== "text" || !m.body) {
      setPanelError("Só dá para reenviar texto automaticamente — reanexe o arquivo para tentar de novo.")
      return
    }
    try {
      await sendText(m.body)
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Falha ao reenviar")
    }
  }

  const isResolved = thread.status === "resolved"
  const toggleResolved = async () => {
    setSavingStatus(true)
    setPanelError(null)
    try {
      const res = await fetch(`/api/crm/inbox/threads/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: isResolved ? "open" : "resolved" }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string })?.error || "Não foi possível mudar o status")
      }
      await onRefresh()
      onThreadsRefresh()
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Não foi possível mudar o status")
      await onRefresh()
    } finally {
      setSavingStatus(false)
    }
  }

  const contactLabel = thread.contact_name || thread.contact_external_id
  const mediaId = (thread.metadata as { media_id?: string } | null)?.media_id

  /** Sequências do mesmo autor: rótulo na primeira, meta na última. */
  const runKey = (m: InboxMessage) =>
    `${m.direction}|${m.sender_username ?? ""}|${m.sender?.id ?? m.sent_by_kind ?? ""}`

  return (
    <>
      {/* Header */}
      <div
        className="box-border flex min-h-[56px] shrink-0 items-center gap-[11px] border-b px-3 py-2.5 md:px-[18px]"
        style={{ borderColor: "var(--ops-border)", background: "var(--ops-card)" }}
      >
        <button
          onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] md:hidden"
          style={{ color: "var(--ops-sec)", background: "var(--ops-hover, rgba(0,0,0,0.05))" }}
          aria-label="Voltar para lista de conversas"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <AvatarWithChannel
          name={contactLabel}
          avatarUrl={thread.contact_avatar_url}
          canal={thread.channel?.type ?? "whatsapp"}
          size={34}
          badge={14}
        />

        <div className="min-w-[110px] flex-auto overflow-hidden">
          <div className="truncate text-[13px] font-[650]" style={{ color: "var(--ops-title)" }}>
            {contactLabel}
          </div>
          <div className="mt-px flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
            <ChLabel thread={thread} />
            {containerWidth >= 1000 && (
              <span className="truncate text-[10px]" style={{ color: "var(--ops-mut)" }}>
                · via {thread.channel?.display_name}
              </span>
            )}
          </div>
        </div>

        {/* Chip da janela de 24h */}
        {hasServiceWindow && windowOpen && hoursLeft != null && hoursLeft > 0 && containerWidth >= 860 && (
          <span
            title="Janela de atendimento — 24h desde a última mensagem do contato"
            className="inline-flex h-[26px] items-center gap-1.5 rounded-[6px] border px-2.5 text-[10.5px] font-medium"
            style={{
              borderColor: "var(--ops-border)",
              color: hoursLeft < 4 ? "var(--ops-warn)" : "var(--ops-sec)",
              ...TNUM,
            }}
          >
            <span
              className="h-[5px] w-[5px] rounded-full"
              style={{ background: hoursLeft < 4 ? "var(--ops-warn)" : "var(--ops-pos)" }}
            />
            janela · {Math.floor(hoursLeft)}h{String(Math.round((hoursLeft % 1) * 60)).padStart(2, "0")}
          </span>
        )}

        <AssignDropdown
          threadId={thread.id}
          assignedTo={thread.assigned_to}
          onAssigned={() => {
            onRefresh()
            onThreadsRefresh()
          }}
          compact={containerWidth < 1100}
        />
        <IcoBtn
          title={isResolved ? "Reabrir conversa" : "Marcar como resolvida"}
          on={isResolved}
          disabled={savingStatus}
          onClick={toggleResolved}
          label={containerWidth >= 920 ? (isResolved ? "Reabrir" : "Resolver") : null}
        >
          <Check className="h-[13px] w-[13px]" />
        </IcoBtn>
        {!contextIsColumn && (
          <IcoBtn title="Detalhes do contato" on={contextOpen} onClick={onToggleContext}>
            <PanelRight className="h-3.5 w-3.5" />
          </IcoBtn>
        )}
      </div>

      {/* Card do post — threads de comentário do Instagram */}
      {isComment && (
        <div className="mx-4 mt-3.5 shrink-0 md:mx-[22px]">
          <div
            className="flex gap-[13px] rounded-t-[10px] border border-b-0 px-[13px] py-3"
            style={{ borderColor: "var(--ops-border)", background: "var(--ops-card)" }}
          >
            <span
              className="relative h-[64px] w-[64px] shrink-0 overflow-hidden rounded-[8px]"
              style={{ background: "linear-gradient(45deg, #F58529 0%, #DD2A7B 55%, #8134AF 100%)" }}
            >
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span className="text-[7.5px] font-bold tracking-[0.08em] text-white/85">POST</span>
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col justify-center gap-[3px]">
              <span
                className="inline-flex items-center gap-1.5 text-[9.5px] font-[650] uppercase tracking-[0.07em]"
                style={{ color: "var(--ops-mut)" }}
              >
                <ChBadge canal="instagram" size={12} />
                Post · {thread.channel?.display_name}
              </span>
              <span className="truncate text-[12.5px] font-semibold" style={{ color: "var(--ops-title)" }}>
                Comentários agrupados desta publicação
              </span>
              {mediaId && (
                <span className="truncate text-[10.5px]" style={{ color: "var(--ops-mut)", ...TNUM }}>
                  mídia {mediaId}
                </span>
              )}
            </span>
          </div>
          <div
            className="flex items-center gap-2 rounded-b-[10px] border px-[13px] py-[7px]"
            style={{ borderColor: "var(--ops-border)", background: "var(--ops-hover, rgba(0,0,0,0.02))" }}
          >
            <span className="text-[10px] font-[650] uppercase tracking-[0.06em]" style={{ color: "var(--ops-sec)" }}>
              Thread deste post
            </span>
            <span className="h-px flex-1" style={{ background: "var(--ops-border)" }} />
            <span className="text-[10px]" style={{ color: "var(--ops-mut)" }}>
              respostas são públicas
            </span>
          </div>
        </div>
      )}

      {/* Erro de ação do painel (histórico, reenvio, status) */}
      {panelError && (
        <div
          className="flex items-start gap-2 border-b px-4 py-2 text-[11px]"
          style={{ borderColor: "var(--ops-neg)", color: "var(--ops-neg)" }}
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{panelError}</span>
          <button onClick={() => setPanelError(null)} aria-label="Fechar aviso" className="shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Mensagens */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className="flex-1 overflow-auto px-4 py-[18px] md:px-[22px]"
          style={{ background: "var(--ops-page)" }}
        >
          {hasMore && allMessages.length > 0 && (
            <div className="flex justify-center pb-3">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11px]"
                style={{ borderColor: "var(--ops-border)", color: "var(--ops-sec)", background: "var(--ops-card)" }}
              >
                {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
                Carregar anteriores
              </button>
            </div>
          )}

          {allMessages.length === 0 ? (
            <div className="py-12 text-center text-[12.5px]" style={{ color: "var(--ops-sec)" }}>
              Nenhuma mensagem ainda.
            </div>
          ) : (
            dayGroups.map((group) => (
              <section key={group.key} className="pb-2">
                {group.label && (
                  <div className="sticky top-0 z-10 flex justify-center py-1">
                    <span
                      className="text-[9.5px] font-semibold uppercase tracking-[0.04em]"
                      style={{ color: "var(--ops-mut)" }}
                    >
                      {group.label}
                    </span>
                  </div>
                )}
                {group.messages.map((m, i) => {
                  const prev = group.messages[i - 1]
                  const next = group.messages[i + 1]
                  const firstOfRun = !prev || runKey(prev) !== runKey(m)
                  const lastOfRun = !next || runKey(next) !== runKey(m)
                  return (
                    <div key={m.id} className={firstOfRun ? "mt-2.5" : "mt-0.5"}>
                      <MessageBubble
                        message={m}
                        threadId={thread.id}
                        onRetry={retryMessage}
                        showAuthor={firstOfRun && (shouldShowAuthor(m, prev) || Boolean(m.sender_username))}
                        showMeta={lastOfRun}
                        isComment={isComment}
                      />
                    </div>
                  )
                })}
              </section>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chegou mensagem enquanto o atendente lia o histórico */}
        {hasNewBelow && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-[5px] text-[11px] font-medium shadow-sm"
            style={{ background: "var(--ops-title)", color: "var(--ops-page)" }}
          >
            <ArrowDown className="h-3 w-3" />
            Novas mensagens
          </button>
        )}
      </div>

      {/* Composer */}
      <Composer
        disabled={false}
        windowClosed={hasServiceWindow && !windowOpen}
        isWhatsApp={Boolean(isWhatsApp)}
        supportsTemplates={Boolean(isCloudWhatsApp)}
        isComment={isComment}
        onSendText={sendText}
        onSendMedia={sendMedia}
        onOpenTemplates={() => setTemplatesOpen(true)}
        threadId={thread.id}
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
