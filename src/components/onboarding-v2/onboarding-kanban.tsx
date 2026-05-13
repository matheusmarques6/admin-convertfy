"use client"

/**
 * Kanban dos onboardings (pipeline 7 colunas). Drag-and-drop entre
 * colunas chama /api/onboardings/[id]/advance se for proxima coluna,
 * ou /go-back se voltar (com modal de feedback obrigatorio).
 *
 * Card mostra: cliente, loja, briefing_status, current_version, dias
 * parado, flags de pagamento/contrato.
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import { SelectClientAndStore } from "./select-client-and-store"
import { OnboardingCard } from "./onboarding-card"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { Plus, Sparkles, Loader2 } from "lucide-react"
import Link from "next/link"
import { useToast } from "@/lib/hooks/use-toast"
import { ROUTES } from "@/lib/routes"
import type {
  OnboardingPipelineItem,
  OperationalPipelineColumn,
} from "@/types/onboarding-pipeline"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error?.message ?? j.error ?? `HTTP ${r.status}`)
  return j
}

export function OnboardingKanban() {
  const { data, mutate, isLoading } = useSWR<{
    columns: OperationalPipelineColumn[]
    onboardings: OnboardingPipelineItem[]
  }>("/api/onboardings", fetcher, { revalidateOnFocus: false })
  const [newOpen, setNewOpen] = useState(false)
  const [goBackContext, setGoBackContext] = useState<{
    onboardingId: string
    targetSlug: string
  } | null>(null)
  const toast = useToast()

  const columns = useMemo(
    () => [...(data?.columns ?? [])].sort((a, b) => a.position - b.position),
    [data?.columns],
  )
  const onboardings = useMemo(() => data?.onboardings ?? [], [data?.onboardings])

  const byColumn = useMemo(() => {
    const map = new Map<string, OnboardingPipelineItem[]>()
    for (const c of columns) map.set(c.id, [])
    for (const o of onboardings) {
      if (!o.current_column_id) continue
      map.get(o.current_column_id)?.push(o)
    }
    return map
  }, [columns, onboardings])

  const handleDrag = async (result: DropResult) => {
    if (!result.destination) return
    const { draggableId, destination, source } = result
    if (destination.droppableId === source.droppableId) return

    const onb = onboardings.find((o) => o.id === draggableId)
    if (!onb) return

    const srcIdx = columns.findIndex((c) => c.id === source.droppableId)
    const destIdx = columns.findIndex((c) => c.id === destination.droppableId)
    if (srcIdx < 0 || destIdx < 0) return

    // Avancar (proximo +1)
    if (destIdx === srcIdx + 1) {
      const res = await fetch(`/api/onboardings/${draggableId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.toast({
          variant: "destructive",
          title: "Nao foi possivel avancar",
          description: j.error?.message ?? j.error ?? "Tente novamente.",
        })
        return
      }
      toast.toast({ title: "Onboarding avancou de coluna" })
      mutate()
      return
    }

    // Voltar pra coluna anterior — abre dialog de feedback
    if (destIdx < srcIdx) {
      const targetCol = columns[destIdx]
      setGoBackContext({
        onboardingId: draggableId,
        targetSlug: targetCol.slug,
      })
      return
    }

    toast.toast({
      variant: "destructive",
      title: "Pular colunas não permitido",
      description: "Arraste 1 coluna por vez (avançar ou voltar).",
    })
  }

  if (isLoading) return <KanbanSkeleton />

  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-[#0B0E15]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-2.5 bg-white dark:bg-[#0F1117] border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <h1 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
            Onboarding
          </h1>
          <span className="text-[11px] font-medium text-slate-400 tabular-nums">
            {onboardings.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo onboarding
        </button>
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 overflow-x-auto">
        <DragDropContext onDragEnd={handleDrag}>
          <div className="flex gap-3 px-5 py-4 h-full">
            {columns.map((col) => {
              const cards = byColumn.get(col.id) ?? []
              return (
                <div
                  key={col.id}
                  className="flex flex-col w-[300px] min-w-[300px] rounded-[8px] bg-white dark:bg-[#161922] border border-black/[0.06] dark:border-white/[0.08]"
                >
                  <div
                    className="px-3 py-2.5 rounded-t-[8px] border-b border-black/[0.04] dark:border-white/[0.06]"
                    style={{ background: `${col.color}15` }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ background: col.color }}
                          aria-hidden
                        />
                        <span className="text-[12px] font-semibold text-slate-900 dark:text-white truncate">
                          {col.name}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500 dark:text-white/55 tabular-nums">
                          {cards.length}
                        </span>
                      </div>
                      <span className="text-[10px] uppercase tracking-wide font-mono text-slate-400 dark:text-white/35">
                        {col.default_assignee_role ?? "—"}
                      </span>
                    </div>
                  </div>

                  <Droppable droppableId={col.id}>
                    {(prov, snap) => (
                      <div
                        ref={prov.innerRef}
                        {...prov.droppableProps}
                        className={
                          "flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px] " +
                          (snap.isDraggingOver
                            ? "bg-violet-50/40 dark:bg-violet-500/[0.05]"
                            : "")
                        }
                      >
                        {cards.map((onb, idx) => (
                          <Draggable
                            key={onb.id}
                            draggableId={onb.id}
                            index={idx}
                          >
                            {(dp, ds) => (
                              <Link
                                href={ROUTES.ADMIN.ONBOARDING_V2.DETAIL(onb.id)}
                                ref={dp.innerRef}
                                {...dp.draggableProps}
                                {...dp.dragHandleProps}
                                className="block focus:outline-none"
                              >
                                <OnboardingCard
                                  onb={onb}
                                  stageColor={col.color}
                                  isDragging={ds.isDragging}
                                />
                              </Link>
                            )}
                          </Draggable>
                        ))}
                        {prov.placeholder}
                        {cards.length === 0 && !snap.isDraggingOver && (
                          <p className="text-[11px] text-slate-400 dark:text-white/30 text-center py-3 italic">
                            Vazio
                          </p>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      </div>

      {newOpen && (
        <NewOnboardingDialog
          onClose={() => setNewOpen(false)}
          onCreated={() => {
            setNewOpen(false)
            mutate()
          }}
        />
      )}

      {goBackContext && (
        <KanbanGoBackDialog
          onboardingId={goBackContext.onboardingId}
          targetSlug={goBackContext.targetSlug}
          onClose={() => setGoBackContext(null)}
          onDone={() => {
            setGoBackContext(null)
            mutate()
          }}
        />
      )}
    </div>
  )
}

function KanbanGoBackDialog({
  onboardingId,
  targetSlug,
  onClose,
  onDone,
}: {
  onboardingId: string
  targetSlug: string
  onClose: () => void
  onDone: () => void
}) {
  const [feedback, setFeedback] = useState("")
  const [severity, setSeverity] = useState<
    "small" | "medium" | "rework_part" | "rework_all"
  >("medium")
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  async function submit() {
    if (feedback.trim().length < 10) {
      toast.toast({
        variant: "destructive",
        title: "Feedback obrigatorio",
        description: "Mínimo 10 caracteres.",
      })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/onboardings/${onboardingId}/go-back`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_column_slug: targetSlug,
          feedback,
          severity,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.toast({
          variant: "destructive",
          title: "Falha",
          description: j.error?.message ?? "Tente novamente.",
        })
        return
      }
      toast.toast({ title: "Onboarding voltou pra coluna anterior" })
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[460px] bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">
        <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Voltar pra coluna anterior
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/55">
            Uma nova versão será criada com o feedback.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80 mb-1">
              Severidade
            </label>
            <select
              value={severity}
              onChange={(e) =>
                setSeverity(
                  e.target.value as
                    | "small"
                    | "medium"
                    | "rework_part"
                    | "rework_all",
                )
              }
              className="w-full h-9 px-2 text-[12px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
            >
              <option value="small">Ajuste pequeno</option>
              <option value="medium">Ajuste médio</option>
              <option value="rework_part">Retrabalho parcial</option>
              <option value="rework_all">Retrabalho completo</option>
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80 mb-1">
              Feedback (min 10 chars)
            </label>
            <textarea
              autoFocus
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              placeholder="O que precisa ser ajustado..."
              className="w-full px-3 py-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-[12px] font-medium text-slate-700 hover:bg-slate-100 rounded-[6px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-[6px] disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Voltar coluna
          </button>
        </div>
      </div>
    </div>
  )
}


function NewOnboardingDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [clientId, setClientId] = useState<string | null>(null)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  async function submit() {
    if (!clientId || !storeId) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/onboardings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, store_id: storeId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.toast({
          variant: "destructive",
          title: "Falha ao criar",
          description: j.error?.message ?? "Tente novamente.",
        })
        return
      }
      if (j.created === false) {
        toast.toast({
          title: "Onboarding ja existia",
          description: "Essa loja ja tem onboarding em progresso.",
        })
      } else {
        toast.toast({ title: "Onboarding criado" })
      }
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[520px] bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Novo onboarding
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/55">
            Selecione cliente existente e loja. Se o cliente nao existe ainda,
            crie em /admin/clients/new.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <SelectClientAndStore
            selectedClientId={clientId}
            selectedStoreId={storeId}
            onClientChange={setClientId}
            onStoreChange={setStoreId}
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-[12px] font-medium text-slate-700 hover:bg-slate-100 rounded-[6px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !clientId || !storeId}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold bg-[#1F1F1F] dark:bg-white text-white dark:text-black rounded-[6px] disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Criar onboarding
          </button>
        </div>
      </div>
    </div>
  )
}

function KanbanSkeleton() {
  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-[#0B0E15]">
      <div className="h-14 border-b border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#0F1117]" />
      <div className="flex gap-3 p-5 overflow-x-auto">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="w-[300px] min-w-[300px] rounded-[8px] bg-white dark:bg-[#161922] border border-black/[0.06] dark:border-white/[0.08] p-3 animate-pulse"
          >
            <div className="h-4 w-24 bg-slate-200 dark:bg-white/[0.06] rounded mb-3" />
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((__, j) => (
                <div key={j} className="h-16 bg-slate-100 dark:bg-white/[0.04] rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
