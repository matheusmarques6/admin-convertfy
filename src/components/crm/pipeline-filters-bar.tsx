"use client"

/**
 * PipelineFiltersBar — popovers de "Filtros" + "Ordenacao" pro pipeline.
 * Aplica filtros no array de deals e expoe setters pro consumidor.
 *
 * UX: 2 botoes lado a lado no header do pipeline. Cada um abre um
 * popover ancorado. "Filtros" tem secoes expansiveis (Tags, Atendente,
 * Status, Origem, Motivo de perda, Valor min/max, Data de criacao,
 * Data de movimentacao) com Aplicar/Limpar no rodape. "Ordenacao" e uma
 * lista simples de 4 opcoes radio.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Filter,
  ArrowUpDown,
  ChevronRight,
  X,
  Check,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type SortOrder =
  | "created_desc"
  | "created_asc"
  | "moved_desc"
  | "moved_asc"

export interface PipelineFilters {
  tags: string[]
  owners: string[]
  statuses: string[] // open | won | lost
  sources: string[]
  lostReasons: string[]
  valueMin: number | null
  valueMax: number | null
  createdFrom: string | null // ISO date YYYY-MM-DD
  createdTo: string | null
  movedFrom: string | null
  movedTo: string | null
}

export const EMPTY_FILTERS: PipelineFilters = {
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
}

interface PipelineFiltersBarProps {
  filters: PipelineFilters
  onFiltersChange: (next: PipelineFilters) => void
  sort: SortOrder
  onSortChange: (next: SortOrder) => void
  /** Opcoes computadas do conjunto de deals atual. */
  availableTags: string[]
  availableSources: string[]
  availableOwners: Array<{ id: string; name: string }>
  availableLostReasons: string[]
}

function countActiveFilters(f: PipelineFilters): number {
  let n = 0
  if (f.tags.length) n++
  if (f.owners.length) n++
  if (f.statuses.length) n++
  if (f.sources.length) n++
  if (f.lostReasons.length) n++
  if (f.valueMin != null) n++
  if (f.valueMax != null) n++
  if (f.createdFrom || f.createdTo) n++
  if (f.movedFrom || f.movedTo) n++
  return n
}

const SORT_OPTIONS: Array<{ id: SortOrder; label: string }> = [
  { id: "created_desc", label: "Mais recentes" },
  { id: "created_asc", label: "Mais antigos" },
  { id: "moved_desc", label: "Movidos recentemente" },
  { id: "moved_asc", label: "Movidos há mais tempo" },
]

