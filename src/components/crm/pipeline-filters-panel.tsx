"use client"

import { useMemo, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Check, X } from "lucide-react"
import type { PipelineFilters } from "./pipeline-filters-bar"

interface PipelineFiltersPanelProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  filters: PipelineFilters
  onFiltersChange: (next: PipelineFilters) => void
  /** Total de deals que correspondem aos filtros atuais (pra mostrar no botão "Aplicar (N)"). */
  matchingCount?: number
  availableTags: string[]
  availableSources: string[]
  availableOwners: Array<{ id: string; name: string }>
  /** Contagens opcionais por valor — pra mostrar "(N)" ao lado das opcoes. */
  countsByTag?: Record<string, number>
  countsBySource?: Record<string, number>
  countsByOwner?: Record<string, number>
  countsByStatus?: Record<string, number>
}

/**
 * Painel lateral de filtros (artboard 03 do prototipo Convertfy V2).
 * Estrutura:
 *   - Header: "Filtros" + "X ativos · N deals correspondem" + close
 *   - Chips ativos no topo (com X pra remover) + "Limpar tudo"
 *   - Sections: Responsável, Origem, Tags, Status (checkboxes + count)
 *   - Slider de Valor mensal (range)
 *   - Footer: "Salvar filtro" (secondary) + "Aplicar (N)" (primary)
 *
 * Aplica live (cada mudanca chama onFiltersChange). O botao Aplicar
 * apenas fecha o painel — nao precisa de commit explicito.
 */
