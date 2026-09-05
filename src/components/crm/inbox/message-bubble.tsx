"use client"

/**
 * Bolha de mensagem do inbox — design v3: saída em brand indigo, entrada
 * em cinza suave, meta (autor · hora · status) FORA da bolha e só na
 * última mensagem de uma sequência do mesmo autor.
 *
 * Mantém tudo que já funcionava: render por content_type (texto, imagem
 * com lightbox, áudio, vídeo, documento, sticker, location, system),
 * refresh de mídia expirada (signed URL 1h / legado wa-media:{id}) e
 * retry de texto falho.
 */

import { useCallback, useState, useRef } from "react"
import { Bot, Download, FileText, ImageOff, MapPin, RefreshCw, Smartphone, X } from "lucide-react"
import { messageAuthor } from "@/lib/services/crm-inbox-format"
import type { InboxMessage } from "@/types/crm-inbox"
import { INBOX_BRAND, TNUM } from "./inbox-theme"

interface MessageBubbleProps {
  message: InboxMessage
  threadId: string
  onRetry?: (message: InboxMessage) => void
  /** Rótulo de quem enviou — só na primeira de uma sequência do mesmo autor. */
  showAuthor?: boolean
  /** Meta (hora · status) — só na última de uma sequência do mesmo autor. */
  showMeta?: boolean
  /** Thread de comentário: respostas out são públicas no post. */
  isComment?: boolean
}

function statusLabel(status: string): string | null {
  switch (status) {
    case "queued":
      return "enviando…"
    case "sent":
      return "enviado"
    case "delivered":
      return "entregue"
    case "read":
      return "visto"
    default:
      return null
  }
}

const MAX_MEDIA_REFRESH = 2

export function MessageBubble({
  message: m,
  threadId,
  onRetry,
  showAuthor,
  showMeta = true,
  isComment = false,
}: MessageBubbleProps) {
  const isOut = m.direction === "outbound"
  const author = messageAuthor(m)
  const [mediaUrl, setMediaUrl] = useState(m.media_url)
  const [mediaState, setMediaState] = useState<"ok" | "refreshing" | "gone">("ok")
  const [lightbox, setLightbox] = useState(false)

  // Cada refresh é um GET que ANTES também escrevia no banco. Sem teto,
  // uma URL assinada que falha de novo vira laço: erro -> fetch -> render
  // -> erro. Duas tentativas e para.
  const mediaAttemptsRef = useRef(0)

  const refreshMedia = useCallback(async () => {
    if (mediaState === "refreshing" || mediaState === "gone") return
    if (mediaAttemptsRef.current >= MAX_MEDIA_REFRESH) {
      setMediaState("gone")
      return
    }
    mediaAttemptsRef.current += 1
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
  const isBareImage = hasMedia && usableUrl && m.content_type === "image"

  // Mensagens de sistema (reações etc.) — centralizadas, discretas
  if (m.content_type === "system") {
    return (
      <div className="flex justify-center">
        <span
          className="rounded-full px-2.5 py-0.5 text-[10.5px]"
          style={{ background: "var(--ops-hover, rgba(0,0,0,0.05))", color: "var(--ops-sec)" }}
        >
          {m.body}
        </span>
      </div>
    )
  }

  // Autor da entrada: em comentário/grupo, o username do remetente vem
  // por mensagem (metadata) — o rótulo padrão só cobre saídas.
  const inboundAuthor = !isOut ? m.sender_username : null

  return (
    <div className={`flex flex-col ${isOut ? "items-end" : "items-start"}`}>
      {showAuthor && (author.label || inboundAuthor) && (
        <span
          className="mx-0.5 mb-[3px] flex items-center gap-1 text-[10px] font-semibold"
          style={{ color: "var(--ops-mut)" }}
        >
          {author.kind === "automation" && <Bot className="h-2.5 w-2.5" />}
          {author.kind === "device" && <Smartphone className="h-2.5 w-2.5" />}
          {isOut ? author.label : inboundAuthor || author.label}
        </span>
      )}

      <div
        className={`max-w-[85%] overflow-hidden whitespace-pre-wrap rounded-[10px] text-[12.5px] leading-[1.55] md:max-w-[56%] ${
          isOut ? "" : "bg-[#F1F2F5] dark:bg-white/[0.055]"
        }`}
        style={{
          background: isOut ? INBOX_BRAND : undefined,
          color: isOut ? "#fff" : "var(--ops-title)",
          padding: isBareImage ? 4 : "8px 12px",
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
          <div style={{ padding: isBareImage ? "4px 8px 2px" : 0 }}>{m.body}</div>
        )}
        {!m.body && !hasMedia && m.content_type !== "location" && `[${m.content_type}]`}
      </div>

      {/* Falha: motivo + reenviar (texto) logo abaixo da bolha */}
      {m.status === "failed" && (
        <div className="mt-1 flex items-center gap-2 px-0.5 text-[10px]" style={{ color: "var(--ops-neg)" }}>
          <X className="h-3 w-3 shrink-0" />
          <span className="min-w-0 truncate">{m.error_message || "Falha no envio"}</span>
          {onRetry && m.content_type === "text" && (
            <button
              onClick={() => onRetry(m)}
              className="shrink-0 cursor-pointer border-0 bg-transparent text-[10px] underline"
              style={{ color: "inherit" }}
            >
              Reenviar
            </button>
          )}
        </div>
      )}

      {/* Meta fora da bolha — só no fim da sequência */}
      {showMeta && m.status !== "failed" && (
        <span className="mx-0.5 mb-1.5 mt-1 text-[9.5px]" style={{ color: "var(--ops-mut)", ...TNUM }}>
          {isOut && !isComment && author.label ? `${author.label} · ` : ""}
          {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          {isOut && statusLabel(m.status) ? ` · ${statusLabel(m.status)}` : ""}
          {isOut && isComment ? " · resposta pública" : ""}
        </span>
      )}

      {/* Lightbox simples pra imagem */}
      {lightbox && usableUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.8)" }}
          onClick={() => setLightbox(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={usableUrl}
            alt={m.body || "imagem"}
            style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain" }}
          />
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
        className="flex items-center gap-2 py-1 text-[11px]"
        style={{ color: isOut ? "rgba(255,255,255,0.6)" : "var(--ops-sec)" }}
      >
        <ImageOff className="h-3.5 w-3.5" /> Mídia indisponível (expirada na Meta)
      </div>
    )
  }

  if (!usableUrl) {
    return (
      <button
        onClick={onRefresh}
        className="flex cursor-pointer items-center gap-2 rounded-[6px] border border-dashed border-current bg-transparent px-2.5 py-1.5 text-[11px]"
        style={{ color: isOut ? "rgba(255,255,255,0.7)" : "var(--ops-sec)" }}
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
            borderRadius: 7,
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
          style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 7, display: "block" }}
        />
      )
    case "document":
      return (
        <a
          href={usableUrl}
          target="_blank"
          rel="noreferrer"
          download={m.media_filename ?? undefined}
          className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[11px] no-underline"
          style={{
            background: isOut ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.05)",
            color: "inherit",
          }}
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{m.media_filename || "Documento"}</span>
          <Download className="ml-auto h-3 w-3 shrink-0" />
        </a>
      )
    default:
      return null
  }
}

function labelForType(t: string): string {
  switch (t) {
    case "image":
      return "imagem"
    case "audio":
      return "áudio"
    case "video":
      return "vídeo"
    case "document":
      return "documento"
    case "sticker":
      return "sticker"
    default:
      return "mídia"
  }
}
