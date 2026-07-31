"use client"

/**
 * Importação do histórico do WhatsApp de um canal Evolution.
 *
 * Dois passos por desenho: primeiro MEDIR (dry-run percorre o histórico
 * contando, sem gravar), depois importar sabendo o volume. O trabalho
 * roda no cron — este dialog só cria o job e acompanha o progresso.
 *
 * Ver docs/crm/whatsapp-history-sync-plano.md.
 */

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react"

const POLL_MS = 4000

interface Job {
  id: string
  mode: "dry_run" | "import"
  status: "pending" | "running" | "paused" | "completed" | "failed"
  since_days: number | null
  include_media: boolean
  chats_total: number
  cursor_chat_index: number
  messages_seen: number
  messages_imported: number
  messages_skipped: number
  error: string | null
  finished_at: string | null
}

interface HistoryImportDialogProps {
  channelId: string
  channelName: string
  onClose: () => void
}

const WINDOWS = [
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
  { label: "1 ano", value: 365 },
  { label: "Tudo", value: 0 },
]

export function HistoryImportDialog({ channelId, channelName, onClose }: HistoryImportDialogProps) {
  const [active, setActive] = useState<Job | null>(null)
  const [recent, setRecent] = useState<Job[]>([])
  const [sinceDays, setSinceDays] = useState<number>(90)
  const [includeMedia, setIncludeMedia] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/crm/channels/${channelId}/import-history`)
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || "Falha ao carregar o estado da importação")
        return
      }
      const data = json.data ?? json
      setActive(data.active ?? null)
      setRecent(data.recent ?? [])
      setError(null)
    } catch {
      setError("Falha ao carregar o estado da importação")
    } finally {
      setLoaded(true)
    }
  }, [channelId])

  useEffect(() => {
    void load()
  }, [load])

  // Enquanto há job ativo, acompanha o progresso.
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(t)
  }, [active, load])

  const start = async (mode: "dry_run" | "import") => {
    if (mode === "import") {
      const escopo = sinceDays === 0 ? "todo o histórico disponível" : `os últimos ${sinceDays} dias`
      if (
        !window.confirm(
          `Importar ${escopo} de "${channelName}"${includeMedia ? ", com mídia" : " (só texto)"}? As conversas entram no inbox com a data original.`,
        )
      )
        return
    }

    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/crm/channels/${channelId}/import-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          since_days: sinceDays === 0 ? null : sinceDays,
          include_media: mode === "import" ? includeMedia : false,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || "Falha ao iniciar")
        return
      }
      await load()
    } catch {
      setError("Falha ao iniciar")
    } finally {
      setBusy(false)
    }
  }

  const control = async (action: "pause" | "resume" | "cancel") => {
    if (action === "cancel" && !window.confirm("Cancelar a importação em andamento?")) return
    setBusy(true)
    try {
      await fetch(`/api/crm/channels/${channelId}/import-history`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      await load()
    } catch {
      setError("Falha ao atualizar o job")
    } finally {
      setBusy(false)
    }
  }

  const lastDryRun = recent.find((j) => j.mode === "dry_run" && j.status === "completed")

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-label={`Importar histórico de ${channelName}`}
      onClick={onClose}
    >
      <div
        className="crm-card"
        style={{ width: 460, maxWidth: "calc(100vw - 32px)", background: "var(--crm-white, #fff)" }}
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
              Importar histórico
            </h3>
            <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>{channelName}</p>
          </div>
          <button type="button" className="crm-button-ghost" onClick={onClose} aria-label="Fechar">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {error && (
          <p
            style={{
              fontSize: "var(--crm-text-xs)",
              color: "var(--crm-danger-fg)",
              marginBottom: "var(--crm-space-3)",
            }}
          >
            {error}
          </p>
        )}

        {!loaded ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--crm-gray-400)" }} />
          </div>
        ) : active ? (
          <ActiveJob job={active} busy={busy} onControl={control} />
        ) : (
          <>
            <p
              style={{
                fontSize: "var(--crm-text-xs)",
                color: "var(--crm-gray-600)",
                lineHeight: 1.6,
                marginBottom: "var(--crm-space-3)",
              }}
            >
              Só vem o histórico que o WhatsApp entregou no pareamento deste número. Meça primeiro — a
              medição percorre tudo contando, sem gravar nada.
            </p>

            {lastDryRun && (
              <div
                style={{
                  background: "var(--crm-gray-50, #FAFAFA)",
                  border: "1px solid var(--crm-gray-200)",
                  borderRadius: "var(--crm-radius-sm)",
                  padding: "var(--crm-space-2) var(--crm-space-3)",
                  marginBottom: "var(--crm-space-3)",
                  fontSize: "var(--crm-text-xs)",
                  color: "var(--crm-gray-700)",
                }}
              >
                Última medição: <strong>{lastDryRun.messages_seen}</strong> mensagens em{" "}
                <strong>{lastDryRun.chats_total}</strong> conversas.
              </div>
            )}

            <label
              style={{
                display: "block",
                fontSize: "var(--crm-text-xs)",
                color: "var(--crm-gray-700)",
                marginBottom: 6,
              }}
            >
              Janela
            </label>
            <div className="flex flex-wrap items-center gap-1" style={{ marginBottom: "var(--crm-space-3)" }}>
              {WINDOWS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  onClick={() => setSinceDays(w.value)}
                  aria-pressed={sinceDays === w.value}
                  style={{
                    fontSize: "var(--crm-text-xs)",
                    padding: "4px 10px",
                    borderRadius: "var(--crm-radius-sm)",
                    border: "none",
                    cursor: "pointer",
                    background: sinceDays === w.value ? "var(--crm-gray-900)" : "var(--crm-gray-100)",
                    color: sinceDays === w.value ? "var(--crm-gray-0)" : "var(--crm-gray-700)",
                  }}
                >
                  {w.label}
                </button>
              ))}
            </div>

            <label
              className="flex items-center gap-2"
              style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-700)", marginBottom: 4 }}
            >
              <input
                type="checkbox"
                checked={includeMedia}
                onChange={(e) => setIncludeMedia(e.target.checked)}
              />
              Baixar mídia (fotos, áudios, documentos)
            </label>
            <p
              style={{
                fontSize: 11,
                color: "var(--crm-gray-500)",
                marginBottom: "var(--crm-space-4)",
                lineHeight: 1.5,
              }}
            >
              Sem isso, importa só o texto — bem mais rápido e sem consumo de storage. A mídia pode ser
              importada depois.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="crm-button-ghost"
                disabled={busy}
                onClick={() => start("dry_run")}
                style={{ opacity: busy ? 0.5 : 1 }}
              >
                {busy ? "Iniciando..." : "Medir (não grava)"}
              </button>
              <button
                type="button"
                className="crm-button"
                disabled={busy}
                onClick={() => start("import")}
                style={{ opacity: busy ? 0.5 : 1 }}
              >
                Importar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ActiveJob({
  job,
  busy,
  onControl,
}: {
  job: Job
  busy: boolean
  onControl: (a: "pause" | "resume" | "cancel") => void
}) {
  const pct = job.chats_total > 0 ? Math.round((job.cursor_chat_index / job.chats_total) * 100) : 0
  const isPaused = job.status === "paused"

  return (
    <>
      <div className="flex items-center gap-2" style={{ marginBottom: "var(--crm-space-2)" }}>
        {isPaused ? (
          <AlertTriangle className="h-4 w-4" style={{ color: "var(--crm-warning-fg, #B45309)" }} />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--crm-gray-500)" }} />
        )}
        <span style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-900)" }}>
          {job.mode === "dry_run" ? "Medindo" : "Importando"}
          {isPaused ? " (pausado)" : "..."}
        </span>
      </div>

      <div
        style={{
          height: 6,
          background: "var(--crm-gray-100)",
          borderRadius: "var(--crm-radius-full)",
          overflow: "hidden",
          marginBottom: "var(--crm-space-2)",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--crm-gray-900)",
            transition: "width 400ms ease",
          }}
        />
      </div>

      <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-600)", lineHeight: 1.7 }}>
        {job.cursor_chat_index} de {job.chats_total || "?"} conversas · {job.messages_seen} mensagens
        lidas
        {job.mode === "import" ? ` · ${job.messages_imported} importadas` : ""}
      </p>
      <p style={{ fontSize: 11, color: "var(--crm-gray-500)", marginTop: 4 }}>
        Roda em segundo plano — pode fechar esta janela.
      </p>

      <div className="flex items-center justify-end gap-2" style={{ marginTop: "var(--crm-space-4)" }}>
        <button
          type="button"
          className="crm-button-ghost"
          disabled={busy}
          style={{ color: "var(--crm-danger-fg)", opacity: busy ? 0.5 : 1 }}
          onClick={() => onControl("cancel")}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="crm-button-ghost"
          disabled={busy}
          style={{ opacity: busy ? 0.5 : 1 }}
          onClick={() => onControl(isPaused ? "resume" : "pause")}
        >
          {isPaused ? "Retomar" : "Pausar"}
        </button>
      </div>
    </>
  )
}

export function JobDoneBadge({ job }: { job: Job }) {
  if (job.status !== "completed") return null
  return (
    <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: "var(--crm-success-fg)" }}>
      <CheckCircle2 className="h-3 w-3" />
      {job.mode === "dry_run" ? `${job.messages_seen} mensagens disponíveis` : `${job.messages_imported} importadas`}
    </span>
  )
}
