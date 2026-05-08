"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X, GitBranch, HeartHandshake, Plus, Trash2 } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"

interface NewPipelineDialogProps {
  open: boolean
  onClose: () => void
  scope: "sales" | "cs"
  onCreated?: (pipelineId: string) => void
}

interface DraftStage {
  name: string
  color: string
  stage_type: "open" | "won" | "lost"
  sla_hours: number | null
}

// Templates pra cada scope — usuario pode editar/remover/adicionar.
const TEMPLATES: Record<"sales" | "cs", DraftStage[]> = {
  sales: [
    { name: "Lead novo", color: "#71717A", stage_type: "open", sla_hours: 24 },
    { name: "Qualificado", color: "#1D4ED8", stage_type: "open", sla_hours: 48 },
    { name: "Proposta enviada", color: "#EA580C", stage_type: "open", sla_hours: 168 },
    { name: "Negociacao", color: "#C2410C", stage_type: "open", sla_hours: 168 },
    { name: "Ganho", color: "#047857", stage_type: "won", sla_hours: null },
    { name: "Perdido", color: "#52525B", stage_type: "lost", sla_hours: null },
  ],
  cs: [
    { name: "Aguardando inicio", color: "#71717A", stage_type: "open", sla_hours: 24 },
    { name: "Em andamento", color: "#1D4ED8", stage_type: "open", sla_hours: 168 },
    { name: "Em revisao", color: "#EA580C", stage_type: "open", sla_hours: 72 },
    { name: "Concluido", color: "#047857", stage_type: "won", sla_hours: null },
    { name: "Cancelado", color: "#52525B", stage_type: "lost", sla_hours: null },
  ],
}

const COLORS = ["#71717A", "#DC2626", "#EA580C", "#D97706", "#059669", "#0284C7", "#1D4ED8", "#7C3AED", "#9333EA", "#DB2777"]