export function PipelineFiltersBar({
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  availableTags,
  availableSources,
  availableOwners,
  availableLostReasons,
}: PipelineFiltersBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const filtersRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)

  // Estado local do popover de filtros (so aplica ao clicar Aplicar)
  const [draft, setDraft] = useState<PipelineFilters>(filters)
  useEffect(() => {
    setDraft(filters)
  }, [filters])

  const activeCount = useMemo(() => countActiveFilters(filters), [filters])

  // Fecha popovers ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        filtersOpen &&
        filtersRef.current &&
        !filtersRef.current.contains(e.target as Node)
      ) {
        setFiltersOpen(false)
        setDraft(filters) // reset draft se fechou sem aplicar
      }
      if (
        sortOpen &&
        sortRef.current &&
        !sortRef.current.contains(e.target as Node)
      ) {
        setSortOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [filtersOpen, sortOpen, filters])

  return (
    <div className="flex items-center gap-2">
      {/* Filtros */}
      <div className="relative" ref={filtersRef}>
        <button
          onClick={() => {
            setFiltersOpen(!filtersOpen)
            setSortOpen(false)
          }}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border text-[12px] font-medium transition-colors",
            activeCount > 0
              ? "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:border-brand-500/20"
              : "bg-white dark:bg-white/[0.04] text-slate-700 dark:text-white/80 border-black/[0.06] dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.06]",
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Filtros
          {activeCount > 0 && (
            <span className="ml-0.5 h-4 min-w-4 px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
        {filtersOpen && (
          <FiltersPopover
            draft={draft}
            setDraft={setDraft}
            availableTags={availableTags}
            availableSources={availableSources}
            availableOwners={availableOwners}
            availableLostReasons={availableLostReasons}
            onApply={() => {
              onFiltersChange(draft)
              setFiltersOpen(false)
            }}
            onClear={() => {
              setDraft(EMPTY_FILTERS)
              onFiltersChange(EMPTY_FILTERS)
              setFiltersOpen(false)
            }}
          />
        )}
      </div>

      {/* Ordenacao */}
      <div className="relative" ref={sortRef}>
        <button
          onClick={() => {
            setSortOpen(!sortOpen)
            setFiltersOpen(false)
          }}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border text-[12px] font-medium transition-colors bg-white dark:bg-white/[0.04] text-slate-700 dark:text-white/80 border-black/[0.06] dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.06]"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          Ordenação
        </button>
        {sortOpen && (
          <div
            className="absolute top-full right-0 mt-1.5 z-30 w-[260px] rounded-[10px] border bg-white dark:bg-[#1A1D27] shadow-xl py-2"
            style={{ borderColor: "rgba(0,0,0,0.08)" }}
          >
            <div className="px-3 pb-1.5 mb-1 border-b flex items-center gap-1.5" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
              <ArrowUpDown className="h-4 w-4 text-slate-700 dark:text-white/80" />
              <span className="text-[13px] font-bold text-slate-900 dark:text-white">
                Ordenação
              </span>
            </div>
            {SORT_OPTIONS.map((opt) => {
              const active = sort === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => {
                    onSortChange(opt.id)
                    setSortOpen(false)
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-[12.5px] flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-white/[0.04]",
                    active ? "text-slate-900 dark:text-white font-semibold" : "text-slate-700 dark:text-white/80",
                  )}
                >
                  <span className="inline-flex items-center gap-2">
                    <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                    {opt.label}
                  </span>
                  {active && <Check className="h-4 w-4 text-brand-600" />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── FiltersPopover ──────────────────────────────────────────────────────────

function FiltersPopover({
  draft,
  setDraft,
  availableTags,
  availableSources,
  availableOwners,
  availableLostReasons,
  onApply,
  onClear,
}: {
  draft: PipelineFilters
  setDraft: (next: PipelineFilters) => void
  availableTags: string[]
  availableSources: string[]
  availableOwners: Array<{ id: string; name: string }>
  availableLostReasons: string[]
  onApply: () => void
  onClear: () => void
}) {
  return (
    <div
      className="absolute top-full left-0 mt-1.5 z-30 w-[360px] max-h-[80vh] rounded-[10px] border bg-white dark:bg-[#1A1D27] shadow-2xl flex flex-col"
      style={{ borderColor: "rgba(0,0,0,0.08)" }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 border-b flex items-center gap-2"
        style={{ borderColor: "rgba(0,0,0,0.06)" }}
      >
        <Filter className="h-4 w-4 text-slate-700 dark:text-white/80" />
        <span className="text-[14px] font-bold text-slate-900 dark:text-white">
          Filtros
        </span>
      </div>

      {/* Sections (scroll) */}
      <div className="flex-1 overflow-y-auto py-1">
        <FilterSection
          title="Tags"
          countSelected={draft.tags.length}
        >
          <MultiSelectList
            options={availableTags.map((t) => ({ value: t, label: t }))}
            selected={draft.tags}
            onChange={(next) => setDraft({ ...draft, tags: next })}
            emptyMsg="Nenhuma tag em uso."
          />
        </FilterSection>

        <FilterSection
          title="Atendente"
          countSelected={draft.owners.length}
        >
          <MultiSelectList
            options={availableOwners.map((o) => ({ value: o.id, label: o.name }))}
            selected={draft.owners}
            onChange={(next) => setDraft({ ...draft, owners: next })}
            emptyMsg="Nenhum responsável."
          />
        </FilterSection>

        <FilterSection
          title="Status"
          countSelected={draft.statuses.length}
        >
          <MultiSelectList
            options={[
              { value: "open", label: "Aberto" },
              { value: "won", label: "Ganho" },
              { value: "lost", label: "Perdido" },
              { value: "archived", label: "Arquivado" },
            ]}
            selected={draft.statuses}
            onChange={(next) => setDraft({ ...draft, statuses: next })}
            emptyMsg=""
          />
        </FilterSection>

        <FilterSection
          title="Data de criação"
          countSelected={
            (draft.createdFrom ? 1 : 0) + (draft.createdTo ? 1 : 0)
          }
        >
          <DateRangeInputs
            from={draft.createdFrom}
            to={draft.createdTo}
            onChange={(from, to) =>
              setDraft({ ...draft, createdFrom: from, createdTo: to })
            }
          />
        </FilterSection>

        <FilterSection
          title="Data de movimentação"
          countSelected={
            (draft.movedFrom ? 1 : 0) + (draft.movedTo ? 1 : 0)
          }
        >
          <DateRangeInputs
            from={draft.movedFrom}
            to={draft.movedTo}
            onChange={(from, to) =>
              setDraft({ ...draft, movedFrom: from, movedTo: to })
            }
          />
        </FilterSection>

        <FilterSection
          title="Origem"
          countSelected={draft.sources.length}
        >
          <MultiSelectList
            options={availableSources.map((s) => ({ value: s, label: s }))}
            selected={draft.sources}
            onChange={(next) => setDraft({ ...draft, sources: next })}
            emptyMsg="Nenhuma origem registrada."
          />
        </FilterSection>

        <FilterSection
          title="Motivo de perda"
          countSelected={draft.lostReasons.length}
        >
          <MultiSelectList
            options={availableLostReasons.map((r) => ({ value: r, label: r }))}
            selected={draft.lostReasons}
            onChange={(next) => setDraft({ ...draft, lostReasons: next })}
            emptyMsg="Sem deals perdidos com motivo registrado."
          />
        </FilterSection>

        <FilterSection
          title="Valor mínimo"
          countSelected={draft.valueMin != null ? 1 : 0}
        >
          <input
            type="number"
            min={0}
            placeholder="0,00"
            value={draft.valueMin ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                valueMin: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="w-full h-8 rounded-[6px] px-2 text-[12.5px] border outline-none focus:border-brand-500"
            style={{ borderColor: "rgba(0,0,0,0.08)" }}
          />
        </FilterSection>

        <FilterSection
          title="Valor máximo"
          countSelected={draft.valueMax != null ? 1 : 0}
        >
          <input
            type="number"
            min={0}
            placeholder="0,00"
            value={draft.valueMax ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                valueMax: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="w-full h-8 rounded-[6px] px-2 text-[12.5px] border outline-none focus:border-brand-500"
            style={{ borderColor: "rgba(0,0,0,0.08)" }}
          />
        </FilterSection>
      </div>

      {/* Footer */}
      <div
        className="px-4 py-3 border-t flex items-center gap-2"
        style={{ borderColor: "rgba(0,0,0,0.06)" }}
      >
        <button
          onClick={onClear}
          className="flex-1 h-9 rounded-[6px] border text-[12.5px] font-semibold text-slate-700 dark:text-white/80 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
          style={{ borderColor: "rgba(0,0,0,0.10)" }}
        >
          Limpar filtros
        </button>
        <button
          onClick={onApply}
          className="flex-1 h-9 rounded-[6px] text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          Aplicar filtros
        </button>
      </div>
    </div>
  )
}

function FilterSection({
  title,
  countSelected,
  children,
}: {
  title: string
  countSelected: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors"
      >
        <span className="inline-flex items-center gap-2">
          <span
            className={cn(
              "h-4 w-4 rounded-full border flex items-center justify-center text-[12px] leading-none",
              countSelected > 0
                ? "border-brand-500 bg-brand-50 text-brand-600"
                : "border-slate-300 text-slate-400",
            )}
          >
            {countSelected > 0 ? countSelected : "+"}
          </span>
          <span className="text-[13px] font-medium text-slate-900 dark:text-white/90">
            {title}
          </span>
        </span>
        <ChevronRight
          className={cn(
            "h-4 w-4 text-slate-400 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open && <div className="px-4 pb-3 pt-1">{children}</div>}
    </div>
  )
}

function MultiSelectList({
  options,
  selected,
  onChange,
  emptyMsg,
}: {
  options: Array<{ value: string; label: string }>
  selected: string[]
  onChange: (next: string[]) => void
  emptyMsg: string
}) {
  if (options.length === 0) {
    return (
      <div className="text-[11.5px] italic text-slate-400 dark:text-white/40 py-1">
        {emptyMsg || "Sem opções disponíveis."}
      </div>
    )
  }
  const toggle = (v: string) => {
    if (selected.includes(v)) onChange(selected.filter((s) => s !== v))
    else onChange([...selected, v])
  }
  return (
    <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto">
      {options.map((o) => {
        const active = selected.includes(o.value)
        return (
          <button
            key={o.value}
            onClick={() => toggle(o.value)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11.5px] font-medium border transition-colors",
              active
                ? "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:border-brand-500/20"
                : "bg-white dark:bg-white/[0.03] text-slate-700 dark:text-white/75 border-slate-200 dark:border-white/[0.08] hover:bg-slate-50",
            )}
          >
            {active && <Check className="h-3 w-3" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function DateRangeInputs({
  from,
  to,
  onChange,
}: {
  from: string | null
  to: string | null
  onChange: (from: string | null, to: string | null) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <label className="block text-[10.5px] text-slate-400 dark:text-white/40 mb-1 font-medium uppercase tracking-wider">
          De
        </label>
        <input
          type="date"
          value={from ?? ""}
          onChange={(e) => onChange(e.target.value || null, to)}
          className="w-full h-8 rounded-[6px] px-2 text-[12px] border outline-none focus:border-brand-500"
          style={{ borderColor: "rgba(0,0,0,0.08)" }}
        />
      </div>
      <div className="flex-1">
        <label className="block text-[10.5px] text-slate-400 dark:text-white/40 mb-1 font-medium uppercase tracking-wider">
          Até
        </label>
        <input
          type="date"
          value={to ?? ""}
          onChange={(e) => onChange(from, e.target.value || null)}
          className="w-full h-8 rounded-[6px] px-2 text-[12px] border outline-none focus:border-brand-500"
          style={{ borderColor: "rgba(0,0,0,0.08)" }}
        />
      </div>
      {(from || to) && (
        <button
          onClick={() => onChange(null, null)}
          className="self-end h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          title="Limpar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// ── Pure helper pra aplicar filtros + sort no array de deals ────────────────

export function applyFiltersAndSort<
  D extends {
    id: string
    title: string
    value: number | null
    status: string
    last_stage_changed_at: string | null
    source: string | null
    tags: string[] | null
    owner?: { id: string; name: string } | null
    client?: { id: string; name: string } | null
    created_at?: string | null
    lost_reason?: string | null
  },
>(deals: D[], filters: PipelineFilters, sort: SortOrder): D[] {
  let list = deals

  if (filters.tags.length) {
    list = list.filter((d) => d.tags?.some((t) => filters.tags.includes(t)))
  }
  if (filters.owners.length) {
    list = list.filter((d) => d.owner && filters.owners.includes(d.owner.id))
  }
  if (filters.statuses.length) {
    list = list.filter((d) => filters.statuses.includes(d.status))
  }
  if (filters.sources.length) {
    list = list.filter((d) => d.source && filters.sources.includes(d.source))
  }
  if (filters.lostReasons.length) {
    list = list.filter(
      (d) => d.lost_reason && filters.lostReasons.includes(d.lost_reason),
    )
  }
  if (filters.valueMin != null) {
    list = list.filter((d) => (d.value ?? 0) >= (filters.valueMin as number))
  }
  if (filters.valueMax != null) {
    list = list.filter((d) => (d.value ?? 0) <= (filters.valueMax as number))
  }
  if (filters.createdFrom) {
    const from = new Date(filters.createdFrom + "T00:00:00").getTime()
    list = list.filter((d) => {
      if (!d.created_at) return false
      return new Date(d.created_at).getTime() >= from
    })
  }
  if (filters.createdTo) {
    const to = new Date(filters.createdTo + "T23:59:59").getTime()
    list = list.filter((d) => {
      if (!d.created_at) return false
      return new Date(d.created_at).getTime() <= to
    })
  }
  if (filters.movedFrom) {
    const from = new Date(filters.movedFrom + "T00:00:00").getTime()
    list = list.filter((d) => {
      if (!d.last_stage_changed_at) return false
      return new Date(d.last_stage_changed_at).getTime() >= from
    })
  }
  if (filters.movedTo) {
    const to = new Date(filters.movedTo + "T23:59:59").getTime()
    list = list.filter((d) => {
      if (!d.last_stage_changed_at) return false
      return new Date(d.last_stage_changed_at).getTime() <= to
    })
  }

  // Sort (cria nova array pra nao mutar)
  const sorted = [...list]
  const getCreated = (d: D) =>
    d.created_at ? new Date(d.created_at).getTime() : 0
  const getMoved = (d: D) =>
    d.last_stage_changed_at ? new Date(d.last_stage_changed_at).getTime() : 0
  switch (sort) {
    case "created_desc":
      sorted.sort((a, b) => getCreated(b) - getCreated(a))
      break
    case "created_asc":
      sorted.sort((a, b) => getCreated(a) - getCreated(b))
      break
    case "moved_desc":
      sorted.sort((a, b) => getMoved(b) - getMoved(a))
      break
    case "moved_asc":
      sorted.sort((a, b) => getMoved(a) - getMoved(b))
      break
  }
  return sorted
}
