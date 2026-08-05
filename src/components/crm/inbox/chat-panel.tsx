"use client"

/**
 * Painel da conversa: identidade do contato + contexto de CRM, barra da
 * janela de 24h, mensagens agrupadas por dia com autoria, e composer.
 *
 * Regras de erro (o que mais faltava aqui): toda ação que fala com o
 * servidor — trocar status, carregar histórico, reenviar — precisa
 * mostrar o que deu errado. Antes, um PATCH falhando deixava o select
 * mostrando o valor novo até o refresh silenciosamente devolver o
 * antigo, e um `loadMore` com erro sumia com o botão como se o
 * histórico tivesse acabado.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, ArrowDown, ArrowLeft, ChevronUp, Loader2, X } from "lucide-react"
import { groupMessagesByDay, shouldShowAuthor } from "@/lib/services/crm-inbox-format"
import type { InboxMessage, ThreadDetail } from "@/types/crm-inbox"
import { AssignDropdown } from "./assign-dropdown"
import { Composer } from "./composer"
import { ContactContext } from "./contact-context"
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

/** Iniciais do contato para o avatar sem foto. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function ChatPanel({ detail, onBack, onRefresh, onThreadsRefresh }: ChatPanelProps) {
  const thread = detail.thread
  const isWhatsApp = thread.channel?.type === "whatsapp"
  const isInstagram = thread.channel?.type === "instagram"
  const isEvolution = thread.channel?.provider === "evolution"
  // Janela de 24h: WhatsApp OFICIAL (Cloud) e Instagram têm; Evolution
  // (Baileys) é free-form sempre. O Instagram ficava sem NENHUM aviso —
  // a Meta rejeitava o envio e o atendente não sabia por quê.
  const isCloudWhatsApp = isWhatsApp && !isEvolution
  const hasServiceWindow = isCloudWhatsApp || isInstagram
  const windowOpen = windowIsOpen(thread.is_window_open, thread.window_expires_at)

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
  // (só se o usuário já estava no fim — não interrompe leitura de
  // histórico; nesse caso avisa com o botão "novas mensagens").
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
      // Prepend empurra o conteúdo pra baixo — sem compensar, o leitor
      // é teleportado pra outro ponto da conversa a cada clique.
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
      // A rota agora devolve 502 quando o provedor recusa — o texto
      // volta pro composer e o erro aparece, em vez de sumir.
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
      await onRefresh()
      onThreadsRefresh()
      throw new Error(data.error || "Falha no envio do template")
    }
    await onRefresh()
    onThreadsRefresh()
  }

  /**
   * Reenvio: só texto tem como ser refeito pelo servidor (a mídia
   * original não fica guardada). Antes o botão aparecia em qualquer
   * mensagem falha e o clique em mídia simplesmente não fazia nada.
   */
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

  const handleStatusChange = async (newStatus: string) => {
    setSavingStatus(true)
    setPanelError(null)
    try {
      const res = await fetch(`/api/crm/inbox/threads/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
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

  return (
    <>
      {/* Header — no mobile as ações (tags/atribuir/status) caem numa
          segunda linha rolável; no desktop (md) tudo numa linha só. */}
      <div
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-2 md:flex-nowrap"
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

          {/* Avatar do contato — a API já devolvia a foto e a tela
              mostrava um ícone de telefone genérico. */}
          {thread.contact_avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thread.contact_avatar_url}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full object-cover"
              style={{ border: "1px solid var(--crm-gray-200)" }}
            />
          ) : (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{
                background: "var(--crm-gray-100)",
                color: "var(--crm-gray-600)",
                fontSize: "var(--crm-text-xs)",
                fontWeight: 600,
              }}
              aria-hidden
            >
              {initials(contactLabel)}
            </span>
          )}

          <div className="flex min-w-0 flex-col justify-center">
            <span
              className="truncate"
              style={{
                fontSize: "var(--crm-text-md)",
                fontWeight: "var(--crm-weight-medium)" as React.CSSProperties["fontWeight"],
                color: "var(--crm-gray-900)",
                lineHeight: 1.2,
              }}
            >
              {contactLabel}
            </span>
            <span
              className="truncate"
              style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)", lineHeight: 1.3 }}
            >
              {thread.contact_name ? `${thread.contact_external_id} · ` : ""}
              {thread.channel?.display_name ?? ""}
              {isWhatsApp ? (isEvolution ? " · WhatsApp (QR)" : " · WhatsApp Oficial") : ""}
              {isInstagram ? " · Instagram" : ""}
            </span>
          </div>
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
            disabled={savingStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="crm-input"
            style={{ height: "var(--crm-button-height-sm)", opacity: savingStatus ? 0.6 : 1 }}
            aria-label="Status da conversa"
          >
            <option value="open">Aberto</option>
            <option value="pending">Pendente</option>
            <option value="resolved">Resolvido</option>
            <option value="archived">Arquivado</option>
          </select>
        </div>
      </div>

      {/* Quem é essa pessoa no CRM (negócio / cliente / lead) */}
      <ContactContext thread={thread} />

      {/* Janela de 24h — WhatsApp oficial e Instagram (Evolution não tem) */}
      {hasServiceWindow && (
        <ServiceWindowBar
          isWindowOpen={thread.is_window_open}
          windowExpiresAt={thread.window_expires_at}
          onOpenTemplates={isCloudWhatsApp ? () => setTemplatesOpen(true) : undefined}
          channelLabel={isInstagram ? "Instagram" : "WhatsApp"}
        />
      )}

      {/* Erro de ação do painel (status, histórico, reenvio) */}
      {panelError && (
        <div
          className="flex items-start gap-2 border-b px-4 py-2"
          style={{
            borderColor: "var(--crm-neg-border)",
            background: "var(--crm-neg-bg)",
            color: "var(--crm-neg)",
            fontSize: "var(--crm-text-xs)",
          }}
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
          className="flex-1 overflow-auto px-4 py-4"
          style={{ background: "var(--crm-gray-50)" }}
        >
          {hasMore && allMessages.length > 0 && (
            <div className="flex justify-center pb-3">
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
              className="py-12 text-center"
              style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}
            >
              Nenhuma mensagem ainda.
            </div>
          ) : (
            dayGroups.map((group) => (
              <section key={group.key} className="space-y-3 pb-3">
                {/* Separador de dia — sem isso a conversa é uma parede
                    de bolhas com só HH:MM em cada uma. */}
                {group.label && (
                  <div className="sticky top-0 z-10 flex justify-center py-1">
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        letterSpacing: "0.03em",
                        textTransform: "uppercase",
                        color: "var(--crm-gray-600)",
                        background: "var(--crm-gray-0)",
                        border: "1px solid var(--crm-gray-200)",
                        borderRadius: "var(--crm-radius-full)",
                        padding: "2px 10px",
                      }}
                    >
                      {group.label}
                    </span>
                  </div>
                )}
                {group.messages.map((m, i) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    threadId={thread.id}
                    onRetry={retryMessage}
                    showAuthor={shouldShowAuthor(m, group.messages[i - 1])}
                  />
                ))}
              </section>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chegou mensagem enquanto o atendente lia o histórico */}
        {hasNewBelow && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 shadow-sm"
            style={{
              fontSize: "var(--crm-text-xs)",
              fontWeight: 500,
              color: "var(--crm-gray-0)",
              background: "var(--crm-gray-900)",
              borderRadius: "var(--crm-radius-full)",
              padding: "5px 12px",
            }}
          >
            <ArrowDown className="h-3 w-3" />
            Novas mensagens
          </button>
        )}
      </div>

      {/* Composer — evolution mantém anexo/áudio, mas nunca bloqueia por
          janela e não oferece template (exclusivos do cloud oficial) */}
      <Composer
        disabled={false}
        windowClosed={hasServiceWindow && !windowOpen}
        isWhatsApp={Boolean(isWhatsApp)}
        supportsTemplates={Boolean(isCloudWhatsApp)}
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
