"use client"

/**
 * Bolha de mensagem do inbox — render por content_type (texto, imagem
 * com lightbox, áudio, vídeo, documento, sticker, location, template/
 * interactive/system), status de entrega ✓/✓✓/✓✓-azul e retry.
 *
 * Mídia com signed URL expirada (1h) ou legado wa-media:{id}: o onError
 * do elemento dispara refresh via GET /media?message_id= — se a Meta já
 * expirou o media_id (410), mostra "mídia indisponível".
 */

import { useCallback, useState } from "react"
import { Bot, Check, CheckCheck, Download, FileText, ImageOff, MapPin, RefreshCw, Smartphone, X } from "lucide-react"
import { messageAuthor } from "@/lib/services/crm-inbox-format"
import type { InboxMessage } from "@/types/crm-inbox"

interface MessageBubbleProps {
  message: InboxMessage
  threadId: string
  onRetry?: (message: InboxMessage) => void
  /** Rótulo de quem enviou — só na primeira de uma sequência do mesmo autor. */
  showAuthor?: boolean
}

export function MessageBubble({ message: m, threadId, onRetry, showAuthor }: MessageBubbleProps) {
  const isOut = m.direction === "outbound"
  const author = messageAuthor(m)
  const [mediaUrl, setMediaUrl] = useState(m.media_url)
  const [mediaState, setMediaState] = useState<"ok" | "refreshing" | "gone">("ok")
  const [lightbox, setLightbox] = useState(false)

  const refreshMedia = useCallback(async () => {
    if (mediaState === "refreshing") return
    setMediaState("refreshing")
    try {
      const res = await fetch(`/api/crm/inbox/threads/${threadId}/media?message_id=${m.id}`)
      if (res.status === 410) {
        setMediaState("gone")
        return
      }
      const data = await res.json()
      if (data.media_url) {
        setMediaUrl(data.media_url)
        setMediaState("ok")
      } else {
        setMediaState("gone")
      }
    } catch {
      setMediaState("gone")
    }
  }, [m.id, threadId, mediaState])

  const hasMedia = ["image", "audio", "video", "document", "sticker"].includes(m.content_type)
  // Sentinela legada wa-media:{id} não é URL — força refresh no primeiro render
  const usableUrl = mediaUrl && !mediaUrl.startsWith("wa-media:") ? mediaUrl : null

  // Mensagens de sistema (reações etc.) — centralizadas, discretas
  if (m.content_type === "system") {
    return (
      <div className="flex justify-center">
        <span
          style={{
            fontSize: "var(--crm-text-xs)",
            color: "var(--crm-gray-500)",
            background: "var(--crm-gray-100)",
            padding: "2px 10px",
            borderRadius: "var(--crm-radius-full)",
          }}
        >
          {m.body}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex flex-col ${isOut ? "items-end" : "items-start"}`}>
      {/* Quem enviou: atendente, automação ou o celular pareado. Sem
          isso, num time com vários atendentes ninguém sabe quem falou
          com o cliente — nem se foi uma pessoa. */}
      {showAuthor && author.label && (
        <span
          className="mb-0.5 flex items-center gap-1 px-1"
          style={{ fontSize: 10, color: "var(--crm-gray-500)" }}
        >
          {author.kind === "automation" && <Bot className="h-2.5 w-2.5" />}
          {author.kind === "device" && <Smartphone className="h-2.5 w-2.5" />}
          {author.label}
        </span>
      )}
      <div
        className="max-w-[85%] md:max-w-[70%]"
        style={{
          background: isOut ? "var(--crm-gray-900)" : "var(--crm-gray-0)",
          color: isOut ? "var(--crm-gray-0)" : "var(--crm-gray-900)",
          padding: hasMedia && usableUrl && m.content_type === "image" ? 4 : "8px 12px",
          borderRadius: "var(--crm-radius-md)",
          border: isOut ? "none" : "1px solid var(--crm-gray-200)",
          fontSize: "var(--crm-text-base)",
          lineHeight: "var(--crm-leading-normal)",
          whiteSpace: "pre-wrap",
          overflow: "hidden",
        }}
      >
        {hasMedia && (
          <MediaContent
            message={m}
            usableUrl={usableUrl}
            mediaState={mediaState}
            onRefresh={refreshMedia}
            onOpenLightbox={() => setLightbox(true)}
            isOut={isOut}
          />
        )}

        {m.content_type === "location" && m.body && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(m.body.split(" · ")[0])}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 underline"
            style={{ color: "inherit" }}
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {m.body}
          </a>
        )}

        {m.content_type !== "location" && m.body && (
          <div style={{ padding: hasMedia && usableUrl && m.content_type === "image" ? "4px 8px 0" : 0 }}>
            {m.body}
          </div>
        )}
        {!m.body && !hasMedia && m.content_type !== "location" && `[${m.content_type}]`}

        {/* Rodapé: hora + status */}
        <div
          className="mt-1 flex items-center justify-end gap-1"
          style={{
            fontSize: 10,
            color: isOut ? "rgba(255,255,255,0.55)" : "var(--crm-gray-400)",
            padding: hasMedia && usableUrl && m.content_type === "image" ? "0 8px 4px" : 0,
          }}
        >
          <span>
            {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {isOut && <StatusTicks status={m.status} />}
        </div>

        {m.status === "failed" && (
          <div
            className="mt-1 flex items-center gap-2"
            style={{ fontSize: 10, color: isOut ? "#FCA5A5" : "var(--crm-danger-fg)" }}
          >
            <X className="h-3 w-3 shrink-0" />
            <span className="min-w-0 truncate">{m.error_message || "Falha no envio"}</span>
            {onRetry && m.content_type === "text" && (
              <button
                onClick={() => onRetry(m)}
                className="shrink-0 underline"
                style={{ color: "inherit", background: "none", border: "none", cursor: "pointer", fontSize: 10 }}
              >
                Reenviar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lightbox simples pra imagem */}
      {lightbox && usableUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.8)" }}
          onClick={() => setLightbox(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={usableUrl} alt={m.body || "imagem"} style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain" }} />
        </div>
      )}
    </div>
  )
}

function MediaContent({
  message: m,
  usableUrl,
  mediaState,
  onRefresh,
  onOpenLightbox,
  isOut,
}: {
  message: InboxMessage
  usableUrl: string | null
  mediaState: "ok" | "refreshing" | "gone"
  onRefresh: () => void
  onOpenLightbox: () => void
  isOut: boolean
}) {
  if (mediaState === "gone") {
    return (
      <div
        className="flex items-center gap-2"
        style={{ fontSize: "var(--crm-text-xs)", color: isOut ? "rgba(255,255,255,0.6)" : "var(--crm-gray-500)", padding: "4px 0" }}
      >
        <ImageOff className="h-3.5 w-3.5" /> Mídia indisponível (expirada na Meta)
      </div>
    )
  }

  if (!usableUrl) {
    return (
      <button
        onClick={onRefresh}
        className="flex items-center gap-2"
        style={{
          fontSize: "var(--crm-text-xs)",
          color: isOut ? "rgba(255,255,255,0.7)" : "var(--crm-gray-600)",
          background: "none",
          border: "1px dashed currentColor",
          borderRadius: "var(--crm-radius-sm)",
          padding: "6px 10px",
          cursor: "pointer",
        }}
      >
        <RefreshCw className={`h-3 w-3 ${mediaState === "refreshing" ? "animate-spin" : ""}`} />
        {mediaState === "refreshing" ? "Carregando mídia…" : `Carregar ${labelForType(m.content_type)}`}
      </button>
    )
  }

  switch (m.content_type) {
    case "image":
    case "sticker":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={usableUrl}
          alt={m.body || m.content_type}
          onError={onRefresh}
          onClick={onOpenLightbox}
          style={{
            maxWidth: "100%",
            maxHeight: m.content_type === "sticker" ? 120 : 280,
            borderRadius: "var(--crm-radius-sm)",
            cursor: "zoom-in",
            display: "block",
          }}
        />
      )
    case "audio":
      return <audio controls src={usableUrl} onError={onRefresh} style={{ height: 36, maxWidth: 260 }} />
    case "video":
      return (
        <video
          controls
          src={usableUrl}
          onError={onRefresh}
          style={{ maxWidth: "100%", maxHeight: 280, borderRadius: "var(--crm-radius-sm)", display: "block" }}
        />
      )
    case "document":
      return (
        <a
          href={usableUrl}
          target="_blank"
          rel="noreferrer"
          download={m.media_filename ?? undefined}
          className="flex items-center gap-2"
          style={{
            padding: "6px 8px",
            borderRadius: "var(--crm-radius-sm)",
            background: isOut ? "rgba(255,255,255,0.1)" : "var(--crm-gray-100)",
            color: "inherit",
            textDecoration: "none",
            fontSize: "var(--crm-text-xs)",
          }}
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{m.media_filename || "Documento"}</span>
          <Download className="h-3 w-3 shrink-0 ml-auto" />
        </a>
      )
    default:
      return null
  }
}

function labelForType(t: string): string {
  switch (t) {
    case "image": return "imagem"
    case "audio": return "áudio"
    case "video": return "vídeo"
    case "document": return "documento"
    case "sticker": return "sticker"
    default: return "mídia"
  }
}

function StatusTicks({ status }: { status: string }) {
  switch (status) {
    case "queued":
      return <span title="Enviando">…</span>
    case "sent":
      return <Check className="h-3 w-3" aria-label="Enviado" />
    case "delivered":
      return <CheckCheck className="h-3 w-3" aria-label="Entregue" />
    case "read":
      return <CheckCheck className="h-3 w-3" style={{ color: "#60A5FA" }} aria-label="Lido" />
    case "failed":
      return <X className="h-3 w-3" style={{ color: "#FCA5A5" }} aria-label="Falhou" />
    default:
      return null
  }
}
