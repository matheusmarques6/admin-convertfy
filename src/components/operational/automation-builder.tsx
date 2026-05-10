"use client"

import { useEffect, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X, Zap } from "lucide-react"
import {
  TRIGGER_LABELS,
  ACTION_LABELS,
  type OperationalAutomation,
  type OperationalAutomationAction,
  type OperationalAutomationTrigger,
  type OperationalColumn,
} from "@/types/operational-pipeline"

interface Props {
  open: boolean
  automation: OperationalAutomation | null
  columns: OperationalColumn[]
  onClose: () => void
  onSave: (auto: OperationalAutomation) => void
}

export function AutomationBuilder({
  open,
  automation,
  columns,
  onClose,
  onSave,
}: Props) {
  const isEdit = automation !== null

  const [name, setName] = useState("")
  const [trigger, setTrigger] = useState<OperationalAutomationTrigger>(
    "task_moved_to",
  )
  const [action, setAction] = useState<OperationalAutomationAction>(
    "notify_assignee",
  )
  const [triggerColumnId, setTriggerColumnId] = useState<string>("")
  const [targetColumnId, setTargetColumnId] = useState<string>("")
  const [message, setMessage] = useState("")
  const [subtaskTitle, setSubtaskTitle] = useState("")

  useEffect(() => {
    if (!open) return
    if (automation) {
      setName(automation.name)
      setTrigger(automation.trigger)
      setAction(automation.action)
      setTriggerColumnId(automation.config.column_id ?? "")
      setTargetColumnId(automation.config.target_column_id ?? "")
      setMessage(automation.config.message ?? "")
      setSubtaskTitle(automation.config.subtask_title ?? "")
    } else {
      setName("")
      setTrigger("task_moved_to")
      setAction("notify_assignee")
      setTriggerColumnId(columns[0]?.id ?? "")
      setTargetColumnId(columns[0]?.id ?? "")
      setMessage("")
      setSubtaskTitle("")
    }
  }, [open, automation, columns])

  const previewText = (() => {
    const colName = (id: string) =>
      columns.find((c) => c.id === id)?.name ?? "—"
    const trig =
      trigger === "task_moved_to"
        ? `Quando uma task for movida para "${colName(triggerColumnId)}"`
        : TRIGGER_LABELS[trigger]
    const act = (() => {
      switch (action) {
        case "notify_assignee":
          return "notificar o responsável"
        case "notify_channel":
          return "notificar todos os membros da org"
        case "move_to_column":
          return `mover a task para "${colName(targetColumnId)}"`
        case "create_subtask":
          return `criar a subtask "${subtaskTitle || "..."}"`
        case "assign_to":
          return "atribuir a um membro"
        case "update_field":
          return "atualizar um campo"
      }
    })()
    return `${trig}, ${act}.`
  })()

  const handleSave = () => {
    if (!name.trim()) return
    const auto: OperationalAutomation = {
      id: automation?.id ?? crypto.randomUUID(),
      name: name.trim(),
      trigger,
      action,
      is_active: automation?.is_active ?? true,
      config: {
        ...(trigger === "task_moved_to"
          ? { column_id: triggerColumnId || undefined }
          : {}),
        ...(action === "move_to_column"
          ? { target_column_id: targetColumnId || undefined }
          : {}),
        ...(action === "create_subtask"
          ? { subtask_title: subtaskTitle || undefined }
          : {}),
        ...(message ? { message } : {}),
      },
    }
    onSave(auto)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[55] w-full max-w-[520px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogPrimitive.Title className="sr-only">
            {isEdit ? "Editar automação" : "Nova automação"}
          </DialogPrimitive.Title>

          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Zap className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  {isEdit ? "Editar automação" : "Nova automação"}
                </h2>
                <p className="text-[12px] text-slate-500 dark:text-white/55">
                  Trigger + ação em linguagem natural.
                </p>
              </div>
            </div>
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

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
            <Field label="Nome da automação">
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Notificar quando ir pra Go Live"
                className="crm-input w-full"
              />
            </Field>

            <Field label="Quando (trigger)">
              <select
                value={trigger}
                onChange={(e) =>
                  setTrigger(e.target.value as OperationalAutomationTrigger)
                }
                className="crm-input w-full"
              >
                {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>

            {trigger === "task_moved_to" && (
              <Field label="Coluna alvo">
                <select
                  value={triggerColumnId}
                  onChange={(e) => setTriggerColumnId(e.target.value)}
                  className="crm-input w-full"
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Então (ação)">
              <select
                value={action}
                onChange={(e) =>
                  setAction(e.target.value as OperationalAutomationAction)
                }
                className="crm-input w-full"
              >
                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>

            {action === "move_to_column" && (
              <Field label="Coluna destino">
                <select
                  value={targetColumnId}
                  onChange={(e) => setTargetColumnId(e.target.value)}
                  className="crm-input w-full"
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {action === "create_subtask" && (
              <Field label="Título da subtask">
                <input
                  type="text"
                  value={subtaskTitle}
                  onChange={(e) => setSubtaskTitle(e.target.value)}
                  placeholder="Ex: Revisar checklist de Go Live"
                  className="crm-input w-full"
                />
              </Field>
            )}

            {(action === "notify_assignee" || action === "notify_channel") && (
              <Field
                label="Mensagem (opcional)"
              >
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder='Use {{task.title}} ou {{pipeline.name}} para placeholders'
                  className="crm-input w-full"
                />
              </Field>
            )}

            <div className="rounded-[6px] border border-blue-200 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-blue-700 dark:text-blue-300 mb-1">
                Pré-visualização
              </p>
              <p className="text-[12px] text-slate-700 dark:text-white/80 leading-relaxed">
                {previewText}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
            >
              {isEdit ? "Salvar" : "Criar automação"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
        {label}
      </label>
      {children}
    </div>
  )
}
