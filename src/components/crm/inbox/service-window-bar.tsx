"use client"

/**
 * Barra da janela de atendimento de 24h (WhatsApp Cloud e Instagram).
 *
 * Verde >4h · amarela <4h · vermelha expirada · cinza sem conversa.
 * Além do banner, a expiração DESABILITA o composer de texto.
 *
 * O Instagram também tem janela de 24h e ficava sem nenhum aviso: o
 * envio ia, a Meta recusava e ninguém entendia. Lá não existe template,
 * então o CTA some (`onOpenTemplates` opcional) e o texto explica que
 * só dá para responder quando o contato escrever de novo.
 */

import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle, Clock } from "lucide-react"

interface ServiceWindowBarProps {
  isWindowOpen: boolean | null | undefined
  windowExpiresAt: string | null | undefined
  /** Ausente = canal sem templates (Instagram): a barra não oferece CTA. */
  onOpenTemplates?: () => void
  channelLabel?: string
}

export function windowIsOpen(
  isWindowOpen: boolean | null | undefined,
  windowExpiresAt: string | null | undefined,
): boolean {
  if (!isWindowOpen || !windowExpiresAt) return false
  return new Date(windowExpiresAt).getTime() > Date.now()
}

export function ServiceWindowBar({
  isWindowOpen,
  windowExpiresAt,
  onOpenTemplates,
  channelLabel = "WhatsApp",
}: ServiceWindowBarProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const baseStyle: React.CSSProperties = {
    fontSize: "var(--crm-text-xs)",
    padding: "6px 16px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderBottom: "1px solid var(--crm-gray-200)",
  }

  const templateButton = onOpenTemplates ? (
    <button
      onClick={onOpenTemplates}
      style={{
        marginLeft: "auto",
        fontSize: "var(--crm-text-xs)",
        fontWeight: "var(--crm-weight-medium)" as React.CSSProperties["fontWeight"],
        padding: "2px 10px",
        borderRadius: "var(--crm-radius-sm)",
        background: "var(--crm-gray-900)",
        color: "var(--crm-gray-0)",
        border: "none",
        cursor: "pointer",
      }}
    >
      Enviar template
    </button>
  ) : null

  if (!windowExpiresAt) {
    return (
      <div style={{ ...baseStyle, background: "var(--crm-gray-100)", color: "var(--crm-gray-600)" }}>
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>
          {onOpenTemplates
            ? "Sem conversa ativa — somente templates aprovados."
            : `Sem conversa ativa no ${channelLabel} — aguarde o contato escrever para poder responder.`}
        </span>
        {templateButton}
      </div>
    )
  }

  const diff = new Date(windowExpiresAt).getTime() - Date.now()

  if (!isWindowOpen || diff <= 0) {
    return (
      <div style={{ ...baseStyle, background: "var(--crm-neg-bg)", color: "var(--crm-neg)", borderBottomColor: "var(--crm-neg-border)" }}>
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>
          <strong>Janela de 24h expirada</strong>
          {onOpenTemplates
            ? " — somente templates aprovados."
            : ` — o ${channelLabel} só aceita resposta até 24h após a última mensagem do contato.`}
        </span>
        {templateButton}
      </div>
    )
  }

  const hoursLeft = Math.floor(diff / 3_600_000)
  const minutesLeft = Math.floor((diff % 3_600_000) / 60_000)
  const isLow = diff < 4 * 3_600_000

  return (
    <div
      style={{
        ...baseStyle,
        background: isLow ? "var(--crm-warn-bg)" : "var(--crm-pos-bg)",
        color: isLow ? "var(--crm-warn)" : "var(--crm-pos)",
        borderBottomColor: isLow ? "var(--crm-warn-border)" : "var(--crm-pos-border)",
      }}
    >
      <CheckCircle className="h-3.5 w-3.5 shrink-0" />
      <span>
        <strong>Janela ativa</strong> — expira em {hoursLeft > 0 && `${hoursLeft}h `}
        {minutesLeft}min{" "}
        <span style={{ opacity: 0.75 }}>
          (às{" "}
          {new Date(windowExpiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})
        </span>
      </span>
    </div>
  )
}
