"use client"

import { useEffect, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useToast } from "@/lib/hooks/use-toast"
import {
  X,
  Plus,
  Trash2,
  GripVertical,
  Settings,
  Loader2,
  Zap,
} from "lucide-react"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import type {
  OperationalPipeline,
  OperationalColumn,
  OperationalAutomation,
} from "@/types/operational-pipeline"
import { AutomationBuilder } from "./automation-builder"

interface Props {
  open: boolean
  pipeline: OperationalPipeline
  onClose: () => void
  onSaved: () => void
}

const SUGGESTED_COLORS = [
  "#94A3B8",
  "#0EA5E9",
  "#6366F1",
  "#7C3AED",
  "#A855F7",
  "#EC4899",
  "#F97316",
  "#F59E0B",
  "#10B981",
  "#22C55E",
  "#EF4444",
  "#6B7280",
]

export function OperationalSettingsDialog({
  open,
  pipeline,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState(pipeline.name)
  const [description, setDescription] = useState(pipeline.description ?? "")
  const [color, setColor] = useState(pipeline.color)
  const [columns, setColumns] = useState<OperationalColumn[]>(pipeline.columns)
  const [automations, setAutomations] = useState<OperationalAutomation[]>(
    pipeline.automations,
  )
  const [editingAutomation, setEditingAutomation] = useState<
    OperationalAutomation | "new" | null
  >(null)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setName(pipeline.name)
    setDescription(pipeline.description ?? "")
    setColor(pipeline.color)
    setColumns(pipeline.columns)
    setAutomations(pipeline.automations)
  }, [open, pipeline])

  const addColumn = () => {
    setColumns((c) => [
      ...c,
      {
        id: crypto.randomUUID(),
        name: "Nova coluna",
        color: SUGGESTED_COLORS[c.length % SUGGESTED_COLORS.length],
        position: c.length,
        wip_limit: null,
      },
    ])
  }

  const updateColumn = (id: string, patch: Partial<OperationalColumn>) => {
    setColumns((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

  const removeColumn = (id: string) => {
    // Aviso: tasks que estavam nessa coluna ficam orfas (operational_
    // column_id apontando pra id deletada). O board nao mostra elas.
    // Confirma com o user antes.
    if (
      !confirm(
        "Tasks que estavam nessa coluna podem ficar invisiveis no board. Mover essas tasks pra outra coluna antes de deletar e recomendado. Continuar mesmo assim?",
      )
    )
      return
    setColumns((c) => c.filter((x) => x.id !== id).map((x, i) => ({ ...x, position: i })))
  }

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return
    const reordered = Array.from(columns)
    const [moved] = reordered.splice(result.source.index, 1)
    reordered.splice(result.destination.index, 0, moved)
    setColumns(reordered.map((c, i) => ({ ...c, position: i })))
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/operational-pipelines/${pipeline.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          color,
          columns,
          automations,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.toast({
          variant: "destructive",
          title: "Erro ao salvar pipeline",
          description: j.error?.message ?? "Tente novamente.",
        })
        return
      }
      toast.toast({ title: "Pipeline atualizado" })
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-[680px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <DialogPrimitive.Title className="sr-only">
            Configurar pipeline
          </DialogPrimitive.Title>

          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/70">
                <Settings className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Configurar pipeline
                </h2>
                <p className="text-[12px] text-slate-500 dark:text-white/55">
                  Edite nome, colunas e automações.
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

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {/* Geral */}
            <section className="space-y-3">
              <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white/90">
                Geral
              </h3>
              <Field label="Nome">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="crm-input w-full"
                />
              </Field>
              <Field label="Descrição">
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="crm-input w-full"
                />
              </Field>
              <Field label="Cor">
                <div className="flex flex-wrap items-center gap-1.5">
                  {SUGGESTED_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      style={{ background: c }}
                      className={
                        "h-7 w-7 rounded-full transition-transform " +
                        (color === c
                          ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#0F1117] scale-110"
                          : "hover:scale-105")
                      }
                      aria-label={`Cor ${c}`}
                    />
                  ))}
                </div>
              </Field>
            </section>

            {/* Colunas */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white/90">
                  Colunas ({columns.length})
                </h3>
                <button
                  type="button"
                  onClick={addColumn}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  Adicionar coluna
                </button>
              </div>

              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="columns">
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="space-y-2"
                    >
                      {columns.map((c, i) => (
                        <Draggable key={c.id} draggableId={c.id} index={i}>
                          {(dp) => (
                            <div
                              ref={dp.innerRef}
                              {...dp.draggableProps}
                              className="flex items-center gap-2 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] px-2.5 py-2"
                            >
                              <span
                                {...dp.dragHandleProps}
                                className="text-slate-300 dark:text-white/25 cursor-grab"
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </span>
                              <input
                                type="color"
                                value={c.color}
                                onChange={(e) =>
                                  updateColumn(c.id, { color: e.target.value })
                                }
                                className="h-6 w-6 rounded cursor-pointer border-0"
                              />
                              <input
                                type="text"
                                value={c.name}
                                onChange={(e) =>
                                  updateColumn(c.id, { name: e.target.value })
                                }
                                className="flex-1 bg-transparent text-[13px] text-slate-900 dark:text-white outline-none"
                              />
                              <input
                                type="number"
                                placeholder="WIP"
                                value={c.wip_limit ?? ""}
                                onChange={(e) =>
                                  updateColumn(c.id, {
                                    wip_limit: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  })
                                }
                                className="w-14 bg-transparent text-[12px] text-slate-700 dark:text-white/70 border border-slate-200 dark:border-white/[0.10] rounded px-1 py-0.5 outline-none focus:border-slate-400"
                                min={0}
                                title="WIP limit (limite de tasks)"
                              />
                              <button
                                type="button"
                                onClick={() => removeColumn(c.id)}
                                disabled={columns.length <= 1}
                                className="text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                aria-label="Remover coluna"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </section>

            {/* Automações */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white/90 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    Automações ({automations.length})
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-white/45 mt-0.5">
                    Disparam ações automáticas em resposta a eventos.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingAutomation("new")}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  Nova automação
                </button>
              </div>

              {automations.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setEditingAutomation("new")}
                  className="w-full rounded-[6px] border border-dashed border-slate-300 dark:border-white/[0.10] py-4 text-center"
                >
                  <p className="text-[12px] font-medium text-slate-700 dark:text-white/80">
                    Nenhuma automação ainda
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-white/45 mt-0.5">
                    Configure regras tipo &quot;quando uma task for movida pra X,
                    notificar o responsável&quot;.
                  </p>
                </button>
              ) : (
                <ul className="space-y-1.5">
                  {automations.map((a) => (
                    <li
                      key={a.id}
                      className="group flex items-center justify-between gap-3 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setAutomations((arr) =>
                                arr.map((x) =>
                                  x.id === a.id
                                    ? { ...x, is_active: !x.is_active }
                                    : x,
                                ),
                              )
                            }
                            className={
                              "h-3 w-6 rounded-full relative transition-colors " +
                              (a.is_active
                                ? "bg-emerald-500"
                                : "bg-slate-300 dark:bg-white/[0.15]")
                            }
                            aria-label={a.is_active ? "Desativar" : "Ativar"}
                          >
                            <span
                              className={
                                "absolute top-0.5 h-2 w-2 rounded-full bg-white transition-transform " +
                                (a.is_active ? "translate-x-3" : "translate-x-0.5")
                              }
                            />
                          </button>
                          <span className="text-[12.5px] font-semibold text-slate-900 dark:text-white truncate">
                            {a.name}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/55 truncate">
                          {humanizeAutomation(a, columns)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => setEditingAutomation(a)}
                          className="text-[11px] text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setAutomations((arr) =>
                              arr.filter((x) => x.id !== a.id),
                            )
                          }
                          aria-label="Remover"
                          className="text-slate-400 hover:text-red-600 ml-1"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
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
              onClick={save}
              disabled={saving || !name.trim() || columns.length === 0}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar alterações
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      <AutomationBuilder
        open={editingAutomation !== null}
        automation={editingAutomation === "new" ? null : editingAutomation}
        columns={columns}
        onClose={() => setEditingAutomation(null)}
        onSave={(auto) => {
          setAutomations((arr) => {
            const idx = arr.findIndex((x) => x.id === auto.id)
            if (idx === -1) return [...arr, auto]
            return arr.map((x) => (x.id === auto.id ? auto : x))
          })
          setEditingAutomation(null)
        }}
      />
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

function humanizeAutomation(
  a: OperationalAutomation,
  columns: OperationalColumn[],
): string {
  const colName = (id: string | undefined) =>
    columns.find((c) => c.id === id)?.name ?? "—"
  const triggerText: Record<string, string> = {
    task_created: "Quando uma task é criada",
    task_moved_to: `Quando uma task for movida para "${colName(a.config.column_id)}"`,
    task_assigned: "Quando uma task for atribuída",
    task_overdue: "Quando uma task ficar atrasada",
    task_completed: "Quando uma task for concluída",
  }
  const actionText: Record<string, string> = {
    notify_assignee: "notificar o responsável",
    notify_channel: "notificar o canal",
    assign_to: "atribuir a um membro",
    move_to_column: `mover para "${colName(a.config.target_column_id)}"`,
    create_subtask: "criar uma subtask",
    update_field: "atualizar um campo",
  }
  return `${triggerText[a.trigger] ?? a.trigger}, ${actionText[a.action] ?? a.action}`
}
