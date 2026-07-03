"use client"

/**
 * Popover de respostas rápidas — abre quando o composer começa com "/".
 * Filtra por shortcut/título; Enter ou clique insere o body no composer.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { Zap } from "lucide-react"
import type { QuickReply } from "@/types/crm-inbox"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface QuickRepliesPickerProps {
  /** Texto após a "/" usado como filtro. */
  filter: string
  onSelect: (reply: QuickReply) => void
  onClose: () => void
}

export function QuickRepliesPicker({ filter, onSelect, onClose }: QuickRepliesPickerProps) {
  const { data } = useSWR<{ quick_replies: QuickReply[] }>("/api/crm/inbox/quick-replies", fetcher)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const replies = useMemo(() => {
    const all = data?.quick_replies ?? []
    const f = filter.toLowerCase()
    if (!f) return all
    return all.filter(
      (r) => r.shortcut.toLowerCase().includes(f) || (r.title ?? "").toLowerCase().includes(f),
    )
  }, [data, filter])

  useEffect(() => setHighlighted(0), [filter])

  // Navegação por teclado (o composer delega os eventos via window)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setHighlighted((h) => Math.min(h + 1, replies.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setHighlighted((h) => Math.max(h - 1, 0))
      } else if (e.key === "Enter" && replies[highlighted]) {
        e.preventDefault()
        onSelect(replies[highlighted])
      } else if (e.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", handler, true)
    return () => window.removeEventListener("keydown", handler, true)
  }, [replies, highlighted, onSelect, onClose])

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-1 overflow-auto"
      style={{
        maxHeight: 220,
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-gray-200)",
        borderRadius: "var(--crm-radius-md)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        zIndex: 20,
      }}
    >
      {replies.length === 0 ? (
        <div style={{ padding: "10px 12px", fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
          Nenhuma resposta rápida{filter ? ` para "/${filter}"` : ""}. Crie em Canais → Respostas rápidas.
        </div>
      ) : (
        replies.map((r, i) => (
          <button
            key={r.id}
            onClick={() => onSelect(r)}
            onMouseEnter={() => setHighlighted(i)}
            className="w-full text-left flex items-start gap-2"
            style={{
              padding: "8px 12px",
              background: i === highlighted ? "var(--crm-gray-100)" : "transparent",
              border: "none",
              cursor: "pointer",
              borderBottom: "1px solid var(--crm-gray-100)",
            }}
          >
            <Zap className="h-3 w-3 mt-0.5 shrink-0" style={{ color: "var(--crm-brand)" }} />
            <span className="min-w-0">
              <span style={{ fontSize: "var(--crm-text-xs)", fontWeight: "var(--crm-weight-medium)" as React.CSSProperties["fontWeight"], color: "var(--crm-gray-900)", fontFamily: "var(--crm-font-mono)" }}>
                /{r.shortcut}
              </span>
              {r.title && (
                <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)", marginLeft: 6 }}>{r.title}</span>
              )}
              <span className="block truncate" style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-600)", marginTop: 2 }}>
                {r.body}
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  )
}
