"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import {
  X,
  Settings,
  Plus,
  Trash2,
  GripVertical,
  Star,
  AlertTriangle,
  Loader2,
  Sparkles,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  CustomFieldFormDialog,
  CustomFieldListItem,
  NewCustomFieldButton,
  SystemFieldListItem,
  SYSTEM_DEAL_FIELDS,
  SYSTEM_LEAD_FIELDS,
  type CustomField,
} from "./custom-field-form-dialog"

const customFieldsFetcher = (url: string) => fetch(url).then((r) => r.json())

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

type StageType = "open" | "won" | "lost" | "archived"

interface Stage {
  id: string
  name: string
  color: string | null
  order: number
  stage_type: StageType | null
  sla_hours: number | null
  description: string | null
}

interface PipelineSummary {
  id: string
  name: string
  description: string | null
  scope: string
  color: string | null
  category?: string | null
  is_favorite?: boolean
  is_default?: boolean
  stages: Stage[]
}

interface PipelineSettingsDialogProps {
  open: boolean
  onClose: () => void
  pipeline: PipelineSummary
  /** Notifica o caller pra revalidar o SWR depois de qualquer mudanca. */
  onChanged?: () => void
  /** Notifica que o pipeline foi excluido — caller deve navegar fora. */
  onDeleted?: () => void
}

// Paleta de cores curada — alinhada com new-pipeline-dialog.
const STAGE_COLORS = [
  "#71717A",
  "#DC2626",
  "#EA580C",
  "#D97706",
  "#059669",
  "#0284C7",
  "#1D4ED8",
  "#7C3AED",
  "#9333EA",
  "#DB2777",
] as const

const STAGE_TYPE_OPTIONS: Array<{
  value: StageType
  label: string
  hint: string
}> = [
  { value: "open", label: "Aberto", hint: "Etapa ativa do funil" },
  { value: "won", label: "Ganho", hint: "Deal fechado com sucesso" },
  { value: "lost", label: "Perdido", hint: "Deal perdido" },
  { value: "archived", label: "Arquivado", hint: "Deal arquivado" },
]

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

async function postJson<T = unknown>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })
  const json = await res.json()
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error?.message || `Erro HTTP ${res.status}`)
  }
  return json as T
}

// ────────────────────────────────────────────────────────────────────
// Main dialog
// ────────────────────────────────────────────────────────────────────

