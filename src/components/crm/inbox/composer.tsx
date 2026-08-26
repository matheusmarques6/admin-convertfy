"use client"

/**
 * Composer do inbox — design v3: campo único com ícones embutidos
 * (⚡ respostas rápidas, 📎 anexo, 🎙 áudio no WhatsApp, template no
 * Cloud) e botão de enviar em brand; atalhos de resposta rápida reais
 * embaixo + "⏎ envia · ⇧⏎ nova linha".
 *
 * Funcionalidade preservada: Enter envia / Shift+Enter quebra linha,
 * rascunho por conversa, "/" abre o picker, contador de 4000, erro de
 * envio visível com texto mantido, estados de janela fechada.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { FileText, Mic, Paperclip, Send, Zap } from "lucide-react"
import type { QuickReply } from "@/types/crm-inbox"
import { INBOX_BRAND } from "./inbox-theme"
import { AudioRecorder } from "./audio-recorder"
import { QuickRepliesPicker } from "./quick-replies-picker"

interface ComposerProps {
  disabled: boolean
  windowClosed: boolean
  isWhatsApp: boolean
  /** Templates Meta são exclusivos do WhatsApp OFICIAL (Cloud API). */
  supportsTemplates?: boolean
  /** Thread de comentário do Instagram: resposta é pública, só texto. */
  isComment?: boolean
  onSendText: (body: string) => Promise<void>
  onSendMedia: (file: File, mediaType: string, caption?: string) => Promise<void>
  onOpenTemplates: () => void
  /** Chave do rascunho: o texto sobrevive à troca de conversa. */
  threadId?: string
}

/** Limite do `body` na API — passar disso volta um 400 genérico. */
const MAX_LEN = 4000

/** Rascunhos por conversa, em memória (some no reload, e tudo bem). */
const drafts = new Map<string, string>()

const qrFetcher = (url: string) => fetch(url).then((r) => r.json())

function mediaTypeForFile(file: File): string {
  if (file.type.startsWith("image/")) return "image"
  if (file.type.startsWith("video/")) return "video"
  if (file.type.startsWith("audio/")) return "audio"
  return "document"
}

