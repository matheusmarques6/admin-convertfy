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
import { OnboardingDrawer } from "./onboarding-drawer"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { Plus, Sparkles, Loader2 } from "lucide-react"
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
  const [drawerId, setDrawerId] = useState<string | null>(null)
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
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-brand-100 dark:bg-brand-500/15 text-brand-400 dark:text-brand-300">
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
                  className="flex flex-col w-[264px] min-w-[264px]"
                >
                  {/* Header minimal estilo DS v3 — dot + nome + count, sem bg colorido */}
                  <div className="px-1 pb-2.5 pt-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-[7px] w-[7px] rounded-full shrink-0"
                          style={{ background: col.color }}
                          aria-hidden
                        />
                        <span className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">
                          {col.name}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500 dark:text-white/55 tabular-nums">
                          {cards.length}
                        </span>
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-white/35">
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
                            ? "bg-brand-50/60 dark:bg-brand-500/[0.05]"
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
                              <div
                                ref={dp.innerRef}
                                {...dp.draggableProps}
                                {...dp.dragHandleProps}
                                role="button"
                                tabIndex={0}
                                onClick={() => setDrawerId(onb.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault()
                                    setDrawerId(onb.id)
                                  }
                                }}
                                className="focus:outline-none"
                              >
                                <OnboardingCard
                                  onb={onb}
                                  stageColor={col.color}
                                  isDragging={ds.isDragging}
                                  onView={(id) => setDrawerId(id)}
                                  onForceAdvance={(id) => {
                                    window.location.href =
                                      ROUTES.ADMIN.ONBOARDING_V2.DETAIL(id) +
                                      "?action=force-advance"
                                  }}
                                  onRequestAdjustments={(id) => {
                                    window.location.href =
                                      ROUTES.ADMIN.ONBOARDING_V2.DETAIL(id) +
                                      "?action=go-back"
                                  }}
                                  onArchive={async (id) => {
                                    if (
                                      !confirm(
                                        "Arquivar esse onboarding? (status=cancelled, soft-delete)",
                                      )
                                    )
                                      return
                                    const res = await fetch(
                                      `/api/onboardings/${id}`,
                                      { method: "DELETE" },
                                    )
                                    if (res.ok) {
                                      toast.toast({ title: "Onboarding arquivado" })
                                      mutate()
                                    } else {
                                      const j = await res.json().catch(() => ({}))
                                      toast.toast({
                                        variant: "destructive",
                                        title: "Falha",
                                        description: j.error ?? "Tente novamente.",
                                      })
                                    }
                                  }}
                                />
                              </div>
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

      <OnboardingDrawer
        onboardingId={drawerId}
        open={drawerId !== null}
        onClose={() => setDrawerId(null)}
        onMutate={mutate}
      />
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
  const [plan, setPlan] = useState<string>("Pro")
  const [mrr, setMrr] = useState<string>("")
  const [whatsapp, setWhatsapp] = useState<string>("")
  const [language, setLanguage] = useState<string>("pt-BR")
  const [vertical, setVertical] = useState<string>("e-commerce")
  const [source, setSource] = useState<"manual" | "deal_won" | "referral" | "migration">("manual")
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  function fmtMrrInput(v: string): string {
    const digits = v.replace(/\D/g, "")
    if (!digits) return ""
    const n = Number(digits) / 100
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  }

  function fmtWhatsInput(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 13)
    if (d.length <= 2) return d
    if (d.length <= 4) return `+${d.slice(0, 2)} ${d.slice(2)}`
    if (d.length <= 9) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  }

  function parseMrrToNumber(s: string): number | null {
    const digits = s.replace(/\D/g, "")
    if (!digits) return null
    return Number(digits) / 100
  }

  async function submit() {
    if (!clientId || !storeId) {
      toast.toast({
        variant: "destructive",
        title: "Cliente e Loja sao obrigatorios",
      })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/onboardings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          store_id: storeId,
          plan,
          mrr_value: parseMrrToNumber(mrr),
          client_whatsapp: whatsapp || null,
          language,
          vertical,
          source,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.toast({
          variant: "destructive",
          title: "Falha ao criar",
          description: j.error ?? "Tente novamente.",
        })
        return
      }
      const onbId = j.onboarding?.id
      const formToken = j.onboarding?.form_token
      if (j.created === false) {
        toast.toast({
          title: "Onboarding ja existia",
          description: "Essa loja ja tem onboarding em progresso.",
        })
      } else if (formToken) {
        const url = `${window.location.origin}/form/${formToken}`
        try {
          await navigator.clipboard.writeText(url)
          toast.toast({
            title: "Onboarding criado",
            description: "Link do formulário copiado pra clipboard.",
          })
        } catch {
          toast.toast({
            title: "Onboarding criado",
            description: url,
          })
        }
      } else {
        toast.toast({ title: "Onboarding criado" })
      }
      onCreated()
      if (onbId) {
        // navega pro detail
        setTimeout(() => {
          window.location.href = `/admin/onboarding/${onbId}`
        }, 200)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[560px] bg-white dark:bg-[#0F1117] rounded-[8px] shadow-xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Novo onboarding
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/55">
            Cadastre cliente, loja e dados comerciais. Após criar, o link do
            formulário do cliente é gerado automaticamente.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <SelectClientAndStore
            selectedClientId={clientId}
            selectedStoreId={storeId}
            onClientChange={setClientId}
            onStoreChange={setStoreId}
          />

          {/* Comercial */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-white/80 uppercase tracking-wide">
                Plano
              </label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className="w-full h-9 px-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
              >
                <option value="Essencial">Essencial</option>
                <option value="Pro">Pro</option>
                <option value="Premium">Premium</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-white/80 uppercase tracking-wide">
                MRR (R$)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={mrr}
                onChange={(e) => setMrr(fmtMrrInput(e.target.value))}
                placeholder="R$ 0,00"
                className="w-full h-9 px-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-white/80 uppercase tracking-wide">
              WhatsApp do cliente
            </label>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(fmtWhatsInput(e.target.value))}
              placeholder="+55 (31) 99999-9999"
              className="w-full h-9 px-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-white/80 uppercase tracking-wide">
                Idioma
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full h-9 px-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
              >
                <option value="pt-BR">Português (BR)</option>
                <option value="en-US">English (US)</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-white/80 uppercase tracking-wide">
                Vertical
              </label>
              <select
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                className="w-full h-9 px-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
              >
                <option value="e-commerce">E-commerce</option>
                <option value="moda">Moda</option>
                <option value="suplementos">Suplementos</option>
                <option value="beleza">Beleza/Cosméticos</option>
                <option value="alimentos">Alimentos/Bebidas</option>
                <option value="automotivo">Automotivo</option>
                <option value="saude">Saúde</option>
                <option value="pets">Pets</option>
                <option value="outros">Outros</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-white/80 uppercase tracking-wide">
              Origem
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "manual", label: "Manual" },
                  { value: "deal_won", label: "Deal fechado" },
                  { value: "referral", label: "Indicação" },
                  { value: "migration", label: "Migração" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSource(opt.value)}
                  className={
                    "h-8 text-[12px] font-medium rounded-[5px] border transition-colors " +
                    (source === opt.value
                      ? "bg-[#1F1F1F] text-white border-[#1F1F1F] dark:bg-white dark:text-black dark:border-white"
                      : "bg-white dark:bg-white/[0.04] text-slate-700 dark:text-white/70 border-slate-200 dark:border-white/[0.08] hover:border-slate-300")
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-[12px] font-medium text-slate-700 hover:bg-slate-100 dark:text-white/80 dark:hover:bg-white/[0.04] rounded-[6px]"
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
            Criar e copiar link
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
