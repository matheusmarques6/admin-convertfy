"use client"

/**
 * Composer do inbox: texto (⌘/Ctrl+Enter), anexo de mídia, nota de voz,
 * "/" abre quick replies e botão de template.
 *
 * Quando a janela de 24h está fechada (WhatsApp), texto/mídia/áudio
 * ficam DESABILITADOS — só o fluxo de template fica ativo (o gate real
 * é do backend; aqui é UX).
 */

import { useRef, useState } from "react"
import { FileText, Mic, Paperclip, Send } from "lucide-react"
import type { QuickReply } from "@/types/crm-inbox"
import { AudioRecorder } from "./audio-recorder"
import { QuickRepliesPicker } from "./quick-replies-picker"

interface ComposerProps {
  disabled: boolean
  windowClosed: boolean
  isWhatsApp: boolean
  /**
   * Templates Meta são exclusivos do WhatsApp OFICIAL (Cloud API).
   * Canais Evolution/Baileys escondem o botão (default: isWhatsApp).
   */
  supportsTemplates?: boolean
  onSendText: (body: string) => Promise<void>
  onSendMedia: (file: File, mediaType: string, caption?: string) => Promise<void>
  onOpenTemplates: () => void
}

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
  onSendText,
  onSendMedia,
  onOpenTemplates,
}: ComposerProps) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const blocked = disabled || (isWhatsApp && windowClosed)
  const showQuickReplies = text.startsWith("/") && !blocked

  const send = async () => {
    const body = text.trim()
    if (!body || sending || blocked) return
    setSending(true)
    try {
      await onSendText(body)
      setText("")
    } finally {
      setSending(false)
    }
  }

  const handleFile = async (file: File | null) => {
    if (!file || uploading) return
    setUploading(true)
    try {
      await onSendMedia(file, mediaTypeForFile(file), text.trim() || undefined)
      setText("")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleAudioSend = async (file: File) => {
    setUploading(true)
    try {
      await onSendMedia(file, "audio")
      setRecording(false)
    } finally {
      setUploading(false)
    }
  }

  const applyQuickReply = (reply: QuickReply) => {
    setText(reply.body)
    textareaRef.current?.focus()
  }

  return (
    <div
      className="relative border-t px-4 py-3"
      style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-0)" }}
    >
      {showQuickReplies && (
        <QuickRepliesPicker
          filter={text.slice(1)}
          onSelect={applyQuickReply}
          onClose={() => setText("")}
        />
      )}

      {recording ? (
        <AudioRecorder
          onSend={handleAudioSend}
          onCancel={() => setRecording(false)}
          isUploading={uploading}
        />
      ) : (
        <div className="flex items-end gap-2">
          {/* Anexo */}
          {isWhatsApp && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp,video/mp4,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={blocked || uploading}
                title={windowClosed ? "Janela expirada — use um template" : "Anexar mídia"}
                className="flex h-9 w-9 shrink-0 items-center justify-center"
                style={{
                  borderRadius: "var(--crm-radius-md)",
                  border: "1px solid var(--crm-gray-200)",
                  background: "transparent",
                  color: "var(--crm-gray-500)",
                  cursor: blocked ? "not-allowed" : "pointer",
                  opacity: blocked || uploading ? 0.5 : 1,
                }}
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                onClick={() => setRecording(true)}
                disabled={blocked || uploading}
                title={windowClosed ? "Janela expirada — use um template" : "Gravar nota de voz"}
                className="flex h-9 w-9 shrink-0 items-center justify-center"
                style={{
                  borderRadius: "var(--crm-radius-md)",
                  border: "1px solid var(--crm-gray-200)",
                  background: "transparent",
                  color: "var(--crm-gray-500)",
                  cursor: blocked ? "not-allowed" : "pointer",
                  opacity: blocked || uploading ? 0.5 : 1,
                }}
              >
                <Mic className="h-4 w-4" />
              </button>
              {supportsTemplates && (
                <button
                  onClick={onOpenTemplates}
                  disabled={disabled}
                  title="Enviar template aprovado"
                  className="flex h-9 w-9 shrink-0 items-center justify-center"
                  style={{
                    borderRadius: "var(--crm-radius-md)",
                    border: "1px solid var(--crm-gray-200)",
                    background: windowClosed ? "var(--crm-gray-900)" : "transparent",
                    color: windowClosed ? "var(--crm-gray-0)" : "var(--crm-gray-500)",
                    cursor: "pointer",
                  }}
                >
                  <FileText className="h-4 w-4" />
                </button>
              )}
            </>
          )}

          <textarea
            ref={textareaRef}
            className="crm-input flex-1"
            style={{ height: "auto", minHeight: 38, padding: 8, resize: "none", opacity: blocked ? 0.6 : 1 }}
            placeholder={
              blocked && isWhatsApp && windowClosed
                ? "Janela de 24h expirada — envie um template pra reabrir"
                : 'Digite sua mensagem... ("/" para respostas rápidas)'
            }
            value={text}
            disabled={blocked}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (showQuickReplies) return // picker captura Enter/setas
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                send()
              }
            }}
            rows={2}
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending || blocked}
            className="crm-button-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--crm-space-2)",
              opacity: !text.trim() || sending || blocked ? 0.5 : 1,
            }}
          >
            {sending ? "..." : <Send className="h-3.5 w-3.5" />}
            Enviar
          </button>
        </div>
      )}

      {!recording && (
        <div className="mt-1" style={{ fontSize: 10, color: "var(--crm-gray-400)" }}>
          ⌘/Ctrl + Enter para enviar{isWhatsApp ? ' · "/" respostas rápidas' : ""}
        </div>
      )}
    </div>
  )
}
