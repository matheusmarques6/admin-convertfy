"use client"

/**
 * Visão de tabela do pipeline.
 *
 * O kanban responde "como está o funil"; a tabela responde "quais
 * negócios atendem a este recorte, ordenados por isto" — pergunta que
 * com 200 deals o kanban não responde. As duas leem a MESMA lista já
 * filtrada pelo board, então alternar de visão nunca muda o conjunto.
 *
 * Interações: clique no cabeçalho ordena, clique na linha abre o deal,
 * checkbox seleciona (shift+click seleciona intervalo). A seleção é
 * podada quando o filtro muda — ação em massa nunca pega deal fora da
 * tela. Regras em deals-table-utils.ts (24 testes).
 */

import { useMemo } from "react"
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronsUpDown,
  Clock,
  Flag,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import {
  headerCheckboxState,
  sortDeals,
  toggleSort,
  type TableColumnKey,
  type TableSort,
} from "./deals-table-utils"

export interface DealsTableDeal {
  id: string
  title: string
  value: number | null
  stage_id: string
  status: string
  tags?: string[] | null
  created_at?: string | null
  expected_close_date?: string | null
  last_stage_changed_at: string | null
  owner?: { id: string; name: string; avatar_url?: string | null } | null
  client?: { id: string; name: string } | null
  next_step?: { label: string; when: string; tone: string } | null
  activities_pending?: number | null
}

/** Aceita o shape do board (KanbanStage): `order` opcional, `stage_type` nullable. */
interface Stage {
  id: string
  name: string
  color?: string | null
  order?: number
  stage_type?: string | null
}

interface DealsTableProps {
  deals: DealsTableDeal[]
  stages: Stage[]
  sort: TableSort
  onSortChange: (next: TableSort) => void
  selected: Set<string>
  onToggleRow: (id: string, shiftKey: boolean) => void
  onToggleAll: () => void
  onRowClick: (id: string) => void
}

const COLUMNS: Array<{
  key: TableColumnKey
  label: string
  align?: "right"
  /** Escondida em telas estreitas — a tabela precisa caber no celular. */
  hideBelow?: "sm" | "md" | "lg"
}> = [
  { key: "title", label: "Negócio" },
  { key: "stage", label: "Etapa" },
  { key: "value", label: "Valor", align: "right" },
  { key: "owner", label: "Responsável", hideBelow: "md" },
  { key: "next_step", label: "Próxima ação", hideBelow: "lg" },
  { key: "idle_days", label: "Parado", align: "right", hideBelow: "sm" },
]

const hideClass = (b?: "sm" | "md" | "lg") =>
  b === "sm" ? "hidden sm:table-cell" : b === "md" ? "hidden md:table-cell" : b === "lg" ? "hidden lg:table-cell" : ""

const fmtBRL = (v: number | null) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      })

function idleDays(iso: string | null): number {
  if (!iso) return 0
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return 0
  return Math.max(0, Math.floor((Date.now() - ms) / 86_400_000))
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("")
}

