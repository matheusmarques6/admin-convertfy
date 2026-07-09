"use client"

/**
 * Editor inline do relatório mensal — envolve o deck de slides e permite
 * editar os números direto no preview (botão "Editar números").
 *
 * Arquitetura (mesmo espírito do weekly-report-view):
 *  - O snapshot cru NUNCA é mutado. O draft (Map path→valor) sobrepõe os
 *    overrides salvos; a cada tecla recomputamos o snapshot MERGED e o
 *    passamos ao ReportSlides — todos os textos/gráficos derivados
 *    (donut, intros, funil) atualizam ao vivo de graça.
 *  - Salvar faz diff (valor == original → null = restaura) e PATCHa só o
 *    que mudou. Cancelar descarta o draft.
 */

import { useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { ReportSlides } from "@/components/stores/v2/slides/report-slides"
import {
  ReportEditContext,
  type ReportEditCtx,
} from "@/components/stores/v2/slides/report-edit-context"
import {
  applyKpisOverrides,
  mergeKpisOverrides,
} from "@/lib/services/report-overrides.service"
import type {
  ReportSnapshot,
  ReportKpisOverrides,
  ReportKpisOverridesPatch,
} from "@/types/monthly-report"

type DraftValue = number | string | null
type Draft = Map<string, DraftValue>

interface Props {
  reportId: string
  snapshot: ReportSnapshot
  overrides: ReportKpisOverrides
  proximosPassos: string | null
  monthLabel: string
  editedAt?: string | null
}

// ── path helpers ─────────────────────────────────────────────────────────

function flatToPatch(draft: Draft): ReportKpisOverridesPatch {
  const patch: ReportKpisOverridesPatch = {}
  for (const [path, value] of draft) {
    const parts = path.split(".")
    if (parts[0] === "kpis" || parts[0] === "email") {
      const branch = (patch[parts[0]] ??= {}) as Record<string, DraftValue>
      branch[parts[1]] = value
    } else if (parts[0] === "campaigns" || parts[0] === "flows") {
      const branch = (patch[parts[0]] ??= {}) as Record<string, Record<string, DraftValue>>
      const row = (branch[parts[1]] ??= {})
      row[parts[2]] = value
    }
  }
  return patch
}

function getOriginal(snapshot: ReportSnapshot, path: string): number | string | null {
  const parts = path.split(".")
  if (parts[0] === "kpis") return (snapshot.kpis as Record<string, number | null> | undefined)?.[parts[1]] ?? null
  if (parts[0] === "email") return (snapshot.email as Record<string, number | null> | undefined)?.[parts[1]] ?? null
  if (parts[0] === "campaigns" || parts[0] === "flows") {
    const row = snapshot[parts[0]]?.find((r) => r.id === parts[1])
    return (row as Record<string, number | string> | undefined)?.[parts[2]] ?? null
  }
  return null
}

export function ReportSlidesEditor({
  reportId,
  snapshot,
  overrides,
  proximosPassos,
  monthLabel,
}: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>(new Map())
  // Moeda escolhida na sessão de edição (null = sem mudança nesta sessão).
  const [currencyDraft, setCurrencyDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const snapshotCurrency =
    (snapshot.account?.currency as string | undefined) ?? "BRL"
  // Escolher a moeda ORIGINAL do snapshot = restaurar (null no patch).
  const currencyPatchValue =
    currencyDraft === null
      ? undefined
      : currencyDraft === snapshotCurrency
        ? null
        : currencyDraft
  const currencyChanged =
    currencyDraft !== null &&
    currencyDraft !== (overrides.currency ?? snapshotCurrency)

  // Overrides efetivos: salvos + draft (draft null remove). mergeKpisOverrides
  // já trata null-removal e produz um ReportKpisOverrides limpo.
  const effectiveOverrides = useMemo(() => {
    if (!editing) return overrides
    const patch = flatToPatch(draft)
    if (currencyPatchValue !== undefined) patch.currency = currencyPatchValue
    return mergeKpisOverrides(overrides, patch)
  }, [editing, overrides, draft, currencyPatchValue])
  const { snapshot: merged, overriddenPaths } = useMemo(
    () => applyKpisOverrides(snapshot, effectiveOverrides),
    [snapshot, effectiveOverrides],
  )
  const overriddenSet = useMemo(() => new Set(overriddenPaths), [overriddenPaths])

  const setValue = useCallback((path: string, value: number | string) => {
    setDraft((prev) => {
      const next = new Map(prev)
      next.set(path, value)
      return next
    })
  }, [])

  // Restaurar campo. Em edição: marca null no draft (preview volta ao
  // original). Fora de edição: PATCH imediato + refresh.
  const resetField = useCallback(
    async (path: string) => {
      if (editing) {
        setDraft((prev) => {
          const next = new Map(prev)
          next.set(path, null)
          return next
        })
        return
      }
      await fetch(`/api/admin/stores/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kpis_overrides: flatToPatch(new Map([[path, null]])) }),
      })
      router.refresh()
    },
    [editing, reportId, router],
  )

  // Moeda MERGED (override/draft aplicados) — inputs de currency coerentes
  // com o que os slides mostram.
  const mergedCurrency =
    (merged.account?.currency as string | undefined) ?? "BRL"

  const ctx: ReportEditCtx = useMemo(
    () => ({
      editing,
      getDraft: (path) => draft.get(path),
      setValue,
      resetField,
      isOverridden: (path) => overriddenSet.has(path),
      currency: mergedCurrency,
    }),
    [editing, draft, setValue, resetField, overriddenSet, mergedCurrency],
  )

  const startEditing = useCallback(() => {
    setDraft(new Map())
    setCurrencyDraft(null)
    setEditing(true)
  }, [])

  const cancelEditing = useCallback(() => {
    setDraft(new Map())
    setCurrencyDraft(null)
    setEditing(false)
  }, [])

  const submitEdits = useCallback(async () => {
    // Diff: valor igual ao original do snapshot → null (restaura, não grava
    // override redundante). null explícito no draft (restaurar) também vai.
    const toSend = new Map<string, DraftValue>()
    for (const [path, value] of draft) {
      if (value === null) {
        toSend.set(path, null)
        continue
      }
      const original = getOriginal(snapshot, path)
      const equal =
        typeof value === "number" && typeof original === "number"
          ? Math.abs(value - original) < 1e-9
          : value === original
      toSend.set(path, equal ? null : value)
    }
    const patch = flatToPatch(toSend)
    if (currencyPatchValue !== undefined) patch.currency = currencyPatchValue
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/stores/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kpis_overrides: patch }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(`Erro ao salvar edições: ${j?.error ?? res.status}`)
        return
      }
      setEditing(false)
      setDraft(new Map())
      router.refresh()
    } finally {
      setSaving(false)
    }
  }, [draft, snapshot, reportId, router, currencyPatchValue])

  const changedCount = draft.size + (currencyChanged ? 1 : 0)

  const CURRENCY_OPTIONS = ["BRL", "USD", "EUR", "GBP", "MXN", "CAD", "AUD"]
  const displayCurrency = editing ? mergedCurrency : (overrides.currency ?? snapshotCurrency)

  const handleCurrencySelect = (value: string) => {
    if (value === "__other__") {
      const raw = window.prompt(
        "Código da moeda (3 letras, ISO 4217 — ex.: CHF, JPY, ARS):",
        displayCurrency,
      )
      if (!raw) return
      const code = raw.trim().toUpperCase()
      if (!/^[A-Z]{3}$/.test(code)) {
        alert("Código inválido — use exatamente 3 letras (ex.: USD).")
        return
      }
      setCurrencyDraft(code)
      return
    }
    setCurrencyDraft(value)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Barra de edição */}
      <div
        className="flex items-center justify-between gap-3 flex-wrap rounded-[8px] px-3 py-2"
        style={{
          background: editing ? "#FFFBEB" : "rgba(255,255,255,0.06)",
          border: editing ? "1px solid #FDE68A" : "1px solid rgba(255,255,255,0.10)",
        }}
      >
        {editing ? (
          <>
            <span className="text-[12px] font-semibold" style={{ color: "#92400E" }}>
              Modo edição · {changedCount} {changedCount === 1 ? "campo alterado" : "campos alterados"}
              <span className="font-normal"> — clique nos números para editar</span>
            </span>
            <div className="flex items-center gap-2">
              <label
                className="flex items-center gap-1.5 text-[12px] font-medium"
                style={{ color: "#92400E" }}
              >
                Moeda:
                <select
                  value={displayCurrency}
                  onChange={(e) => handleCurrencySelect(e.target.value)}
                  disabled={saving}
                  className="rounded-[6px] px-1.5 py-1 text-[12px] font-semibold"
                  style={{ border: "1px solid #FDE68A", background: "#fff", color: "#92400E" }}
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                      {c === snapshotCurrency ? " (original)" : ""}
                    </option>
                  ))}
                  {!CURRENCY_OPTIONS.includes(displayCurrency) && (
                    <option value={displayCurrency}>{displayCurrency}</option>
                  )}
                  <option value="__other__">Outra…</option>
                </select>
              </label>
              <button
                onClick={cancelEditing}
                disabled={saving}
                className="text-[12px] font-medium px-3 py-1 rounded-[6px] disabled:opacity-50"
                style={{ color: "#92400E", background: "transparent", border: "1px solid #FDE68A" }}
              >
                Cancelar
              </button>
              <button
                onClick={submitEdits}
                disabled={saving || changedCount === 0}
                className="text-[12px] font-semibold px-3 py-1 rounded-[6px] text-white disabled:opacity-50"
                style={{ background: "#D97706" }}
              >
                {saving ? "Salvando…" : "Salvar edições"}
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.6)" }}>
              {overriddenSet.size > 0
                ? `${overriddenSet.size} ${overriddenSet.size === 1 ? "campo editado manualmente" : "campos editados manualmente"}`
                : "Ajuste manual dos números do relatório"}
              {overrides.currency ? ` · moeda: ${overrides.currency} (editada)` : ""}
            </span>
            <button
              onClick={startEditing}
              className="text-[12px] font-semibold px-3 py-1 rounded-[6px]"
              style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}
            >
              Editar números
            </button>
          </>
        )}
      </div>

      <ReportEditContext.Provider value={ctx}>
        <ReportSlides snapshot={merged} proximosPassos={proximosPassos} monthLabel={monthLabel} />
      </ReportEditContext.Provider>
    </div>
  )
}