export function PipelineFiltersPanel({
  open,
  onOpenChange,
  filters,
  onFiltersChange,
  matchingCount,
  availableTags,
  availableSources,
  availableOwners,
  countsByTag,
  countsBySource,
  countsByOwner,
  countsByStatus,
}: PipelineFiltersPanelProps) {
  const activeCount = useMemo(() => {
    let n = 0
    if (filters.tags.length) n++
    if (filters.owners.length) n++
    if (filters.statuses.length) n++
    if (filters.sources.length) n++
    if (filters.valueMin != null || filters.valueMax != null) n++
    if (filters.createdFrom || filters.createdTo) n++
    return n
  }, [filters])

  const toggleArr = (
    arr: string[],
    value: string,
    setter: (next: string[]) => void,
  ) => {
    if (arr.includes(value)) setter(arr.filter((x) => x !== value))
    else setter([...arr, value])
  }

  // Chips ativos com label + handler de remocao
  const chips = useMemo(() => {
    const list: Array<{ key: string; label: string; clear: () => void }> = []
    if (filters.sources.length) {
      list.push({
        key: "source",
        label: `Origem: ${filters.sources.join(", ")}`,
        clear: () => onFiltersChange({ ...filters, sources: [] }),
      })
    }
    if (filters.owners.length) {
      const names = filters.owners
        .map((id) => availableOwners.find((o) => o.id === id)?.name ?? id)
        .join(", ")
      list.push({
        key: "owner",
        label: `Resp.: ${names}`,
        clear: () => onFiltersChange({ ...filters, owners: [] }),
      })
    }
    if (filters.tags.length) {
      list.push({
        key: "tags",
        label: `Tags: ${filters.tags.join(", ")}`,
        clear: () => onFiltersChange({ ...filters, tags: [] }),
      })
    }
    if (filters.statuses.length) {
      list.push({
        key: "status",
        label: `Status: ${filters.statuses.join(", ")}`,
        clear: () => onFiltersChange({ ...filters, statuses: [] }),
      })
    }
    if (filters.valueMin != null || filters.valueMax != null) {
      const min = filters.valueMin != null
        ? `R$ ${(filters.valueMin / 1000).toFixed(0)}k`
        : "R$ 0"
      const max = filters.valueMax != null
        ? `R$ ${(filters.valueMax / 1000).toFixed(0)}k`
        : "R$ 10k+"
      list.push({
        key: "value",
        label: `Valor: ${min}–${max}/mês`,
        clear: () =>
          onFiltersChange({ ...filters, valueMin: null, valueMax: null }),
      })
    }
    return list
  }, [filters, onFiltersChange, availableOwners])

  const clearAll = () =>
    onFiltersChange({
      tags: [],
      owners: [],
      statuses: [],
      sources: [],
      lostReasons: [],
      valueMin: null,
      valueMax: null,
      createdFrom: null,
      createdTo: null,
      movedFrom: null,
      movedTo: null,
    })

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
          style={{ background: "rgba(15, 17, 23, 0.32)" }}
        />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
          style={{
            width: "var(--crm-filter-panel-width)",
            maxWidth: "100vw",
            background: "var(--crm-gray-0)",
            borderLeft: "1px solid var(--crm-border)",
            boxShadow: "var(--crm-shadow-drawer)",
            fontFamily: "var(--crm-font-sans)",
            animationDuration: "220ms",
          }}
        >
          <DialogPrimitive.Title className="sr-only">Filtros</DialogPrimitive.Title>

          {/* Header */}
          <div
            className="flex items-center justify-between"
            style={{
              padding: "18px 24px",
              borderBottom: "1px solid var(--crm-border)",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--crm-gray-900)",
                }}
              >
                Filtros
              </h2>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--crm-gray-500)",
                  marginTop: 2,
                }}
              >
                {activeCount} {activeCount === 1 ? "ativo" : "ativos"}
                {typeof matchingCount === "number" && (
                  <>
                    {" · "}
                    <span className="crm-tnum">{matchingCount}</span>{" "}
                    {matchingCount === 1 ? "deal corresponde" : "deals correspondem"}
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="cf-focusable flex items-center justify-center"
              style={{
                width: 30,
                height: 30,
                border: 0,
                background: "transparent",
                color: "var(--crm-gray-500)",
                borderRadius: 6,
                cursor: "pointer",
              }}
              aria-label="Fechar painel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body scroll */}
          <div className="flex-1 overflow-y-auto" style={{ padding: "20px 24px" }}>
            {/* Chips ativos */}
            {chips.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <SectionLabel>Ativos</SectionLabel>
                <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>
                  {chips.map((c) => (
                    <span
                      key={c.key}
                      className="inline-flex items-center gap-1.5"
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: "var(--crm-blue-50)",
                        border: "1px solid var(--crm-blue-100)",
                        fontSize: 11,
                        color: "var(--crm-brand)",
                        fontWeight: 500,
                      }}
                    >
                      {c.label}
                      <button
                        onClick={c.clear}
                        style={{
                          background: "transparent",
                          border: 0,
                          color: "var(--crm-brand)",
                          padding: 0,
                          display: "flex",
                          cursor: "pointer",
                        }}
                        aria-label={`Limpar ${c.key}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <button
                    onClick={clearAll}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px dashed var(--crm-gray-300)",
                      background: "transparent",
                      color: "var(--crm-gray-500)",
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Limpar tudo
                  </button>
                </div>
              </div>
            )}

            {/* Responsavel */}
            <FilterSection
              title="Responsável"
              onClear={
                filters.owners.length > 0
                  ? () => onFiltersChange({ ...filters, owners: [] })
                  : undefined
              }
            >
              {availableOwners.length === 0 ? (
                <EmptyHint>Nenhum responsável.</EmptyHint>
              ) : (
                availableOwners.map((o) => (
                  <CheckRow
                    key={o.id}
                    label={o.name}
                    count={countsByOwner?.[o.id]}
                    active={filters.owners.includes(o.id)}
                    onChange={() =>
                      toggleArr(filters.owners, o.id, (next) =>
                        onFiltersChange({ ...filters, owners: next }),
                      )
                    }
                  />
                ))
              )}
            </FilterSection>

            {/* Origem */}
            <FilterSection
              title="Origem"
              onClear={
                filters.sources.length > 0
                  ? () => onFiltersChange({ ...filters, sources: [] })
                  : undefined
              }
            >
              {availableSources.length === 0 ? (
                <EmptyHint>Nenhuma origem registrada.</EmptyHint>
              ) : (
                availableSources.map((s) => (
                  <CheckRow
                    key={s}
                    label={s}
                    count={countsBySource?.[s]}
                    active={filters.sources.includes(s)}
                    onChange={() =>
                      toggleArr(filters.sources, s, (next) =>
                        onFiltersChange({ ...filters, sources: next }),
                      )
                    }
                  />
                ))
              )}
            </FilterSection>

            {/* Tags */}
            <FilterSection
              title="Tags"
              onClear={
                filters.tags.length > 0
                  ? () => onFiltersChange({ ...filters, tags: [] })
                  : undefined
              }
            >
              {availableTags.length === 0 ? (
                <EmptyHint>Nenhuma tag em uso.</EmptyHint>
              ) : (
                availableTags.map((t) => (
                  <CheckRow
                    key={t}
                    label={t}
                    count={countsByTag?.[t]}
                    active={filters.tags.includes(t)}
                    onChange={() =>
                      toggleArr(filters.tags, t, (next) =>
                        onFiltersChange({ ...filters, tags: next }),
                      )
                    }
                  />
                ))
              )}
            </FilterSection>

            {/* Status */}
            <FilterSection
              title="Status"
              onClear={
                filters.statuses.length > 0
                  ? () => onFiltersChange({ ...filters, statuses: [] })
                  : undefined
              }
            >
              {(["open", "won", "lost", "archived"] as const).map((s) => (
                <CheckRow
                  key={s}
                  label={
                    s === "open"
                      ? "Aberto"
                      : s === "won"
                        ? "Ganho"
                        : s === "lost"
                          ? "Perdido"
                          : "Arquivado"
                  }
                  count={countsByStatus?.[s]}
                  active={filters.statuses.includes(s)}
                  onChange={() =>
                    toggleArr(filters.statuses, s, (next) =>
                      onFiltersChange({ ...filters, statuses: next }),
                    )
                  }
                />
              ))}
            </FilterSection>

            {/* Valor mensal (slider) */}
            <ValueRangeSection
              min={filters.valueMin}
              max={filters.valueMax}
              onChange={(min, max) =>
                onFiltersChange({ ...filters, valueMin: min, valueMax: max })
              }
            />
          </div>

          {/* Footer */}
          <div
            className="flex justify-between gap-2"
            style={{
              padding: "14px 24px",
              borderTop: "1px solid var(--crm-border)",
            }}
          >
            <button
              onClick={clearAll}
              className="crm-button-ghost"
              style={{ minWidth: 120 }}
            >
              Limpar tudo
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="crm-button-primary"
              style={{ minWidth: 140 }}
            >
              Aplicar{typeof matchingCount === "number" ? ` (${matchingCount})` : ""}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: "var(--crm-gray-500)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  )
}

function FilterSection({
  title,
  onClear,
  children,
}: {
  title: string
  onClear?: () => void
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--crm-gray-700)",
          }}
        >
          {title}
        </div>
        {onClear && (
          <button
            onClick={onClear}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--crm-brand)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Limpar
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

function CheckRow({
  label,
  count,
  active,
  onChange,
}: {
  label: string
  count?: number
  active: boolean
  onChange: () => void
}) {
  return (
    <label
      className="flex items-center gap-2.5 cursor-pointer"
      style={{
        padding: "7px 8px",
        borderRadius: 6,
        background: active ? "var(--crm-blue-50)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--crm-gray-50)"
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent"
      }}
    >
      <input
        type="checkbox"
        checked={active}
        onChange={onChange}
        style={{ display: "none" }}
      />
      <span
        aria-hidden
        className="flex items-center justify-center shrink-0"
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          background: active ? "var(--crm-brand)" : "transparent",
          border: `1.5px solid ${active ? "var(--crm-brand)" : "var(--crm-gray-300)"}`,
          color: "#fff",
        }}
      >
        {active && <Check className="h-2.5 w-2.5" />}
      </span>
      <span
        className="flex-1 truncate"
        style={{
          fontSize: 13,
          color: active ? "var(--crm-brand)" : "var(--crm-gray-700)",
          fontWeight: active ? 500 : 400,
        }}
      >
        {label}
      </span>
      {typeof count === "number" && (
        <span
          className="crm-tnum"
          style={{
            fontSize: 11,
            color: "var(--crm-gray-400)",
            fontWeight: 500,
          }}
        >
          {count}
        </span>
      )}
    </label>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        color: "var(--crm-gray-400)",
        padding: "8px 4px",
      }}
    >
      {children}
    </div>
  )
}

// ─── Slider de valor ────────────────────────────────────────────

const VALUE_CAP = 10_000

function ValueRangeSection({
  min,
  max,
  onChange,
}: {
  min: number | null
  max: number | null
  onChange: (min: number | null, max: number | null) => void
}) {
  const [minVal, setMinVal] = useState<number>(min ?? 0)
  const [maxVal, setMaxVal] = useState<number>(max ?? VALUE_CAP)

  const minPct = (minVal / VALUE_CAP) * 100
  const maxPct = Math.min(100, (maxVal / VALUE_CAP) * 100)

  const fmtBRL = (v: number) =>
    v >= 1000 ? `R$ ${Math.round(v / 1000)}k` : `R$ ${v}`

  return (
    <div style={{ marginBottom: 22 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--crm-gray-700)",
          }}
        >
          Valor mensal
        </div>
        <span
          className="crm-tnum"
          style={{ fontSize: 11, color: "var(--crm-gray-500)" }}
        >
          {fmtBRL(minVal)}–{fmtBRL(maxVal)}
          {maxVal === VALUE_CAP && "+"}
        </span>
      </div>
      <div
        className="relative"
        style={{
          height: 6,
          background: "var(--crm-gray-100)",
          borderRadius: 3,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${minPct}%`,
            right: `${100 - maxPct}%`,
            top: 0,
            bottom: 0,
            background: "var(--crm-brand)",
            borderRadius: 3,
          }}
        />
      </div>
      <div className="flex gap-2" style={{ marginTop: 10 }}>
        <RangeInput
          label="Mín"
          value={minVal}
          onChange={(v) => {
            const clamped = Math.max(0, Math.min(v, maxVal - 100))
            setMinVal(clamped)
            onChange(clamped === 0 ? null : clamped, max)
          }}
        />
        <RangeInput
          label="Máx"
          value={maxVal}
          onChange={(v) => {
            const clamped = Math.max(minVal + 100, Math.min(v, VALUE_CAP))
            setMaxVal(clamped)
            onChange(min, clamped === VALUE_CAP ? null : clamped)
          }}
        />
      </div>
    </div>
  )
}

function RangeInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex-1 flex items-center gap-2">
      <span
        style={{
          fontSize: 11,
          color: "var(--crm-gray-500)",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={0}
        step={100}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className="crm-input flex-1"
        style={{ height: 28, fontSize: 12 }}
      />
    </label>
  )
}