export function PipelineSettingsDialog({
  open,
  onClose,
  pipeline,
  onChanged,
  onDeleted,
}: PipelineSettingsDialogProps) {
  const router = useRouter()
  const toast = useToast()

  // Estado local pra metadata do pipeline (edit local + botao salvar).
  const [name, setName] = useState(pipeline.name)
  const [description, setDescription] = useState(pipeline.description ?? "")
  const [color, setColor] = useState(pipeline.color ?? "#4E62D8")
  const [isDefault, setIsDefault] = useState(pipeline.is_default ?? false)
  const [category, setCategory] = useState(pipeline.category ?? "")
  const [isFavorite, setIsFavorite] = useState(pipeline.is_favorite ?? false)

  // Stages: estado local pra reorder otimista (depois sincroniza).
  const [stages, setStages] = useState<Stage[]>(pipeline.stages)
  const [savingMeta, setSavingMeta] = useState(false)
  const [deletingPipe, setDeletingPipe] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // Custom fields do deal — gerenciamento inline. Pipeline opera sobre
  // deals; o usuario cria/edita/deleta campos personalizados sem sair
  // do contexto comercial (sidebar nao muda pra "Geral" como acontecia
  // ao navegar pra /admin/settings/custom-fields).
  const {
    data: customFieldsData,
    mutate: mutateCustomFields,
  } = useSWR<{ fields: CustomField[] }>(
    open ? "/api/crm/custom-fields?entity=deal" : null,
    customFieldsFetcher,
  )
  const customFields = useMemo(
    () => customFieldsData?.fields ?? [],
    [customFieldsData],
  )
  const [editingCustomField, setEditingCustomField] = useState<
    CustomField | "new" | null
  >(null)

  // Re-sincroniza estado local quando o dialog ABRE. Depois disso, o
  // local state gerencia stages independente — caso contrario, o re-fetch
  // do SWR (disparado por onChanged) substitui a lista local pela versao
  // do prop antes do refetch terminar, causando a "stage nova some" ao
  // clicar em "Adicionar etapa".
  //
  // Tambem re-sincroniza meta (name/desc/color/etc) toda vez que o prop
  // muda — esses campos sao read-mostly e nao tem conflito de race.
  useEffect(() => {
    if (!open) return
    setName(pipeline.name)
    setDescription(pipeline.description ?? "")
    setColor(pipeline.color ?? "#4E62D8")
    setIsDefault(pipeline.is_default ?? false)
    setCategory(pipeline.category ?? "")
    setIsFavorite(pipeline.is_favorite ?? false)
  }, [open, pipeline])

  // Sincroniza stages SO quando o dialog abre. Apos isso, fica
  // manualmente em sincronia via handleAdd/Update/Delete + Reorder.
  // Re-sync forcado tambem ocorre quando o pipeline.id muda (troca
  // de pipeline).
  useEffect(() => {
    if (!open) return
    setStages(pipeline.stages)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pipeline.id])

  const metaDirty = useMemo(() => {
    return (
      name.trim() !== pipeline.name ||
      (description.trim() || "") !== (pipeline.description || "") ||
      color !== (pipeline.color ?? "#4E62D8") ||
      isDefault !== (pipeline.is_default ?? false) ||
      (category.trim() || "") !== (pipeline.category || "") ||
      isFavorite !== (pipeline.is_favorite ?? false)
    )
  }, [name, description, color, isDefault, category, isFavorite, pipeline])

  // ── Save metadata ──
  const handleSaveMeta = async () => {
    if (!name.trim()) {
      toast.toast({
        variant: "destructive",
        title: "Nome obrigatorio",
        description: "Informe um nome pro pipeline.",
      })
      return
    }
    setSavingMeta(true)
    try {
      await postJson(`/api/crm/pipelines/${pipeline.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
          is_default: isDefault,
          category: category.trim() || null,
          is_favorite: isFavorite,
        }),
      })
      toast.toast({ title: "Pipeline atualizado" })
      onChanged?.()
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      })
    } finally {
      setSavingMeta(false)
    }
  }

  // ── Reorder stages ──
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return
    const fromIdx = result.source.index
    const toIdx = result.destination.index
    if (fromIdx === toIdx) return

    // Reorder otimista
    const reordered = [...stages]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    const withNewOrder = reordered.map((s, i) => ({ ...s, order: i }))
    setStages(withNewOrder)

    try {
      await postJson(`/api/crm/pipelines/${pipeline.id}/stages/reorder`, {
        method: "POST",
        body: JSON.stringify({
          stages: withNewOrder.map((s) => ({ id: s.id, order: s.order })),
        }),
      })
      onChanged?.()
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao reordenar",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      })
      // Rollback
      setStages(pipeline.stages)
    }
  }

  // ── Add stage ──
  const handleAddStage = async () => {
    try {
      const json = await postJson<{ stage: Stage }>(
        `/api/crm/pipelines/${pipeline.id}/stages`,
        {
          method: "POST",
          body: JSON.stringify({
            name: "Nova etapa",
            color: "#71717A",
            stage_type: "open",
          }),
        },
      )
      setStages((prev) => [...prev, json.stage])
      onChanged?.()
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao adicionar etapa",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      })
    }
  }

  // ── Update stage (inline edit) ──
  const handleUpdateStage = async (stageId: string, patch: Partial<Stage>) => {
    // Otimista
    setStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, ...patch } : s)))

    try {
      await postJson(`/api/crm/pipelines/${pipeline.id}/stages/${stageId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      })
      onChanged?.()
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao atualizar etapa",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      })
      // Re-sync com o original
      setStages(pipeline.stages)
    }
  }

  // ── Delete stage ──
  const [pendingDelete, setPendingDelete] = useState<{
    stageId: string
    stageName: string
  } | null>(null)
  const [migrateTo, setMigrateTo] = useState<string>("")

  const performDeleteStage = async () => {
    if (!pendingDelete) return
    try {
      await postJson(
        `/api/crm/pipelines/${pipeline.id}/stages/${pendingDelete.stageId}`,
        {
          method: "DELETE",
          body: JSON.stringify(
            migrateTo ? { migrate_to_stage_id: migrateTo } : {},
          ),
        },
      )
      setStages((prev) => prev.filter((s) => s.id !== pendingDelete.stageId))
      setPendingDelete(null)
      setMigrateTo("")
      toast.toast({ title: "Etapa removida" })
      onChanged?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido"
      // Se erro indicar que precisa migrar, mantem modal aberto
      if (/migrate_to_stage_id|deal/i.test(msg) && !migrateTo) {
        toast.toast({
          variant: "destructive",
          title: "Migracao necessaria",
          description: "Esta etapa tem deals. Selecione onde mover antes.",
        })
        return
      }
      toast.toast({
        variant: "destructive",
        title: "Erro ao remover etapa",
        description: msg,
      })
    }
  }

  // ── Delete pipeline ──
  const performDeletePipeline = async () => {
    setDeletingPipe(true)
    try {
      await postJson(`/api/crm/pipelines/${pipeline.id}`, { method: "DELETE" })
      toast.toast({ title: "Pipeline arquivado" })
      onDeleted?.()
      // Volta pra lista geral do scope
      const fallback =
        pipeline.scope === "cs"
          ? "/admin/operacional/pipelines"
          : "/admin/comercial/pipelines"
      router.push(fallback)
      onClose()
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao excluir pipeline",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      })
    } finally {
      setDeletingPipe(false)
      setDeleteConfirmOpen(false)
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-[680px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <DialogPrimitive.Title className="sr-only">
            Configuracoes do pipeline
          </DialogPrimitive.Title>

          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/70"
                aria-hidden
              >
                <Settings className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white truncate">
                  Configurar pipeline
                </h2>
                <p className="text-[12px] text-slate-500 dark:text-white/55 mt-0.5 truncate">
                  Edite nome, etapas, ordem e mais.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-slate-500 dark:text-white/55 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body — scroll */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {/* ── Section: Geral ── */}
            <section className="space-y-3">
              <SectionHeading title="Geral" hint="Nome, cor e descricao do pipeline" />

              <Field label="Nome" required>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Funil de Vendas"
                  className="w-full h-9 px-3 text-[13px] rounded-[6px] bg-white dark:bg-[#1A1D27] border border-black/[0.08] dark:border-white/[0.08] text-slate-900 dark:text-white/90 placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:border-slate-400 dark:focus:border-white/30"
                />
              </Field>

              <Field label="Descricao">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Pra que serve esse pipeline?"
                  className="w-full px-3 py-2 text-[13px] rounded-[6px] bg-white dark:bg-[#1A1D27] border border-black/[0.08] dark:border-white/[0.08] text-slate-900 dark:text-white/90 placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:border-slate-400 dark:focus:border-white/30 resize-y"
                />
              </Field>

              <Field label="Cor">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {STAGE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Cor ${c}`}
                      className={cn(
                        "h-7 w-7 rounded-full transition-all",
                        color === c
                          ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#0F1117] scale-110"
                          : "hover:scale-105",
                      )}
                      style={{
                        background: c,
                        boxShadow: color === c ? `0 0 0 2px ${c}` : undefined,
                      }}
                    />
                  ))}
                </div>
              </Field>

              <Field
                label="Categoria"
                hint="Agrupamento na sidebar de pipelines"
              >
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Ex: Comerciais, Inbound, Outbound..."
                  className="w-full h-9 px-3 text-[13px] rounded-[6px] bg-white dark:bg-[#1A1D27] border border-black/[0.08] dark:border-white/[0.08] text-slate-900 dark:text-white/90 placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:border-slate-400 dark:focus:border-white/30"
                />
              </Field>

              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isFavorite}
                  onChange={(e) => setIsFavorite(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-white/20 cursor-pointer"
                />
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800 dark:text-white/85">
                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                    Marcar como favorito
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-white/45 leading-relaxed">
                    Pipelines favoritos aparecem no topo da sidebar.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-white/20 cursor-pointer"
                />
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800 dark:text-white/85">
                    <Star className="h-3.5 w-3.5 text-amber-500" />
                    Definir como pipeline padrao
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-white/45 leading-relaxed">
                    Novos deals criados sem pipeline explicito vao pra ca. Apenas um
                    pipeline pode ser padrao por escopo.
                  </p>
                </div>
              </label>

              {/* Save meta button */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleSaveMeta}
                  disabled={!metaDirty || savingMeta}
                  className={cn(
                    "inline-flex items-center gap-2 h-8 px-3 rounded-[6px] text-[12px] font-semibold transition-colors",
                    metaDirty && !savingMeta
                      ? "bg-[#2563EB] hover:bg-[#1D4ED8] text-white"
                      : "bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-white/30 cursor-not-allowed",
                  )}
                >
                  {savingMeta && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Salvar alteracoes
                </button>
              </div>
            </section>

            <Divider />

            {/* ── Section: Etapas ── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionHeading
                  title="Etapas"
                  hint={`${stages.length} ${stages.length === 1 ? "etapa" : "etapas"} · arraste pra reordenar`}
                />
                <button
                  type="button"
                  onClick={handleAddStage}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  Adicionar etapa
                </button>
              </div>

              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="stages">
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="space-y-2"
                    >
                      {stages.map((stage, idx) => (
                        <Draggable
                          key={stage.id}
                          draggableId={stage.id}
                          index={idx}
                        >
                          {(dragProvided, dragSnap) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={cn(
                                "group rounded-[6px] border bg-slate-50 dark:bg-white/[0.04] transition-shadow",
                                dragSnap.isDragging
                                  ? "border-blue-500 shadow-lg"
                                  : "border-black/[0.04] dark:border-white/[0.04]",
                              )}
                            >
                              <StageRow
                                stage={stage}
                                dragHandleProps={dragProvided.dragHandleProps}
                                onChange={(patch) =>
                                  handleUpdateStage(stage.id, patch)
                                }
                                onDelete={() =>
                                  setPendingDelete({
                                    stageId: stage.id,
                                    stageName: stage.name,
                                  })
                                }
                                canDelete={stages.length > 1}
                              />
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

            <Divider />

            {/* ── Section: Campos do deal ── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionHeading
                  title="Campos do deal"
                  hint="Inclui os campos do sistema (sempre presentes) e os campos personalizados que voce define."
                />
                <NewCustomFieldButton
                  onClick={() => setEditingCustomField("new")}
                  size="sm"
                />
              </div>

              {/* Campos do sistema do deal */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400 dark:text-white/40 mb-1.5">
                  Sistema · {SYSTEM_DEAL_FIELDS.length}
                </p>
                <ul className="space-y-1.5">
                  {SYSTEM_DEAL_FIELDS.map((f) => (
                    <SystemFieldListItem
                      key={f.key}
                      label={f.label}
                      fieldKey={f.key}
                      type={f.type}
                      hint={f.hint}
                      compact
                    />
                  ))}
                </ul>
              </div>

              {/* Campos do sistema do lead vinculado */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400 dark:text-white/40 mb-1.5">
                  Lead vinculado · {SYSTEM_LEAD_FIELDS.length}
                </p>
                <ul className="space-y-1.5">
                  {SYSTEM_LEAD_FIELDS.map((f) => (
                    <SystemFieldListItem
                      key={f.key}
                      label={f.label}
                      fieldKey={f.key}
                      type={f.type}
                      compact
                    />
                  ))}
                </ul>
              </div>

              {/* Custom fields */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400 dark:text-white/40 mb-1.5">
                  Personalizados · {customFields.length}
                </p>
                {customFields.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setEditingCustomField("new")}
                    className="w-full rounded-[6px] border border-dashed border-slate-300 dark:border-white/[0.10] bg-slate-50/40 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.04] p-3 text-left transition-colors"
                  >
                    <div className="flex items-start gap-2.5">
                      <Sparkles className="h-3.5 w-3.5 text-slate-400 dark:text-white/40 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-slate-700 dark:text-white/80">
                          Adicionar primeiro campo
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-white/45 leading-relaxed mt-0.5">
                          Ex: &quot;URL da loja&quot;, &quot;Faturamento
                          mensal&quot;, &quot;Segmento&quot;. Eles aparecem na
                          ficha do deal e podem ser mapeados de formularios.
                        </p>
                      </div>
                    </div>
                  </button>
                ) : (
                  <ul className="space-y-1.5">
                    {customFields.map((f) => (
                      <CustomFieldListItem
                        key={f.id}
                        field={f}
                        compact
                        onEdit={() => setEditingCustomField(f)}
                        onDelete={async () => {
                          if (
                            !confirm(
                              `Excluir o campo "${f.label}"? Os dados ja gravados serao preservados.`,
                            )
                          )
                            return
                          await fetch(`/api/crm/custom-fields/${f.id}`, {
                            method: "DELETE",
                          })
                          mutateCustomFields()
                        }}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <Divider />

            {/* ── Section: Zona de perigo ── */}
            <section className="space-y-3">
              <SectionHeading
                title="Zona de perigo"
                hint="Acoes irreversiveis ou que afetam dados"
                danger
              />
              <div className="rounded-[6px] border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-white/85">
                      Excluir pipeline
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-white/55 leading-relaxed mt-0.5">
                      O pipeline sera arquivado (soft delete). Os deals existentes
                      continuam acessiveis mas o pipeline some das listas.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-red-600 hover:bg-red-700 text-white text-[12px] font-semibold shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              Fechar
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      {/* Confirm: delete stage */}
      {pendingDelete && (
        <ConfirmDeleteStage
          stageName={pendingDelete.stageName}
          stages={stages.filter((s) => s.id !== pendingDelete.stageId)}
          migrateTo={migrateTo}
          onMigrateChange={setMigrateTo}
          onCancel={() => {
            setPendingDelete(null)
            setMigrateTo("")
          }}
          onConfirm={performDeleteStage}
        />
      )}

      {/* Confirm: delete pipeline */}
      {deleteConfirmOpen && (
        <ConfirmDeletePipeline
          pipelineName={pipeline.name}
          loading={deletingPipe}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={performDeletePipeline}
        />
      )}

      {/* CRUD inline de custom fields — Radix Dialog proprio gerencia
          aninhamento corretamente sobre o PipelineSettingsDialog. */}
      <CustomFieldFormDialog
        open={editingCustomField !== null}
        entity="deal"
        field={editingCustomField === "new" ? null : editingCustomField}
        onOpenChange={(v) => {
          if (!v) setEditingCustomField(null)
        }}
        onSaved={() => {
          setEditingCustomField(null)
          mutateCustomFields()
        }}
        existingKeys={customFields.map((f) => f.key)}
      />
    </DialogPrimitive.Root>
  )
}

// ────────────────────────────────────────────────────────────────────
// Sub-componentes
// ────────────────────────────────────────────────────────────────────

function SectionHeading({
  title,
  hint,
  danger,
}: {
  title: string
  hint?: string
  danger?: boolean
}) {
  return (
    <div>
      <h3
        className={cn(
          "text-[13px] font-semibold",
          danger
            ? "text-red-700 dark:text-red-400"
            : "text-slate-900 dark:text-white/90",
        )}
      >
        {title}
      </h3>
      {hint && (
        <p className="text-[11px] text-slate-500 dark:text-white/45 mt-0.5">
          {hint}
        </p>
      )}
    </div>
  )
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-medium text-slate-700 dark:text-white/75 block">
        {label} {required && <span className="text-red-500">*</span>}
        {hint && (
          <span className="ml-1 text-slate-400 dark:text-white/40 font-normal">
            ({hint})
          </span>
        )}
      </label>
      {children}
    </div>
  )
}

function Divider() {
  return <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />
}

interface StageRowProps {
  stage: Stage
  dragHandleProps: React.HTMLAttributes<HTMLDivElement> | null | undefined
  onChange: (patch: Partial<Stage>) => void
  onDelete: () => void
  canDelete: boolean
}

function StageRow({
  stage,
  dragHandleProps,
  onChange,
  onDelete,
  canDelete,
}: StageRowProps) {
  // Edita localmente nome/sla pra evitar PATCH a cada keystroke. Salva
  // no blur ou Enter.
  const [localName, setLocalName] = useState(stage.name)
  const [localSla, setLocalSla] = useState(
    stage.sla_hours == null ? "" : String(stage.sla_hours),
  )

  useEffect(() => {
    setLocalName(stage.name)
    setLocalSla(stage.sla_hours == null ? "" : String(stage.sla_hours))
  }, [stage.name, stage.sla_hours])

  const commitName = () => {
    const trimmed = localName.trim()
    if (!trimmed) {
      setLocalName(stage.name)
      return
    }
    if (trimmed !== stage.name) onChange({ name: trimmed })
  }

  const commitSla = () => {
    if (localSla === "") {
      if (stage.sla_hours != null) onChange({ sla_hours: null })
      return
    }
    const n = parseInt(localSla, 10)
    if (Number.isFinite(n) && n > 0 && n !== stage.sla_hours) {
      onChange({ sla_hours: n })
    } else if (!Number.isFinite(n) || n <= 0) {
      setLocalSla(stage.sla_hours == null ? "" : String(stage.sla_hours))
    }
  }

  return (
    <div className="flex items-center gap-2 p-2.5">
      {/* Drag handle */}
      <div
        {...dragHandleProps}
        aria-label="Arrastar"
        className="flex h-7 w-5 shrink-0 items-center justify-center text-slate-400 dark:text-white/30 hover:text-slate-700 dark:hover:text-white/70 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Color */}
      <input
        type="color"
        value={stage.color || "#71717A"}
        onChange={(e) => onChange({ color: e.target.value })}
        className="h-7 w-7 shrink-0 rounded cursor-pointer border-none p-0 bg-transparent"
        aria-label="Cor da etapa"
        title="Cor da etapa"
      />

      {/* Nome */}
      <input
        type="text"
        value={localName}
        onChange={(e) => setLocalName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          if (e.key === "Escape") {
            setLocalName(stage.name)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        placeholder="Nome da etapa"
        className="flex-1 min-w-0 h-8 px-2 text-[13px] rounded-[4px] bg-white dark:bg-[#1A1D27] border border-black/[0.08] dark:border-white/[0.08] text-slate-900 dark:text-white/90 focus:outline-none focus:border-slate-400 dark:focus:border-white/30"
      />

      {/* Tipo */}
      <select
        value={stage.stage_type ?? "open"}
        onChange={(e) => onChange({ stage_type: e.target.value as StageType })}
        className="h-8 px-2 text-[12px] rounded-[4px] bg-white dark:bg-[#1A1D27] border border-black/[0.08] dark:border-white/[0.08] text-slate-700 dark:text-white/80 focus:outline-none cursor-pointer"
        title="Tipo da etapa"
      >
        {STAGE_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* SLA */}
      <div className="relative shrink-0">
        <input
          type="number"
          min={1}
          value={localSla}
          onChange={(e) => setLocalSla(e.target.value)}
          onBlur={commitSla}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          }}
          placeholder="SLA"
          aria-label="SLA em horas"
          title="SLA em horas (opcional)"
          className="w-[68px] h-8 pl-2 pr-7 text-[12px] rounded-[4px] bg-white dark:bg-[#1A1D27] border border-black/[0.08] dark:border-white/[0.08] text-slate-900 dark:text-white/90 focus:outline-none focus:border-slate-400 dark:focus:border-white/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400 dark:text-white/40">
          h
        </span>
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        disabled={!canDelete}
        aria-label={`Excluir etapa ${stage.name}`}
        title={
          canDelete
            ? "Excluir etapa"
            : "Pipeline precisa ter ao menos 1 etapa"
        }
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px]",
          canDelete
            ? "text-slate-400 hover:bg-red-50 hover:text-red-600 dark:text-white/40 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            : "text-slate-300 dark:text-white/15 cursor-not-allowed",
        )}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Confirm modals (inline pra evitar dependencia adicional)
// ────────────────────────────────────────────────────────────────────

function ConfirmDeleteStage({
  stageName,
  stages,
  migrateTo,
  onMigrateChange,
  onCancel,
  onConfirm,
}: {
  stageName: string
  stages: Stage[]
  migrateTo: string
  onMigrateChange: (id: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && onCancel()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[60] w-full max-w-[440px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] p-5 space-y-4">
          <DialogPrimitive.Title className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Excluir etapa &quot;{stageName}&quot;?
          </DialogPrimitive.Title>
          <p className="text-[12px] text-slate-600 dark:text-white/60 leading-relaxed">
            Se houver deals nessa etapa, voce deve mover pra outra etapa antes
            de excluir.
          </p>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-slate-700 dark:text-white/75 block">
              Mover deals pra (opcional, se houver)
            </label>
            <select
              value={migrateTo}
              onChange={(e) => onMigrateChange(e.target.value)}
              className="w-full h-9 px-3 text-[13px] rounded-[6px] bg-white dark:bg-[#1A1D27] border border-black/[0.08] dark:border-white/[0.08] text-slate-900 dark:text-white/90 cursor-pointer"
            >
              <option value="">Nao mover (etapa nao tem deals)</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onCancel}
              className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              className="h-8 px-3 rounded-[6px] bg-red-600 hover:bg-red-700 text-white text-[12px] font-semibold"
            >
              Excluir etapa
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function ConfirmDeletePipeline({
  pipelineName,
  loading,
  onCancel,
  onConfirm,
}: {
  pipelineName: string
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState("")
  const matches = typed.trim().toLowerCase() === pipelineName.trim().toLowerCase()

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && !loading && onCancel()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[60] w-full max-w-[440px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] p-5 space-y-4">
          <DialogPrimitive.Title className="text-[15px] font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Excluir pipeline?
          </DialogPrimitive.Title>
          <p className="text-[12px] text-slate-600 dark:text-white/60 leading-relaxed">
            Esta acao arquiva o pipeline (soft delete). Os deals continuam no
            banco mas o pipeline some das listas. Pra confirmar, digite o nome
            exato:
          </p>
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono text-slate-500 dark:text-white/45 block">
              {pipelineName}
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Digite o nome do pipeline"
              autoFocus
              className="w-full h-9 px-3 text-[13px] rounded-[6px] bg-white dark:bg-[#1A1D27] border border-black/[0.08] dark:border-white/[0.08] text-slate-900 dark:text-white/90 focus:outline-none focus:border-slate-400 dark:focus:border-white/30"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onCancel}
              disabled={loading}
              className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={!matches || loading}
              className={cn(
                "inline-flex items-center gap-2 h-8 px-3 rounded-[6px] text-[12px] font-semibold",
                matches && !loading
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-white/30 cursor-not-allowed",
              )}
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Excluir definitivamente
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