export function Composer({
  disabled,
  windowClosed,
  isWhatsApp,
  supportsTemplates = isWhatsApp,
  isComment = false,
  onSendText,
  onSendMedia,
  onOpenTemplates,
  threadId,
}: ComposerProps) {
  const [text, setText] = useState(() => (threadId ? drafts.get(threadId) ?? "" : ""))
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const blocked = disabled || windowClosed
  const showQuickReplies = text.startsWith("/") && !blocked
  const tooLong = text.length > MAX_LEN

  // Atalhos reais pra linha de sugestões (os 3 primeiros da org).
  const { data: qrData } = useSWR<{ quick_replies: QuickReply[] }>(
    isComment ? null : "/api/crm/inbox/quick-replies",
    qrFetcher,
    { revalidateOnFocus: false },
  )
  const shortcuts = (qrData?.quick_replies ?? []).slice(0, 3)

  // Troca de conversa: guarda o que estava digitado e recupera o
  // rascunho da nova. Antes o texto simplesmente evaporava.
  const prevThreadRef = useRef(threadId)
  useEffect(() => {
    if (prevThreadRef.current === threadId) return
    const prev = prevThreadRef.current
    if (prev) {
      if (text.trim()) drafts.set(prev, text)
      else drafts.delete(prev)
    }
    prevThreadRef.current = threadId
    setText(threadId ? drafts.get(threadId) ?? "" : "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  // Textarea que cresce com o conteúdo (até ~8 linhas).
  const autoGrow = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [])
  useEffect(() => {
    autoGrow()
  }, [text, autoGrow])

  const clearText = () => {
    setText("")
    if (threadId) drafts.delete(threadId)
  }

  const send = async () => {
    const body = text.trim()
    if (!body || sending || blocked) return
    setSending(true)
    setSendError(null)
    try {
      await onSendText(body)
      clearText()
    } catch (err) {
      // Mantém o texto digitado pra re-tentativa.
      setSendError(err instanceof Error ? err.message : "Falha no envio")
    } finally {
      setSending(false)
    }
  }

  const handleFile = async (file: File | null) => {
    if (!file || uploading) return
    setUploading(true)
    setSendError(null)
    try {
      await onSendMedia(file, mediaTypeForFile(file), text.trim() || undefined)
      clearText()
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Falha no envio da mídia")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleAudioSend = async (file: File) => {
    setUploading(true)
    setSendError(null)
    try {
      await onSendMedia(file, "audio")
      setRecording(false)
    } catch (err) {
      setRecording(false)
      setSendError(err instanceof Error ? err.message : "Falha no envio do áudio")
    } finally {
      setUploading(false)
    }
  }

  /** Substitui só o "/atalho" que está sendo digitado. */
  const applyQuickReply = (reply: QuickReply) => {
    setText((prev) => (prev.startsWith("/") ? reply.body : `${prev.replace(/\/\S*$/, "")}${reply.body}`))
    textareaRef.current?.focus()
  }

  const iconBtn = (
    title: string,
    onClick: (() => void) | undefined,
    icon: React.ReactNode,
    extra?: { active?: boolean; disabled?: boolean },
  ) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={extra?.disabled}
      className="flex shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-[5px] disabled:cursor-not-allowed disabled:opacity-40"
      style={{ color: extra?.active ? "var(--ops-title)" : "var(--ops-mut)" }}
    >
      {icon}
    </button>
  )

  const placeholder = blocked && windowClosed
    ? supportsTemplates
      ? "Janela de 24h expirada — envie um template pra reabrir"
      : isWhatsApp
        ? "Janela de 24h expirada — aguarde o contato escrever de novo"
        : "Janela de 24h expirada — reabre quando o contato escrever"
    : isComment
      ? "Responder publicamente…"
      : "Escreva uma mensagem…"

  return (
    <div
      className="relative border-t px-4 pt-3 pb-safe-3"
      style={{ borderColor: "var(--ops-border)", background: "var(--ops-card)" }}
    >
      {showQuickReplies && (
        <QuickRepliesPicker
          filter={text.slice(1)}
          onSelect={applyQuickReply}
          onClose={() => setText((prev) => (prev.startsWith("/") ? "" : prev))}
        />
      )}

      {isComment && (
        <div className="mb-[9px] text-[10.5px]" style={{ color: "var(--ops-sec)" }}>
          A resposta será publicada no post, visível para todo mundo.
        </div>
      )}

      {sendError && (
        <div
          className="mb-2 flex items-start justify-between gap-2 rounded-[8px] border px-2.5 py-1.5 text-[11px]"
          style={{ borderColor: "var(--ops-neg)", color: "var(--ops-neg)" }}
          role="alert"
        >
          <span>{sendError}</span>
          <button
            type="button"
            onClick={() => setSendError(null)}
            aria-label="Dispensar erro"
            className="shrink-0 cursor-pointer border-0 bg-transparent font-semibold"
            style={{ color: "inherit" }}
          >
            ×
          </button>
        </div>
      )}

      {recording ? (
        <AudioRecorder onSend={handleAudioSend} onCancel={() => setRecording(false)} isUploading={uploading} />
      ) : (
        <div
          className="flex items-end gap-1.5 rounded-[9px] border py-1 pl-[13px] pr-1.5"
          style={{
            borderColor: tooLong ? "var(--ops-neg)" : "var(--ops-border)",
            background: "var(--ops-page)",
            opacity: blocked ? 0.7 : 1,
          }}
        >
          <textarea
            ref={textareaRef}
            // !text-[16px] no mobile evita o zoom automático do iOS ao
            // focar (input <16px dispara o zoom). 12.5px no desktop.
            className="!text-[16px] md:!text-[12.5px] min-w-0 flex-1 resize-none border-0 bg-transparent py-[9px] leading-[1.45] outline-none"
            style={{ color: "var(--ops-title)", minHeight: 34, maxHeight: 180 }}
            placeholder={placeholder}
            value={text}
            disabled={blocked}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (showQuickReplies) return // picker captura Enter/setas
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
          />

          {!isComment &&
            iconBtn(
              'Respostas rápidas ("/")',
              () => {
                setText((prev) => (prev.startsWith("/") ? prev : "/"))
                textareaRef.current?.focus()
              },
              <Zap className="h-[15px] w-[15px]" />,
              { disabled: blocked },
            )}

          {isWhatsApp && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp,video/mp4,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              {iconBtn(
                windowClosed ? "Janela expirada — use um template" : "Anexar arquivo",
                () => fileInputRef.current?.click(),
                <Paperclip className="h-[15px] w-[15px]" />,
                { disabled: blocked || uploading },
              )}
              {iconBtn(
                windowClosed ? "Janela expirada — use um template" : "Gravar áudio",
                () => setRecording(true),
                <Mic className="h-[15px] w-[15px]" />,
                { disabled: blocked || uploading },
              )}
              {supportsTemplates &&
                iconBtn(
                  "Enviar template aprovado",
                  onOpenTemplates,
                  <FileText className="h-[15px] w-[15px]" />,
                  { disabled, active: windowClosed },
                )}
            </>
          )}

          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || sending || blocked || tooLong}
            aria-label="Enviar mensagem"
            title="Enviar (⏎)"
            className="mb-0.5 ml-0.5 flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border-0 text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: INBOX_BRAND }}
          >
            {sending ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      )}

      {!recording && (
        <div className="mt-2 flex items-center gap-2.5">
          {!isComment &&
            shortcuts.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  applyQuickReply(q)
                }}
                title={q.title || q.body}
                className="cursor-pointer border-0 bg-transparent p-0 text-[10.5px] font-medium"
                style={{ color: "var(--ops-sec)" }}
              >
                /{q.shortcut.replace(/^\//, "")}
              </button>
            ))}
          <span
            className="ml-auto text-[10px]"
            style={{ color: tooLong ? "var(--ops-neg)" : "var(--ops-mut)", fontWeight: tooLong ? 600 : 400 }}
          >
            {text.length > MAX_LEN * 0.9 ? (
              <>
                {text.length}/{MAX_LEN}
                {tooLong && " — reduza para enviar"}
              </>
            ) : (
              <span className="hidden md:inline">⏎ envia · ⇧⏎ nova linha</span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