export function DealsTable({
  deals,
  stages,
  sort,
  onSortChange,
  selected,
  onToggleRow,
  onToggleAll,
  onRowClick,
}: DealsTableProps) {
  const stageMap = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages])
  // Sem `order` explícito, a posição no array é a ordem do funil.
  const stageOrder = useMemo(
    () => new Map(stages.map((s, i) => [s.id, s.order ?? i])),
    [stages],
  )

  const rows = useMemo(
    () => sortDeals(deals, sort, { stageOrder }),
    [deals, sort, stageOrder],
  )

  const visibleIds = useMemo(() => rows.map((d) => d.id), [rows])
  const headerState = headerCheckboxState(selected, visibleIds)

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-[13px] text-slate-500 dark:text-white/50">
          Nenhum negócio neste recorte. Ajuste os filtros para ver mais.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-50 dark:bg-[#161A24]">
            <th
              scope="col"
              className="w-9 border-b border-black/[0.06] px-2 py-0 dark:border-white/[0.06]"
              style={{ height: "var(--crm-table-header-height)" }}
            >
              <input
                type="checkbox"
                checked={headerState === "all"}
                ref={(el) => {
                  if (el) el.indeterminate = headerState === "some"
                }}
                onChange={onToggleAll}
                aria-label={
                  headerState === "all"
                    ? "Desmarcar todos os negócios"
                    : "Selecionar todos os negócios"
                }
                className="h-3.5 w-3.5 cursor-pointer accent-[#4E62D8]"
              />
            </th>
            {COLUMNS.map((col) => {
              const active = sort.column === col.key
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    active
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={cn(
                    "border-b border-black/[0.06] px-3 py-0 text-left font-medium dark:border-white/[0.06]",
                    hideClass(col.hideBelow),
                  )}
                  style={{ height: "var(--crm-table-header-height)" }}
                >
                  <button
                    type="button"
                    onClick={() => onSortChange(toggleSort(sort, col.key))}
                    className={cn(
                      "group inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.04em] transition-colors",
                      col.align === "right" && "w-full justify-end",
                      active
                        ? "text-slate-900 dark:text-white"
                        : "text-slate-500 hover:text-slate-800 dark:text-white/50 dark:hover:text-white/80",
                    )}
                  >
                    {col.label}
                    <Icon
                      icon={active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown}
                      customSize={12}
                      className={cn(
                        active ? "opacity-100" : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map((deal) => {
            const stage = stageMap.get(deal.stage_id)
            const isSelected = selected.has(deal.id)
            const days = idleDays(deal.last_stage_changed_at)
            const tone = deal.next_step?.tone

            return (
              <tr
                key={deal.id}
                onClick={() => onRowClick(deal.id)}
                className={cn(
                  "cursor-pointer border-b border-black/[0.04] transition-colors dark:border-white/[0.04]",
                  isSelected
                    ? "bg-[#EEF0FB] dark:bg-[#4E62D8]/15"
                    : "hover:bg-slate-50 dark:hover:bg-white/[0.03]",
                )}
                style={{ height: "var(--crm-table-row-height)" }}
              >
                <td className="px-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    onClick={(e) => onToggleRow(deal.id, e.shiftKey)}
                    aria-label={`Selecionar ${deal.title}`}
                    className="h-3.5 w-3.5 cursor-pointer accent-[#4E62D8]"
                  />
                </td>

                <td className="max-w-[280px] px-3">
                  <div className="truncate font-medium text-slate-900 dark:text-white">
                    {deal.title}
                  </div>
                  {deal.client?.name && (
                    <div className="truncate text-[11px] text-slate-500 dark:text-white/45">
                      {deal.client.name}
                    </div>
                  )}
                </td>

                <td className="px-3">
                  <span
                    className="inline-flex max-w-[150px] items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      background: `${stage?.color ?? "#6B7280"}1A`,
                      color: stage?.color ?? "#6B7280",
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: stage?.color ?? "#6B7280" }}
                    />
                    <span className="truncate">{stage?.name ?? "—"}</span>
                  </span>
                </td>

                <td className="px-3 text-right font-medium tabular-nums text-slate-900 dark:text-white">
                  {fmtBRL(deal.value)}
                </td>

                <td className={cn("px-3", hideClass("md"))}>
                  {deal.owner?.name ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600 dark:bg-white/10 dark:text-white/70">
                        {initials(deal.owner.name)}
                      </span>
                      <span className="truncate text-slate-700 dark:text-white/75">
                        {deal.owner.name}
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-400 dark:text-white/30">—</span>
                  )}
                </td>

                <td className={cn("max-w-[220px] px-3", hideClass("lg"))}>
                  {deal.next_step ? (
                    <span
                      className={cn(
                        "inline-flex max-w-full items-center gap-1.5 truncate text-[12px]",
                        tone === "neg"
                          ? "text-[#B91C1C] dark:text-[#FCA5A5]"
                          : tone === "warn"
                            ? "text-[#92400E] dark:text-[#FCD34D]"
                            : "text-slate-600 dark:text-white/60",
                      )}
                    >
                      <Icon
                        icon={tone === "neg" ? Flag : tone === "warn" ? Clock : Calendar}
                        customSize={12}
                        className="shrink-0"
                      />
                      <span className="truncate">{deal.next_step.label}</span>
                      {deal.next_step.when && (
                        <span className="shrink-0 opacity-70">· {deal.next_step.when}</span>
                      )}
                    </span>
                  ) : (
                    // Deal sem próxima ação é o que morre no funil —
                    // por isso aparece marcado, não como célula vazia.
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-amber-600 dark:text-amber-400/80">
                      <Icon icon={Clock} customSize={12} />
                      Sem próxima ação
                    </span>
                  )}
                </td>

                <td className={cn("px-3 text-right tabular-nums", hideClass("sm"))}>
                  <span
                    className={cn(
                      days >= 14
                        ? "font-semibold text-[#B91C1C] dark:text-[#FCA5A5]"
                        : days >= 7
                          ? "text-[#92400E] dark:text-[#FCD34D]"
                          : "text-slate-500 dark:text-white/45",
                    )}
                  >
                    {days}d
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
