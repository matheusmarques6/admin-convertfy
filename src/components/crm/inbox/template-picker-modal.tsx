"use client"

/**
 * Picker de templates Meta aprovados — form de variáveis {{n}} com
 * preview do body preenchido + botão de sync manual com a Meta.
 * Único caminho de envio quando a janela de 24h expira.
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import { FileText, Loader2, RefreshCw, Send, X } from "lucide-react"
import type { WhatsAppTemplate } from "@/types/crm-inbox"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface TemplatePickerModalProps {
  channelId: string
  onSend: (args: { templateName: string; language: string; params: string[] }) => Promise<void>
  onClose: () => void
}

export function TemplatePickerModal({ channelId, onSend, onClose }: TemplatePickerModalProps) {
  const { data, mutate, isLoading } = useSWR<{ templates: WhatsAppTemplate[] }>(
    `/api/crm/whatsapp/templates?channel_id=${channelId}&approved=1`,
    fetcher,
  )
  const templates = useMemo(() => data?.templates ?? [], [data])

  const [selected, setSelected] = useState<WhatsAppTemplate | null>(null)
  const [params, setParams] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = (tpl: WhatsAppTemplate) => {
    setSelected(tpl)
    setParams(Array.from({ length: tpl.body_variables }, () => ""))
    setError(null)
  }

  const preview = useMemo(() => {
    if (!selected?.body_text) return null
    let text = selected.body_text
    params.forEach((p, i) => {
      text = text.replaceAll(`{{${i + 1}}}`, p || `{{${i + 1}}}`)
    })
    return text
  }, [selected, params])

  const handleSync = async () => {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch("/api/crm/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, action: "sync" }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || "Sync falhou")
      }
      await mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync falhou")
    } finally {
      setSyncing(false)
    }
  }

  const handleSend = async () => {
    if (!selected || sending) return
    if (params.some((p) => !p.trim())) {
      setError("Preencha todas as variáveis do template.")
      return
    }
    setSending(true)
    setError(null)
    try {
      await onSend({ templateName: selected.name, language: selected.language, params })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envio falhou")
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden"
        style={{
          maxHeight: "80vh",
          background: "var(--crm-gray-0)",
          borderRadius: "var(--crm-radius-lg)",
          border: "1px solid var(--crm-gray-200)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--crm-gray-200)" }}
        >
          <h3 style={{ fontSize: "var(--crm-text-md)", fontWeight: "var(--crm-weight-medium)" as React.CSSProperties["fontWeight"], color: "var(--crm-gray-900)" }}>
            Enviar template
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="crm-button-ghost flex items-center gap-1.5"
              title="Sincronizar templates com a Meta"
            >
              <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
              Sincronizar
            </button>
            <button
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded"
              style={{ background: "transparent", border: "none", color: "var(--crm-gray-500)", cursor: "pointer" }}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8" style={{ color: "var(--crm-gray-400)" }}>
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-6 w-6 mx-auto mb-2" style={{ color: "var(--crm-gray-300)" }} />
              <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-600)" }}>
                Nenhum template aprovado sincronizado.
              </p>
              <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)", marginTop: 4 }}>
                Clique em &ldquo;Sincronizar&rdquo; pra buscar os templates da Meta.
              </p>
            </div>
          ) : !selected ? (
            <div className="space-y-1.5">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => pick(tpl)}
                  className="w-full text-left"
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--crm-radius-md)",
                    border: "1px solid var(--crm-gray-200)",
                    background: "var(--crm-gray-0)",
                    cursor: "pointer",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: "var(--crm-text-sm)", fontWeight: "var(--crm-weight-medium)" as React.CSSProperties["fontWeight"], color: "var(--crm-gray-900)", fontFamily: "var(--crm-font-mono)" }}>
                      {tpl.name}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--crm-gray-500)" }}>
                      {tpl.language}
                      {tpl.category ? ` · ${tpl.category}` : ""}
                      {tpl.body_variables > 0 ? ` · ${tpl.body_variables} var` : ""}
                    </span>
                  </div>
                  {tpl.body_text && (
                    <p className="truncate" style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)", marginTop: 4 }}>
                      {tpl.body_text}
                    </p>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div>
              <button
                onClick={() => setSelected(null)}
                className="crm-button-ghost mb-3"
                style={{ fontSize: "var(--crm-text-xs)" }}
              >
                ← Escolher outro template
              </button>

              {/* Variáveis */}
              {selected.body_variables > 0 && (
                <div className="space-y-2 mb-3">
                  {params.map((p, i) => (
                    <div key={i}>
                      <label style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-600)", display: "block", marginBottom: 2 }}>
                        Variável {`{{${i + 1}}}`}
                      </label>
                      <input
                        className="crm-input w-full"
                        value={p}
                        onChange={(e) =>
                          setParams((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                        }
                        placeholder={`Valor de {{${i + 1}}}`}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Preview */}
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--crm-radius-md)",
                  background: "var(--crm-gray-50)",
                  border: "1px solid var(--crm-gray-200)",
                  fontSize: "var(--crm-text-sm)",
                  color: "var(--crm-gray-800)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {selected.header_text && (
                  <p style={{ fontWeight: "var(--crm-weight-medium)" as React.CSSProperties["fontWeight"], marginBottom: 6 }}>{selected.header_text}</p>
                )}
                {preview}
                {selected.footer_text && (
                  <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)", marginTop: 6 }}>{selected.footer_text}</p>
                )}
              </div>
            </div>
          )}

          {error && (
            <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-danger-fg)", marginTop: 8 }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        {selected && (
          <div
            className="flex items-center justify-end gap-2 border-t px-4 py-3"
            style={{ borderColor: "var(--crm-gray-200)" }}
          >
            <button onClick={onClose} className="crm-button-ghost">
              Cancelar
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="crm-button-primary flex items-center gap-2"
              style={{ opacity: sending ? 0.6 : 1 }}
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Enviar template
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
