"use client"

/**
 * Modal pra preencher um entregavel da task. Renderiza o input certo
 * conforme field_type: upload, url, select, multi_checkbox, textarea,
 * date, checkbox, numeric.
 *
 * Substitui o cycle manual de status — agora o status do deliverable
 * deriva do preenchimento:
 *  - vazio → "A fazer"
 *  - preenchido → "Pronto"
 *
 * Salvar chama PATCH /api/tasks/[taskId]/deliverables/[deliverableId].
 * Upload usa POST /api/upload/onboarding (scope=deliverable).
 */

import { useState, useEffect } from "react"
import { X, Upload, Loader2, FileText, Trash2, ExternalLink } from "lucide-react"

export interface DeliverableEditTarget {
  id: string
  field_label: string
  field_slug: string
  field_type?: string
  required?: boolean
  options?: string[]
  value: string | null
  file_url: string | null
  file_name: string | null
  file_size_bytes?: number | null
  filled_at: string | null
  metadata: Record<string, unknown> | null
}

interface DeliverableEditModalProps {
  taskId: string
  deliverable: DeliverableEditTarget
  onboardingId?: string | null
  onClose: () => void
  onSaved: () => void
}

export function DeliverableEditModal({
  taskId,
  deliverable,
  onboardingId,
  onClose,
  onSaved,
}: DeliverableEditModalProps) {
  const type = deliverable.field_type ?? "textarea"
  const [value, setValue] = useState<string>(deliverable.value ?? "")
  const [multi, setMulti] = useState<string[]>(() => {
    if (type !== "multi_checkbox") return []
    try {
      return deliverable.value ? JSON.parse(deliverable.value) : []
    } catch {
      return []
    }
  })
  const [fileUrl, setFileUrl] = useState<string | null>(deliverable.file_url)
  const [fileName, setFileName] = useState<string | null>(deliverable.file_name)
  const [fileSize, setFileSize] = useState<number | null>(
    deliverable.file_size_bytes ?? null,
  )
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function uploadFile(file: File) {
    if (!onboardingId) {
      setError("Onboarding nao identificado pra upload")
      return
    }
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("scope", "deliverable")
      fd.append("ref_id", onboardingId)
      const res = await fetch("/api/upload/onboarding", {
        method: "POST",
        body: fd,
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error?.message ?? "Falha no upload")
        return
      }
      const result = j.data ?? j
      setFileUrl(result.path)
      setFileName(result.file_name)
      setFileSize(result.file_size ?? null)
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        field_slug: deliverable.field_slug,
        field_label: deliverable.field_label,
        field_type: type,
        required: deliverable.required ?? false,
      }
      if (type === "upload") {
        body.file_url = fileUrl
        body.file_name = fileName
        body.file_size_bytes = fileSize
        // Quando esvazia upload, limpa value tambem
        if (!fileUrl) body.value = null
      } else if (type === "multi_checkbox") {
        body.value = multi.length > 0 ? JSON.stringify(multi) : null
      } else if (type === "checkbox") {
        body.value = value === "true" ? "true" : null
      } else {
        body.value = value.trim() === "" ? null : value
      }

      const res = await fetch(
        `/api/tasks/${taskId}/deliverables/${deliverable.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error?.message ?? "Falha ao salvar")
        return
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function removeFile() {
    setFileUrl(null)
    setFileName(null)
    setFileSize(null)
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[500px] bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white truncate">
              {deliverable.field_label}
              {deliverable.required && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-white/55 mt-0.5">
              {labelForType(type)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 inline-flex items-center justify-center rounded-[5px] text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {type === "upload" && (
            <UploadControl
              fileUrl={fileUrl}
              fileName={fileName}
              fileSize={fileSize}
              uploading={uploading}
              onUpload={uploadFile}
              onRemove={removeFile}
            />
          )}

          {type === "url" && (
            <input
              type="url"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] text-[13px] focus:outline-none focus:border-brand-400"
            />
          )}

          {type === "select" && (
            <select
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-3 py-2 rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] text-[13px] focus:outline-none focus:border-brand-400"
            >
              <option value="">Selecione...</option>
              {(deliverable.options ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}

          {type === "multi_checkbox" && (
            <div className="space-y-1.5">
              {(deliverable.options ?? []).map((opt) => {
                const checked = multi.includes(opt)
                return (
                  <label
                    key={opt}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-[4px] hover:bg-slate-50 dark:hover:bg-white/[0.04] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setMulti((prev) =>
                          e.target.checked
                            ? [...prev, opt]
                            : prev.filter((x) => x !== opt),
                        )
                      }
                    />
                    <span className="text-[12.5px] text-slate-700 dark:text-white/80">
                      {opt}
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          {type === "textarea" && (
            <textarea
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={5}
              className="w-full px-3 py-2 rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] text-[13px] focus:outline-none focus:border-brand-400 resize-y"
            />
          )}

          {type === "date" && (
            <input
              type="date"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-3 py-2 rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] text-[13px] focus:outline-none focus:border-brand-400"
            />
          )}

          {type === "checkbox" && (
            <label className="flex items-center gap-2 cursor-pointer px-2 py-1.5">
              <input
                type="checkbox"
                checked={value === "true"}
                onChange={(e) => setValue(e.target.checked ? "true" : "")}
              />
              <span className="text-[13px] text-slate-700 dark:text-white/80">
                Marcar como concluido
              </span>
            </label>
          )}

          {type === "numeric" && (
            <input
              type="number"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-3 py-2 rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] text-[13px] focus:outline-none focus:border-brand-400"
            />
          )}

          {error && (
            <p className="text-[12px] text-red-600 dark:text-red-400 mt-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-white/[0.02] border-t border-slate-200 dark:border-white/[0.06] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="h-8 px-3 rounded-[5px] text-[12.5px] font-medium text-slate-600 dark:text-white/65 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || uploading}
            className="h-8 px-4 rounded-[5px] text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

function UploadControl({
  fileUrl,
  fileName,
  fileSize,
  uploading,
  onUpload,
  onRemove,
}: {
  fileUrl: string | null
  fileName: string | null
  fileSize: number | null
  uploading: boolean
  onUpload: (file: File) => void
  onRemove: () => void
}) {
  const [dragOver, setDragOver] = useState(false)

  if (fileUrl) {
    return (
      <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-slate-50 dark:bg-white/[0.02] p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-[5px] bg-brand-50 dark:bg-brand-500/[0.12] flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-brand-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-medium text-slate-900 dark:text-white truncate">
            {fileName ?? "arquivo"}
          </p>
          {fileSize && (
            <p className="text-[11px] text-slate-500 dark:text-white/55">
              {formatBytes(fileSize)}
            </p>
          )}
        </div>
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="text-slate-500 hover:text-brand-500 dark:text-white/55"
          title="Abrir"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        <button
          onClick={onRemove}
          className="text-slate-500 hover:text-red-500 dark:text-white/55"
          title="Remover"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) onUpload(file)
      }}
      className={[
        "block rounded-[6px] border-2 border-dashed p-6 text-center cursor-pointer transition-colors",
        dragOver
          ? "border-brand-400 bg-brand-50 dark:bg-brand-500/[0.06]"
          : "border-slate-300 dark:border-white/[0.10] hover:border-brand-300 dark:hover:border-brand-500/40",
      ].join(" ")}
    >
      <input
        type="file"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUpload(file)
        }}
      />
      <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-white/55">
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Upload className="h-5 w-5" />
        )}
        <p className="text-[12.5px]">
          {uploading
            ? "Enviando..."
            : "Arraste um arquivo aqui ou clique pra selecionar"}
        </p>
      </div>
    </label>
  )
}

function formatBytes(b: number | null): string {
  if (!b) return ""
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function labelForType(t: string): string {
  switch (t) {
    case "upload":
      return "Anexar arquivo"
    case "url":
      return "Link"
    case "select":
      return "Selecionar opcao"
    case "multi_checkbox":
      return "Multipla escolha"
    case "textarea":
      return "Texto longo"
    case "date":
      return "Data"
    case "checkbox":
      return "Confirmacao"
    case "numeric":
      return "Numero"
    default:
      return "Texto"
  }
}