export function NewPipelineDialog({
  open,
  onClose,
  scope,
  onCreated,
}: NewPipelineDialogProps) {
  const router = useRouter()
  const toast = useToast()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState(scope === "cs" ? "#059669" : "#2563EB")
  const [stages, setStages] = useState<DraftStage[]>(TEMPLATES[scope])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const Icon = scope === "cs" ? HeartHandshake : GitBranch
  const heading =
    scope === "cs" ? "Novo pipeline de Customer Success" : "Novo pipeline comercial"

  const reset = () => {
    setName("")
    setDescription("")
    setColor(scope === "cs" ? "#059669" : "#2563EB")
    setStages(TEMPLATES[scope])
    setError(null)
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const updateStage = (idx: number, patch: Partial<DraftStage>) => {
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const removeStage = (idx: number) => {
    setStages((prev) => prev.filter((_, i) => i !== idx))
  }

  const addStage = () => {
    setStages((prev) => [
      ...prev,
      { name: "Nova etapa", color: "#71717A", stage_type: "open", sla_hours: null },
    ])
  }

  const handleSubmit = async () => {
    setError(null)
    if (!name.trim()) {
      setError("Nome do pipeline e obrigatorio")
      return
    }
    if (stages.length === 0) {
      setError("Adicione pelo menos uma etapa")
      return
    }
    if (stages.some((s) => !s.name.trim())) {
      setError("Todas as etapas precisam de um nome")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/crm/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          scope,
          color,
          layout: "kanban",
          stages: stages.map((s, i) => ({
            name: s.name.trim(),
            color: s.color,
            order: i + 1,
            stage_type: s.stage_type,
            sla_hours: s.sla_hours,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok || json.success === false) {
        throw new Error(json?.error?.message || `Erro HTTP ${res.status}`)
      }
      toast.toast({ title: "Pipeline criado", description: name.trim() })
      onCreated?.(json.id)
      const base =
        scope === "cs"
          ? "/admin/operacional/pipelines"
          : "/admin/comercial/pipelines"
      router.push(`${base}/${json.id}`)
      reset()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-[600px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <DialogPrimitive.Title className="sr-only">{heading}</DialogPrimitive.Title>

          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px]"
                style={{
                  background:
                    scope === "cs" ? "rgba(5,150,105,0.10)" : "rgba(37,99,235,0.10)",
                  color: scope === "cs" ? "#059669" : "#2563EB",
                }}
                aria-hidden
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  {heading}
                </h2>
                <p className="text-[12px] text-slate-500 dark:text-white/55 mt-0.5">
                  Configure as etapas do funil. Voce pode editar tudo depois.
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              aria-label="Fechar"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-slate-500 dark:text-white/55 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body — scrollavel */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Nome */}
            <div className="space-y-1.5">
              <label
                htmlFor="pipe-name"
                className="text-[12px] font-medium text-slate-700 dark:text-white/75"
              >
                Nome do pipeline <span className="text-red-500">*</span>
              </label>
              <input
                id="pipe-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Funil de Vendas, Onboarding 30d..."
                className="w-full h-9 px-3 text-[13px] rounded-[6px] bg-white dark:bg-[#1A1D27] border border-black/[0.08] dark:border-white/[0.08] text-slate-900 dark:text-white/90 placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:border-slate-400 dark:focus:border-white/30"
                autoFocus
              />
            </div>

            {/* Descricao */}
            <div className="space-y-1.5">
              <label
                htmlFor="pipe-desc"
                className="text-[12px] font-medium text-slate-700 dark:text-white/75"
              >
                Descricao
              </label>
              <textarea
                id="pipe-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Pra que serve esse pipeline?"
                rows={2}
                className="w-full px-3 py-2 text-[13px] rounded-[6px] bg-white dark:bg-[#1A1D27] border border-black/[0.08] dark:border-white/[0.08] text-slate-900 dark:text-white/90 placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:border-slate-400 dark:focus:border-white/30 resize-y"
              />
            </div>

            {/* Cor do pipeline */}
            <div className="space-y-1.5">
              <span className="text-[12px] font-medium text-slate-700 dark:text-white/75 block">
                Cor do pipeline
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Cor ${c}`}
                    className={
                      "h-7 w-7 rounded-full transition-all " +
                      (color === c
                        ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#0F1117] scale-110"
                        : "hover:scale-105")
                    }
                    style={{
                      background: c,
                      boxShadow: color === c ? `0 0 0 2px ${c}` : undefined,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Etapas */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-slate-700 dark:text-white/75">
                  Etapas <span className="text-slate-400 dark:text-white/40">({stages.length})</span>
                </span>
                <button
                  type="button"
                  onClick={addStage}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  Adicionar etapa
                </button>
              </div>
              <div className="space-y-2">
                {stages.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 rounded-[6px] bg-slate-50 dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.04]"
                  >
                    <input
                      type="color"
                      value={s.color}
                      onChange={(e) => updateStage(i, { color: e.target.value })}
                      className="h-6 w-6 shrink-0 rounded cursor-pointer border-none"
                      aria-label="Cor da etapa"
                    />
                    <input
                      type="text"
                      value={s.name}
                      onChange={(e) => updateStage(i, { name: e.target.value })}
                      placeholder="Nome da etapa"
                      className="flex-1 h-7 px-2 text-[12px] rounded-[4px] bg-white dark:bg-[#1A1D27] border border-black/[0.06] dark:border-white/[0.08] text-slate-900 dark:text-white/90 focus:outline-none focus:border-slate-300 dark:focus:border-white/20"
                    />
                    <select
                      value={s.stage_type}
                      onChange={(e) =>
                        updateStage(i, {
                          stage_type: e.target.value as DraftStage["stage_type"],
                        })
                      }
                      className="h-7 px-2 text-[11px] rounded-[4px] bg-white dark:bg-[#1A1D27] border border-black/[0.06] dark:border-white/[0.08] text-slate-700 dark:text-white/75 cursor-pointer focus:outline-none"
                    >
                      <option value="open">Aberto</option>
                      <option value="won">Ganho</option>
                      <option value="lost">Perdido</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={s.sla_hours ?? ""}
                      onChange={(e) =>
                        updateStage(i, {
                          sla_hours: e.target.value ? parseInt(e.target.value, 10) : null,
                        })
                      }
                      placeholder="SLA h"
                      title="SLA em horas (opcional)"
                      className="w-16 h-7 px-2 text-[11px] rounded-[4px] bg-white dark:bg-[#1A1D27] border border-black/[0.06] dark:border-white/[0.08] text-slate-700 dark:text-white/75 focus:outline-none focus:border-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => removeStage(i)}
                      aria-label="Remover etapa"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-slate-400 hover:text-red-600 hover:bg-red-50 dark:text-white/40 dark:hover:text-red-400 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-[6px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 px-3 py-2 text-[12px] text-red-700 dark:text-red-300">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="h-9 px-4 text-[13px] font-medium rounded-[6px] text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !name.trim()}
              className="h-9 px-4 text-[13px] font-semibold rounded-[6px] text-white bg-[#2563EB] hover:bg-[#1D4ED8] shadow-[0_1px_2px_rgba(37,99,235,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Criando..." : "Criar pipeline"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
