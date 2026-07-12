"use client"

/**
 * Modal de conexão via QR do canal Evolution (WhatsApp não-oficial).
 *
 * Ao abrir: POST /connect pega o QR (base64). Polling do estado a cada
 * 3s (GET /state) e refresh do QR a cada ~40s (QR do WhatsApp expira).
 * Quando o estado vira "open", mostra sucesso e fecha sozinho.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2, Loader2, RefreshCw, X } from "lucide-react"

const POLL_STATE_MS = 3000
const REFRESH_QR_MS = 40_000
const CLOSE_AFTER_CONNECT_MS = 1600

interface EvolutionQrModalProps {
  channelId: string
  channelName: string
  /** QR inicial retornado na criação do canal (evita um round-trip). */
  initialQr?: string | null
  onClose: () => void
  /** Chamado quando conectar (pra revalidar a lista de canais). */
  onConnected: () => void
}

function asDataUri(qr: string): string {
  return qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`
}

export function EvolutionQrModal({
  channelId,
  channelName,
  initialQr,
  onClose,
  onConnected,
}: EvolutionQrModalProps) {
  const [qr, setQr] = useState<string | null>(initialQr ?? null)
  const [state, setState] = useState<string>("connecting")
  const [error, setError] = useState<string | null>(null)
  const [ownerJid, setOwnerJid] = useState<string | null>(null)
  const connectedRef = useRef(false)

  const fetchQr = useCallback(async () => {
    try {
      const res = await fetch(`/api/crm/channels/${channelId}/evolution/connect`, { method: "POST" })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || "Falha ao gerar QR")
        return
      }
      const data = json.data ?? json
      if (data.state === "open") {
        setState("open")
        return
      }
      if (data.qr_base64) {
        setQr(data.qr_base64)
        setError(null)
      }
    } catch {
      setError("Falha de rede ao gerar QR")
    }
  }, [channelId])

  // QR inicial (se não veio da criação) + refresh periódico
  useEffect(() => {
    if (!initialQr) void fetchQr()
    const t = setInterval(() => {
      if (!connectedRef.current) void fetchQr()
    }, REFRESH_QR_MS)
    return () => clearInterval(t)
  }, [fetchQr, initialQr])

  // Polling do estado da conexão
  useEffect(() => {
    const t = setInterval(async () => {
      if (connectedRef.current) return
      try {
        const res = await fetch(`/api/crm/channels/${channelId}/evolution/state`)
        const json = await res.json()
        const data = json.data ?? json
        if (data?.state) setState(data.state)
        if (data?.owner_jid) setOwnerJid(data.owner_jid)
      } catch {
        // polling silencioso — próxima volta tenta de novo
      }
    }, POLL_STATE_MS)
    return () => clearInterval(t)
  }, [channelId])

  // Conectou: revalida a lista e fecha sozinho
  useEffect(() => {
    if (state !== "open" || connectedRef.current) return
    connectedRef.current = true
    onConnected()
    const t = setTimeout(onClose, CLOSE_AFTER_CONNECT_MS)
    return () => clearTimeout(t)
  }, [state, onConnected, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-label={`Conectar ${channelName} via QR`}
      onClick={onClose}
    >
      <div
        className="crm-card"
        style={{ width: 380, maxWidth: "calc(100vw - 32px)", background: "var(--crm-white, #fff)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between" style={{ marginBottom: "var(--crm-space-3)" }}>
          <div>
            <h3
              style={{
                fontSize: "var(--crm-text-md)",
                fontWeight: "var(--crm-weight-medium)",
                color: "var(--crm-gray-900)",
              }}
            >
              Conectar WhatsApp via QR
            </h3>
            <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>{channelName}</p>
          </div>
          <button type="button" className="crm-button-ghost" onClick={onClose} aria-label="Fechar">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {state === "open" ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <CheckCircle2 className="h-8 w-8" style={{ color: "var(--crm-success-fg)" }} />
            <p style={{ fontSize: "var(--crm-text-sm)", fontWeight: "var(--crm-weight-medium)", color: "var(--crm-gray-900)" }}>
              Conectado!
            </p>
            {ownerJid && (
              <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)", fontFamily: "var(--crm-font-mono)" }}>
                +{ownerJid}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 py-2">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={asDataUri(qr)}
                  alt="QR code de conexão do WhatsApp"
                  width={260}
                  height={260}
                  style={{ borderRadius: "var(--crm-radius-md)", border: "1px solid var(--crm-gray-200)" }}
                />
              ) : (
                <div
                  className="flex items-center justify-center"
                  style={{ width: 260, height: 260, border: "1px dashed var(--crm-gray-300)", borderRadius: "var(--crm-radius-md)" }}
                >
                  <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--crm-gray-400)" }} />
                </div>
              )}
              <ol
                style={{
                  fontSize: "var(--crm-text-xs)",
                  color: "var(--crm-gray-600)",
                  lineHeight: 1.7,
                  paddingLeft: 16,
                  listStyle: "decimal",
                }}
              >
                <li>Abra o WhatsApp no celular do número a conectar</li>
                <li>Toque em Configurações → Dispositivos conectados</li>
                <li>Toque em Conectar dispositivo e escaneie o QR</li>
              </ol>
              <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
                Importante: um número só pode estar em UMA instância por vez.
              </p>
            </div>

            {error && (
              <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-danger-fg)", marginTop: "var(--crm-space-2)" }}>
                {error}
              </p>
            )}

            <div className="flex items-center justify-between" style={{ marginTop: "var(--crm-space-3)" }}>
              <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
                Status: {state === "connecting" ? "aguardando leitura…" : state}
              </span>
              <button
                type="button"
                className="crm-button-ghost"
                style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
                onClick={() => void fetchQr()}
              >
                <RefreshCw className="h-3 w-3" />
                Novo QR
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
