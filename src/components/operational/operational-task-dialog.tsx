"use client"

import { useEffect, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X, Loader2 } from "lucide-react"
import type { OperationalColumn } from "@/types/operational-pipeline"

interface Props {
  open: boolean
  pipelineId: string
  pipelineSlug: string
  columns: OperationalColumn[]
  defaultColumnId: string | null
  editingTaskId: string | null
  onClose: () => void
  onSaved: () => void
}

export function OperationalTaskDialog({
  open,
  pipelineId,
  pipelineSlug,
  columns,
  defaultColumnId,
  editingTaskId,
  onClose,
  onSaved,
}: Props) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">(
    "medium",
  )
  const [columnId, setColumnId] = useState<string>("")
  const [dueDate, setDueDate] = useState("")
  const [tags, setTags] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("pending")

  const isEdit = editingTaskId !== null

  useEffect(() => {
    if (!open) return
    if (!isEdit) {
      setTitle("")
      setDescription("")
      setPriority("medium")
      setColumnId(defaultColumnId ?? columns[0]?.id ?? "")
      setDueDate("")
      setTags("")
      setStatus("pending")
      return
    }
    // Edit: load
    setLoading(true)
    fetch(`/api/tasks/${editingTaskId}`)
      .then((r) => r.json())
      .then((j) => {
        const t = j.data?.task ?? j.task
        if (!t) return
        setTitle(t.title ?? "")
        setDescription(t.description ?? "")
        setPriority(t.priority ?? "medium")
        setColumnId(t.operational_column_id ?? defaultColumnId ?? "")
        setDueDate(t.due_date ? String(t.due_date).slice(0, 10) : "")
        setTags((t.tags ?? []).join(", "))
        setStatus(t.status ?? "pending")
      })
      .finally(() => setLoading(false))
  }, [open, isEdit, editingTaskId, defaultColumnId, columns])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        operational_column_id: columnId || null,
        due_date: dueDate || null,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        status,
      }
      const url = isEdit
        ? `/api/tasks/${editingTaskId}`
        : `/api/operational-pipelines/${pipelineSlug}/tasks`
      const method = isEdit ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.error?.message ?? "Erro ao salvar task")
        return
      }
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-[520px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <DialogPrimitive.Title className="sr-only">
            {isEdit ? "Editar task" : "Nova task"}
          </DialogPrimitive.Title>
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
              {isEdit ? "Editar task" : "Nova task"}
            </h2>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogPrimitive.Close>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5"
          >
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                <Field label="Título" required>
                  <input
                    autoFocus
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="crm-input w-full"
                    placeholder="O que precisa ser feito?"
                  />
                </Field>
                <Field label="Descrição">
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="crm-input w-full"
                    placeholder="Detalhes adicionais (opcional)"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Coluna">
                    <select
                      value={columnId}
                      onChange={(e) => setColumnId(e.target.value)}
                      className="crm-input w-full"
                    >
                      {columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Prioridade">
                    <select
                      value={priority}
                      onChange={(e) =>
                        setPriority(e.target.value as typeof priority)
                      }
                      className="crm-input w-full"
                    >
                      <option value="low">Baixa</option>
                      <option value="medium">Média</option>
                      <option value="high">Alta</option>
                      <option value="urgent">Urgente</option>
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Prazo">
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="crm-input w-full"
                    />
                  </Field>
                  {isEdit && (
                    <Field label="Status">
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="crm-input w-full"
                      >
                        <option value="pending">Pendente</option>
                        <option value="in_progress">Em progresso</option>
                        <option value="blocked">Bloqueada</option>
                        <option value="review">Revisão</option>
                        <option value="completed">Concluída</option>
                      </select>
                    </Field>
                  )}
                </div>
                <Field label="Tags (separadas por vírgula)">
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="crm-input w-full"
                    placeholder="onboarding, urgente"
                  />
                </Field>
                {/* keep ref pra suprimir warning de unused */}
                <input type="hidden" value={pipelineId} readOnly />
              </>
            )}
          </form>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !title.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Salvar" : "Criar task"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
