"use client"

import { useEffect, useState, useMemo } from "react"
import useSWR from "swr"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X, Loader2 } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import type { OperationalColumn } from "@/types/operational-pipeline"

interface Lookups {
  members: Array<{
    id: string
    role: string
    profile?: { id: string; name: string; email: string } | null
  }>
  clients: Array<{ id: string; name: string; company: string | null }>
  stores: Array<{
    id: string
    store_name: string
    platform: string | null
    client_id: string | null
  }>
}

const lookupsFetcher = (url: string) => fetch(url).then((r) => r.json())

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
  const [assigneeId, setAssigneeId] = useState<string>("")
  const [clientId, setClientId] = useState<string>("")
  const [storeId, setStoreId] = useState<string>("")

  const isEdit = editingTaskId !== null
  const toast = useToast()

  const { data: lookupsData } = useSWR<{ data?: Lookups } & Lookups>(
    open ? "/api/operational-pipelines/lookups" : null,
    lookupsFetcher,
  )
  const lookups: Lookups = useMemo(
    () =>
      lookupsData?.data ?? {
        members: lookupsData?.members ?? [],
        clients: lookupsData?.clients ?? [],
        stores: lookupsData?.stores ?? [],
      },
    [lookupsData],
  )

  // Filtra lojas pelo cliente selecionado (se houver)
  const visibleStores = useMemo(
    () =>
      clientId
        ? lookups.stores.filter((s) => s.client_id === clientId)
        : lookups.stores,
    [lookups.stores, clientId],
  )

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
      setAssigneeId("")
      setClientId("")
      setStoreId("")
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
        setAssigneeId(t.assignee_id ?? "")
        setClientId(t.client_id ?? "")
        setStoreId(t.store_id ?? "")
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
        assignee_id: assigneeId || null,
        client_id: clientId || null,
        store_id: storeId || null,
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
        toast.toast({
          variant: "destructive",
          title: "Erro ao salvar task",
          description: j.error?.message ?? "Tente novamente.",
        })
        return
      }
      toast.toast({
        title: isEdit ? "Task atualizada" : "Task criada",
        description: title.trim(),
      })
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
                <Field label="Responsável">
                  <select
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="crm-input w-full"
                  >
                    <option value="">— Sem responsável</option>
                    {lookups.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.profile?.name ?? m.profile?.email ?? "—"} ·{" "}
                        {m.role}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Cliente">
                    <select
                      value={clientId}
                      onChange={(e) => {
                        setClientId(e.target.value)
                        // Reset store se nao pertence ao novo cliente
                        if (e.target.value && storeId) {
                          const stores = lookups.stores.filter(
                            (s) => s.client_id === e.target.value,
                          )
                          if (!stores.some((s) => s.id === storeId)) {
                            setStoreId("")
                          }
                        }
                      }}
                      className="crm-input w-full"
                    >
                      <option value="">— Nenhum</option>
                      {lookups.clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Loja">
                    <select
                      value={storeId}
                      onChange={(e) => setStoreId(e.target.value)}
                      className="crm-input w-full"
                      disabled={visibleStores.length === 0}
                    >
                      <option value="">— Nenhuma</option>
                      {visibleStores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.store_name}
                          {s.platform ? ` (${s.platform})` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
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
