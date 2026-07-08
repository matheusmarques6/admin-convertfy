"use client"

/**
 * Gravador de nota de voz do composer (portado do worder, sem waveform).
 *
 * Ciclo: pede mic → grava com contador MM:SS → preview <audio> →
 * enviar/cancelar. A Meta NÃO aceita audio/webm — gravamos preferindo
 * ogg/opus e caímos em mp4/aac/mpeg; se o browser só suportar webm,
 * mostramos erro claro (transcodificação fica pra fase 2).
 */

import { useEffect, useRef, useState } from "react"
import { AlertCircle, Loader2, Send, Square, Trash2 } from "lucide-react"

interface AudioRecorderProps {
  onSend: (file: File) => void | Promise<void>
  onCancel: () => void
  isUploading?: boolean
}

type Phase = "requesting" | "recording" | "preview" | "error"

function pickSupportedMime(): { mimeType: string; ext: string } | null {
  const candidates = [
    { mimeType: "audio/ogg;codecs=opus", ext: "ogg" },
    { mimeType: "audio/mp4", ext: "m4a" },
    { mimeType: "audio/aac", ext: "aac" },
    { mimeType: "audio/mpeg", ext: "mp3" },
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mimeType)) {
      return c
    }
  }
  return null
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0")
  const s = Math.floor(seconds % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

export function AudioRecorder({ onSend, onCancel, isUploading = false }: AudioRecorderProps) {
  const [phase, setPhase] = useState<Phase>("requesting")
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef<{ mimeType: string; ext: string } | null>(null)
  const fileRef = useRef<File | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function cleanupStream() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop()
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  useEffect(() => {
    let cancelled = false

    async function start() {
      const mime = pickSupportedMime()
      if (!mime) {
        setError("Este navegador só grava em formato que o WhatsApp não aceita (webm). Use Chrome/Safari atualizados ou anexe um arquivo de áudio.")
        setPhase("error")
        return
      }
      mimeRef.current = mime

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        const recorder = new MediaRecorder(stream, { mimeType: mime.mimeType })
        recorderRef.current = recorder
        chunksRef.current = []

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mime.mimeType.split(";")[0] })
          const file = new File([blob], `voz-${Date.now()}.${mime.ext}`, { type: blob.type })
          fileRef.current = file
          setPreviewUrl(URL.createObjectURL(blob))
          setPhase("preview")
        }

        recorder.start(250)
        setPhase("recording")
        setSeconds(0)
        timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
      } catch {
        setError("Não consegui acessar o microfone — verifique as permissões do navegador.")
        setPhase("error")
      }
    }

    start()
    return () => {
      cancelled = true
      cleanupStream()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }

  const handleCancel = () => {
    cleanupStream()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    onCancel()
  }

  const handleSend = async () => {
    if (fileRef.current) await onSend(fileRef.current)
  }

  return (
    <div
      className="flex items-center gap-3"
      style={{
        padding: "8px 12px",
        borderRadius: "var(--crm-radius-md)",
        border: "1px solid var(--crm-gray-200)",
        background: "var(--crm-gray-50)",
        minHeight: 44,
      }}
    >
      {phase === "requesting" && (
        <span className="flex items-center gap-2" style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Solicitando microfone…
        </span>
      )}

      {phase === "error" && (
        <>
          <span className="flex items-center gap-2" style={{ fontSize: "var(--crm-text-xs)", color: "#991B1B" }}>
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
          </span>
          <button onClick={handleCancel} className="crm-button-ghost" style={{ marginLeft: "auto" }}>
            Fechar
          </button>
        </>
      )}

      {phase === "recording" && (
        <>
          <span
            className="inline-block h-2 w-2 rounded-full animate-pulse"
            style={{ background: "#DC2626" }}
          />
          <span style={{ fontSize: "var(--crm-text-sm)", fontFamily: "var(--crm-font-mono)", color: "var(--crm-gray-900)" }}>
            {formatDuration(seconds)}
          </span>
          <button
            onClick={stopRecording}
            title="Parar gravação"
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ background: "var(--crm-gray-900)", color: "var(--crm-gray-0)", border: "none", cursor: "pointer", marginLeft: "auto" }}
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            onClick={handleCancel}
            title="Cancelar"
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ background: "transparent", color: "var(--crm-gray-500)", border: "1px solid var(--crm-gray-200)", cursor: "pointer" }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </>
      )}

      {phase === "preview" && previewUrl && (
        <>
          <audio controls src={previewUrl} style={{ height: 32, flex: 1 }} />
          <button
            onClick={handleCancel}
            disabled={isUploading}
            title="Descartar"
            className="flex h-7 w-7 items-center justify-center rounded-full shrink-0"
            style={{ background: "transparent", color: "var(--crm-gray-500)", border: "1px solid var(--crm-gray-200)", cursor: "pointer" }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <button
            onClick={handleSend}
            disabled={isUploading}
            title="Enviar áudio"
            className="flex h-7 w-7 items-center justify-center rounded-full shrink-0"
            style={{ background: "var(--crm-brand)", color: "var(--crm-brand-fg)", border: "none", cursor: "pointer", opacity: isUploading ? 0.6 : 1 }}
          >
            {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </button>
        </>
      )}
    </div>
  )
}
