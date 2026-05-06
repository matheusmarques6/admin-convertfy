"use client"

import React, { useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowUp, ArrowDown, ChevronRight, Loader2, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { useMediaQuery } from "@/hooks/use-media-query"

// Threshold acima do qual o desktop renderiza com virtualizacao
// (CSS grid + @tanstack/react-virtual). Abaixo disso usa <table>
// classico pra preservar comportamento atual em listas pequenas.
const VIRTUALIZE_THRESHOLD = 100
const VIRTUAL_ROW_HEIGHT = 44
const VIRTUAL_VIEWPORT_HEIGHT = 560

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnDef<T> {
  /** Key to access value from the row object */
  accessorKey: keyof T & string
  /** Header label */
  header: string
  /** Column type — determines alignment and formatting */
  type?: "text" | "number" | "currency" | "percentage" | "date" | "badge" | "custom"
  /** Custom cell renderer (overrides type-based formatting) */
  cell?: (row: T) => React.ReactNode
  /** Custom header renderer */
  headerCell?: () => React.ReactNode
  /** Priority on mobile card: title | badge | detail | hidden */
  mobilePriority?: "title" | "badge" | "detail" | "hidden"
  /** Column width (desktop, e.g. "200px" or "20%") */
  width?: string
  /** Sortable column */
  sortable?: boolean
  /** Hide this column on tablet (768-1039px) */
  hideOnTablet?: boolean
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  onRowClick?: (row: T) => void
  pagination?: {
    page: number
    pageSize: number
    total: number
    onPageChange: (page: number) => void
    /** Mobile: use "Carregar mais" instead of page navigation */
    loadMore?: boolean
    onLoadMore?: () => void
    isLoadingMore?: boolean
  }
  loading?: boolean
  emptyMessage?: string
  emptyDescription?: string
  sorting?: { column: string; direction: "asc" | "desc" } | null
  onSortChange?: (column: string) => void
  /** Unique key for each row (default: "id") */
  rowKey?: keyof T & string
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

const numberFmt = new Intl.NumberFormat("pt-BR")
const currencyFmt = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const dateFmt = new Intl.DateTimeFormat("pt-BR")

function formatCell(value: unknown, type?: string): React.ReactNode {
  if (value == null || value === "") return "—"
  switch (type) {
    case "number":
      return numberFmt.format(Number(value))
    case "currency":
      return `R$ ${currencyFmt.format(Number(value))}`
    case "percentage":
      return `${numberFmt.format(Number(value))}%`
    case "date": {
      const d = typeof value === "string" ? new Date(value) : value
      if (d instanceof Date && !isNaN(d.getTime())) return dateFmt.format(d)
      return String(value)
    }
    default:
      return String(value)
  }
}

function isNumericType(type?: string) {
  return type === "number" || type === "currency" || type === "percentage"
}

// ---------------------------------------------------------------------------
// Mobile column heuristics
// ---------------------------------------------------------------------------

interface ResolvedMobile<T> {
  titleCol: ColumnDef<T> | null
  badgeCol: ColumnDef<T> | null
  detailCols: ColumnDef<T>[]
}

function resolveMobileColumns<T>(columns: ColumnDef<T>[]): ResolvedMobile<T> {
  const hasExplicit = columns.some((c) => c.mobilePriority)
  if (hasExplicit) {
    return {
      titleCol: columns.find((c) => c.mobilePriority === "title") ?? null,
      badgeCol: columns.find((c) => c.mobilePriority === "badge") ?? null,
      detailCols: columns.filter((c) => c.mobilePriority === "detail"),
    }
  }

  // Auto-heuristic
  const textCols = columns.filter((c) => !c.type || c.type === "text")
  const badgeCols = columns.filter((c) => c.type === "badge")
  const numCols = columns.filter((c) => isNumericType(c.type))
  const dateCols = columns.filter((c) => c.type === "date")

  const titleCol = textCols[0] ?? null
  const badgeCol = badgeCols[0] ?? null

  const used = new Set([titleCol, badgeCol].filter(Boolean))
  const remaining = [...numCols, ...dateCols, ...columns.filter(
    (c) => !used.has(c) && !numCols.includes(c) && !dateCols.includes(c)
  )].filter((c) => !used.has(c))

  return { titleCol, badgeCol, detailCols: remaining.slice(0, 4) }
}

// ---------------------------------------------------------------------------
// DataTable — public component
// ---------------------------------------------------------------------------

export function DataTable<T>(props: DataTableProps<T>) {
  const isMobile = useMediaQuery("(max-width: 767px)")

  if (props.loading) {
    return isMobile
      ? <MobileSkeleton />
      : <DesktopSkeleton columns={props.columns} />
  }

  if (!props.data.length) {
    return <EmptyState message={props.emptyMessage} description={props.emptyDescription} />
  }

  if (isMobile) return <MobileCardStack {...props} />
  if (props.data.length > VIRTUALIZE_THRESHOLD) return <DesktopTableVirtual {...props} />
  return <DesktopTable {...props} />
}

// ---------------------------------------------------------------------------
// Desktop Table Virtualized (>= 768px e data.length > VIRTUALIZE_THRESHOLD)
//
// Em listas grandes a tabela tradicional renderiza tudo de uma vez,
// causando lag. Aqui usamos @tanstack/react-virtual + CSS grid (em vez
// de <table>) pra renderizar apenas as linhas visiveis.
// ---------------------------------------------------------------------------

function DesktopTableVirtual<T>({
  columns,
  data,
  onRowClick,
  pagination,
  sorting,
  onSortChange,
  rowKey,
}: DataTableProps<T>) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const visibleColumns = columns
  const gridTemplate = visibleColumns
    .map((c) => c.width || "minmax(120px, 1fr)")
    .join(" ")

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => VIRTUAL_ROW_HEIGHT,
    overscan: 8,
  })

  const start = pagination ? (pagination.page - 1) * pagination.pageSize + 1 : 1
  const end = pagination
    ? Math.min(pagination.page * pagination.pageSize, pagination.total)
    : data.length
  const total = pagination?.total ?? data.length

  return (
    <div>
      <div className="rounded-[6px] border border-[rgba(0,0,0,0.08)] overflow-hidden dark:border-[rgba(255,255,255,0.08)]">
        {/* Header (sticky-style — fica fora do scroll virtual) */}
        <div
          className="grid bg-gray-50 dark:bg-[#242836] border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]"
          style={{ gridTemplateColumns: gridTemplate }}
          role="row"
        >
          {visibleColumns.map((col) => (
            <div
              key={col.accessorKey}
              role="columnheader"
              className={cn(
                "px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em]",
                "text-gray-500 dark:text-[#5C6378]",
                isNumericType(col.type) ? "text-right" : "text-left",
                col.sortable && "cursor-pointer select-none hover:text-gray-700 dark:hover:text-[#8B92A5]",
              )}
              onClick={
                col.sortable && onSortChange
                  ? () => onSortChange(col.accessorKey)
                  : undefined
              }
            >
              {col.headerCell ? col.headerCell() : col.header}
              {col.sortable && sorting?.column === col.accessorKey && (
                <Icon
                  icon={sorting.direction === "asc" ? ArrowUp : ArrowDown}
                  customSize={14}
                  className="inline ml-1 -mt-0.5"
                />
              )}
            </div>
          ))}
        </div>

        {/* Virtual scroll viewport */}
        <div
          ref={parentRef}
          className="overflow-auto"
          style={{ height: VIRTUAL_VIEWPORT_HEIGHT, contain: "strict" }}
          role="rowgroup"
        >
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = data[virtualRow.index]
              const key = rowKey ? String(row[rowKey]) : String(virtualRow.index)
              return (
                <div
                  key={key}
                  role="row"
                  className={cn(
                    "grid border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
                    "hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.02)]",
                    "transition-colors duration-150",
                    onRowClick && "cursor-pointer",
                  )}
                  style={{
                    gridTemplateColumns: gridTemplate,
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {visibleColumns.map((col) => (
                    <div
                      key={col.accessorKey}
                      role="cell"
                      className={cn(
                        "px-4 py-3 text-sm flex items-center",
                        isNumericType(col.type)
                          ? "justify-end font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]"
                          : "text-gray-700 dark:text-[#8B92A5]",
                      )}
                    >
                      <span className="truncate">
                        {col.cell
                          ? col.cell(row)
                          : formatCell(row[col.accessorKey], col.type)}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {pagination && (
        <div className="flex items-center justify-between px-1 py-3">
          <span className="text-sm text-gray-500 dark:text-[#5C6378]">
            Mostrando {start}–{end} de {total} resultados
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={end >= total}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Próximo
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Desktop Table (>= 768px)
// ---------------------------------------------------------------------------

function DesktopTable<T>({
  columns,
  data,
  onRowClick,
  pagination,
  sorting,
  onSortChange,
  rowKey,
}: DataTableProps<T>) {
  const start = pagination ? (pagination.page - 1) * pagination.pageSize + 1 : 1
  const end = pagination
    ? Math.min(pagination.page * pagination.pageSize, pagination.total)
    : data.length
  const total = pagination?.total ?? data.length

  return (
    <div>
      <div className="rounded-[6px] border border-[rgba(0,0,0,0.08)] overflow-hidden dark:border-[rgba(255,255,255,0.08)]">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-[#242836]">
              {columns.map((col) => (
                <th
                  key={col.accessorKey}
                  scope="col"
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    "px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em]",
                    "text-gray-500 dark:text-[#5C6378]",
                    "border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
                    "text-left",
                    isNumericType(col.type) && "text-right",
                    col.sortable && "cursor-pointer select-none hover:text-gray-700 dark:hover:text-[#8B92A5]",
                    col.hideOnTablet && "hidden lg:table-cell"
                  )}
                  onClick={
                    col.sortable && onSortChange
                      ? () => onSortChange(col.accessorKey)
                      : undefined
                  }
                >
                  {col.headerCell ? col.headerCell() : col.header}
                  {col.sortable && sorting?.column === col.accessorKey && (
                    <Icon
                      icon={sorting.direction === "asc" ? ArrowUp : ArrowDown}
                      customSize={14}
                      className="inline ml-1 -mt-0.5"
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const key = rowKey ? String(row[rowKey]) : String(i)
              return (
                <tr
                  key={key}
                  className={cn(
                    "border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] last:border-b-0",
                    "hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.02)]",
                    "transition-colors duration-150",
                    onRowClick && "cursor-pointer"
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.accessorKey}
                      className={cn(
                        "px-4 py-3 text-sm",
                        isNumericType(col.type)
                          ? "text-right font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]"
                          : "text-left text-gray-700 dark:text-[#8B92A5]",
                        col.hideOnTablet && "hidden lg:table-cell"
                      )}
                    >
                      {col.cell
                        ? col.cell(row)
                        : formatCell(row[col.accessorKey], col.type)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Desktop pagination — Anterior / Próximo only (Rule 13) */}
      {pagination && (
        <div className="flex items-center justify-between px-1 py-3">
          <span className="text-sm text-gray-500 dark:text-[#5C6378]">
            Mostrando {start}–{end} de {total} resultados
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={end >= total}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Próximo
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mobile Card Stack (< 768px) — Rule 22
// ---------------------------------------------------------------------------

function MobileCardStack<T>({
  columns,
  data,
  onRowClick,
  pagination,
  rowKey,
}: DataTableProps<T>) {
  const { titleCol, badgeCol, detailCols } = resolveMobileColumns(columns)
  const end = pagination
    ? Math.min(pagination.page * pagination.pageSize, pagination.total)
    : data.length
  const total = pagination?.total ?? data.length

  return (
    <div>
      <div className="space-y-3 px-1">
        {data.map((row, i) => {
          const key = rowKey ? String(row[rowKey]) : String(i)
          return (
            <div
              key={key}
              className={cn(
                "rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-white p-4",
                "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]",
                "active:bg-gray-50 dark:active:bg-[#242836]",
                "transition-colors duration-150",
                onRowClick && "cursor-pointer"
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {/* Header: title + badge + chevron */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  {titleCol && (
                    <span className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] truncate">
                      {titleCol.cell
                        ? titleCol.cell(row)
                        : formatCell(row[titleCol.accessorKey], titleCol.type)}
                    </span>
                  )}
                  {badgeCol && (
                    <span className="shrink-0">
                      {badgeCol.cell
                        ? badgeCol.cell(row)
                        : formatCell(row[badgeCol.accessorKey], badgeCol.type)}
                    </span>
                  )}
                </div>
                {onRowClick && (
                  <Icon
                    icon={ChevronRight}
                    size={16}
                    className="text-gray-400 dark:text-[#5C6378] shrink-0"
                  />
                )}
              </div>

              {/* Detail pairs: 2-column grid */}
              {detailCols.length > 0 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {detailCols.map((col) => (
                    <div key={col.accessorKey}>
                      <span className="text-[11px] font-medium text-gray-400 dark:text-[#5C6378] uppercase tracking-[0.04em]">
                        {col.header}
                      </span>
                      <span
                        className={cn(
                          "block text-sm mt-0.5",
                          isNumericType(col.type)
                            ? "font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]"
                            : "text-gray-700 dark:text-[#8B92A5]"
                        )}
                      >
                        {col.cell
                          ? col.cell(row)
                          : formatCell(row[col.accessorKey], col.type)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Mobile pagination — "Carregar mais" (Rule 22) */}
      {pagination?.loadMore && (
        <div className="mt-4 px-1">
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={pagination.onLoadMore}
            disabled={pagination.isLoadingMore || end >= total}
          >
            {pagination.isLoadingMore && (
              <Icon icon={Loader2} size={16} className="animate-spin mr-2" />
            )}
            {end >= total
              ? "Todos os resultados carregados"
              : "Carregar mais"}
          </Button>
          <p className="text-xs text-center text-gray-400 dark:text-[#5C6378] mt-2">
            {end} de {total} resultados
          </p>
        </div>
      )}

      {/* Fallback pagination if loadMore is not configured */}
      {pagination && !pagination.loadMore && (
        <div className="flex items-center justify-between px-1 py-3">
          <span className="text-xs text-gray-500 dark:text-[#5C6378]">
            {end} de {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={end >= total}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Próximo
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeletons
// ---------------------------------------------------------------------------

function DesktopSkeleton<T>({ columns }: { columns: ColumnDef<T>[] }) {
  return (
    <div className="rounded-[6px] border border-[rgba(0,0,0,0.08)] overflow-hidden dark:border-[rgba(255,255,255,0.08)]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-50 dark:bg-[#242836]">
            {columns.map((col) => (
              <th
                key={col.accessorKey}
                className={cn(
                  "px-4 py-3 border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
                  col.hideOnTablet && "hidden lg:table-cell"
                )}
              >
                <div className="h-3 w-16 rounded bg-gray-200 dark:bg-[#2E3347] animate-pulse" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr
              key={i}
              className="border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] last:border-b-0"
            >
              {columns.map((col) => (
                <td
                  key={col.accessorKey}
                  className={cn(
                    "px-4 py-3",
                    col.hideOnTablet && "hidden lg:table-cell"
                  )}
                >
                  <div
                    className={cn(
                      "h-4 rounded bg-gray-100 dark:bg-[#242836] animate-pulse",
                      isNumericType(col.type) ? "w-20 ml-auto" : "w-32"
                    )}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MobileSkeleton() {
  return (
    <div className="space-y-3 px-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-white p-4 dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27] animate-pulse"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="h-4 w-32 rounded bg-gray-200 dark:bg-[#2E3347]" />
            <div className="h-5 w-16 rounded-[6px] bg-gray-100 dark:bg-[#242836]" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <div className="h-2.5 w-12 rounded bg-gray-100 dark:bg-[#242836] mb-1.5" />
              <div className="h-4 w-20 rounded bg-gray-200 dark:bg-[#2E3347]" />
            </div>
            <div>
              <div className="h-2.5 w-12 rounded bg-gray-100 dark:bg-[#242836] mb-1.5" />
              <div className="h-4 w-16 rounded bg-gray-200 dark:bg-[#2E3347]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state — no icon-in-circle (Rule 1), minimal
// ---------------------------------------------------------------------------

function EmptyState({
  message,
  description,
}: {
  message?: string
  description?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <Icon
        icon={Inbox}
        size={24}
        className="text-gray-300 dark:text-[#5C6378] mb-3"
      />
      <p className="text-sm font-medium text-gray-500 dark:text-[#8B92A5]">
        {message || "Nenhum resultado encontrado"}
      </p>
      {description && (
        <p className="text-xs text-gray-400 dark:text-[#5C6378] mt-1">
          {description}
        </p>
      )}
    </div>
  )
}
