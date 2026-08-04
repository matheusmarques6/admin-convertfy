"use client"

/**
 * Definição da meta do período.
 *
 * Só o essencial: quanto e de que tipo. Escopo por pessoa e por
 * pipeline existe no banco, mas começar por meta de time evita o
 * formulário de seis campos que ninguém preenche — dá para abrir depois
 * sem quebrar nada.
 */

import { useEffect, useState } from "react"
import { Target } from "lucide-react"
import { parseBRNumber } from "@/lib/services/crm-deal-products"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type GoalType = "revenue_won" | "deals_won"

interface GoalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** YYYY-MM-DD — primeiro dia do período corrente. */
  periodStart: string
  periodType: "month" | "quarter" | "year"
  currentTarget: number | null
  currentType: GoalType
  /** Vendedores com atividade no período — habilita meta individual. */
  owners?: Array<{ id: string; name: string }>
  /** Metas individuais já definidas no período (pré-preenche ao trocar). */
  individualGoals?: Array<{ owner_id: string; goal_type: string; target_value: number }>
  onSaved: () => void
}

const PERIOD_LABEL: Record<string, string> = {
  month: "do mês",
  quarter: "do trimestre",
  year: "do ano",
}

export function GoalDialog({
  open,
  onOpenChange,
  periodStart,
  periodType,
  currentTarget,
  currentType,
  owners = [],
  individualGoals = [],
  onSaved,
}: GoalDialogProps) {
  const [goalType, setGoalType] = useState<GoalType>(currentType)
  const [value, setValue] = useState("")
  // "" = meta do time inteiro; uuid = meta individual do vendedor.
  const [ownerId, setOwnerId] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pré-preenche no formato BR (vírgula decimal) — o parse abaixo trata
  // ponto sem vírgula como MILHAR, então "150000.5" cru viraria 1500005.
  const toInputValue = (v: number | null | undefined) =>
    v == null ? "" : String(v).replace(".", ",")

  // Reabrir sempre reflete a meta vigente, não o que foi digitado antes.
  useEffect(() => {
    if (open) {
      setGoalType(currentType)
      setOwnerId("")
      setValue(currentTarget != null ? toInputValue(currentTarget) : "")
      setError(null)
    }
  }, [open, currentTarget, currentType])

  // Trocar o alvo (time <-> vendedor) pré-preenche com a meta vigente
  // daquele escopo — editar meta existente sem redigitar.
  const pickOwner = (id: string) => {
    setOwnerId(id)
    if (!id) {
      setValue(currentTarget != null ? toInputValue(currentTarget) : "")
      return
    }
    const existing = individualGoals.find((g) => g.owner_id === id)
    setValue(existing ? toInputValue(existing.target_value) : "")
    if (existing) setGoalType(existing.goal_type === "deals_won" ? "deals_won" : "revenue_won")
  }

  const parsed = parseBRNumber(value)
  const canSave = !saving && value.trim() !== "" && Number.isFinite(parsed) && parsed > 0

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/crm/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal_type: goalType,
          period_type: periodType,
          period_start: periodStart,
          target_value: parsed,
          owner_id: ownerId || null,
        }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: unknown } | null
        const raw = json?.error
        setError(
          (typeof raw === "string"
            ? raw
            : (raw as { message?: string } | undefined)?.message) ??
            "Não foi possível salvar a meta.",
        )
        return
      }
      onSaved()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const periodLabel = PERIOD_LABEL[periodType] ?? "do período"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon={Target} size={20} className="text-[#4E62D8] dark:text-[#7B8CEA]" />
            Meta {periodLabel}
          </DialogTitle>
          <DialogDescription>
            Define o alvo do período — do time inteiro ou de um vendedor. O painel
            mostra atingimento, ritmo necessário e projeção de fechamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {owners.length > 0 && (
            <div className="space-y-1.5">
              <label
                htmlFor="goal-owner"
                className="text-[11px] font-semibold uppercase tracking-[0.05em] text-gray-500 dark:text-[#8B92A5]"
              >
                Meta de
              </label>
              <select
                id="goal-owner"
                value={ownerId}
                onChange={(e) => pickOwner(e.target.value)}
                className="h-9 w-full cursor-pointer rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-gray-900 outline-none focus:border-[#4E62D8] dark:border-white/10 dark:bg-[#0F1117] dark:text-white"
              >
                <option value="">Time inteiro</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-gray-500 dark:text-[#8B92A5]">
              Medir por
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: "revenue_won" as const, label: "Receita", hint: "R$ fechado" },
                  { key: "deals_won" as const, label: "Quantidade", hint: "nº de vendas" },
                ]
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setGoalType(opt.key)}
                  aria-pressed={goalType === opt.key}
                  className={cn(
                    "rounded-[8px] border px-3 py-2 text-left transition-colors",
                    goalType === opt.key
                      ? "border-[#4E62D8] bg-[#EEF0FB] dark:border-[#7B8CEA] dark:bg-[#4E62D8]/15"
                      : "border-black/10 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/[0.04]",
                  )}
                >
                  <div className="text-[13px] font-semibold text-gray-900 dark:text-white">
                    {opt.label}
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-[#8B92A5]">
                    {opt.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="goal-target"
              className="text-[11px] font-semibold uppercase tracking-[0.05em] text-gray-500 dark:text-[#8B92A5]"
            >
              {goalType === "revenue_won" ? "Meta em R$" : "Meta em nº de vendas"}
            </label>
            <input
              id="goal-target"
              type="text"
              inputMode="decimal"
              autoFocus
              value={value}
              placeholder={goalType === "revenue_won" ? "150000" : "20"}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit()
              }}
              className="h-10 w-full rounded-[8px] border border-black/10 bg-white px-3 text-[15px] font-semibold text-gray-900 tabular-nums outline-none focus:border-[#4E62D8] dark:border-white/10 dark:bg-[#0F1117] dark:text-white"
            />
          </div>

          {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-9 items-center rounded-[6px] px-3 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-[#8B92A5] dark:hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSave}
            className="inline-flex h-9 items-center rounded-[6px] bg-[#4E62D8] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2137B6] disabled:opacity-40"
          >
            {saving ? "Salvando…" : "Salvar meta"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
