"use client"

/**
 * Barra da janela de atendimento de 24h (WhatsApp).
 *
 * Verde >4h · amarela <4h · vermelha expirada · cinza sem conversa.
 * Diferente do worder (que só mostrava banner), aqui a expiração
 * também DESABILITA o composer de texto — o CTA de template vem do
 * composer via onSendTemplate.
 */

import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle, Clock } from "lucide-react"

interface ServiceWindowBarProps {
  isWindowOpen: boolean | null | undefined
  windowExpiresAt: string | null | undefined
  onOpenTemplates: () => void
}

export function windowIsOpen(
  isWindowOpen: boolean | null | undefined,
  windowExpiresAt: string | null | undefined,
): boolean {
  if (!isWindowOpen || !windowExpiresAt) return false
  return new Date(windowExpiresAt).getTime() > Date.now()
}

export function ServiceWindowBar({ isWindowOpen, windowExpiresAt, onOpenTemplates }: ServiceWindowBarProps) {
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

  const templateButton = (
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
  )

  if (!windowExpiresAt) {
    return (
      <div style={{ ...baseStyle, background: "var(--crm-gray-100)", color: "var(--crm-gray-600)" }}>
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>Sem conversa ativa — somente templates aprovados.</span>
        {templateButton}
      </div>
    )
  }

  const diff = new Date(windowExpiresAt).getTime() - Date.now()

  if (!isWindowOpen || diff <= 0) {
    return (
      <div style={{ ...baseStyle, background: "#FEF2F2", color: "#991B1B", borderBottomColor: "#FECACA" }}>
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>
          <strong>Janela de 24h expirada</strong> — somente templates aprovados.
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
        background: isLow ? "#FFFBEB" : "#F0FDF4",
        color: isLow ? "#92400E" : "#065F46",
        borderBottomColor: isLow ? "#FDE68A" : "#A7F3D0",
      }}
    >
      <CheckCircle className="h-3.5 w-3.5 shrink-0" />
      <span>
        <strong>Janela ativa</strong> — expira em {hoursLeft > 0 && `${hoursLeft}h `}
        {minutesLeft}min
      </span>
    </div>
  )
}
