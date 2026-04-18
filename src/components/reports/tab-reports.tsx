"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Download,
  Trash2,
  Archive,
  Send,
  CheckCircle,
  Clock,

  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { FilterSelect } from "@/components/ui/filter-select"
import { AlertBanner } from "@/components/ui/alert-banner"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { formatCurrency } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import { MobileFiltersSheet } from "./mobile-filters-sheet"
import type { Report, ReportData, ReportStatus } from "@/types"

// ── Types ────────────────────────────────────────────────────────────────────

interface ReportWithRelations extends Report {
  client?: { id: string; name: string; company?: string } | null
  user?: { id: string; name: string } | null
  store?: { id: string; store_name: string } | null
}

interface ClientOption {
  id: string
  name: string
}

export interface PendingStore {
  id: string
  store_name: string
  client_id: string
  client_name: string
  has_klaviyo: boolean
  has_omnisend: boolean
  has_shopify: boolean
}

interface TabReportsProps {
  initialReports: ReportWithRelations[]
  clients: ClientOption[]
  totalCount: number
  thisMonthCount: number
  pendingStores: PendingStore[]
  initialStoreId?: string
}

/** Flat row type for DataTable (accessorKey must be keyof ReportRow & string) */
interface ReportRow {
  id: string
  clientName: string
  clientId: string
  clientCompany: string
  storeName: string
  reportType: string
  periodLabel: string
  revenue: number
  hasRevenue: boolean
  status: string
  createdAt: string
  documentUrl: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
  "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
  "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro",
}

function getReportMonth(report: ReportWithRelations): string {
  if (report.date_range?.start) {
    const d = new Date(report.date_range.start)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  }
  if (report.period && /^\d{4}-\d{2}$/.test(report.period)) return report.period
  const d = new Date(report.created_at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function formatMonth(m: string): string {
  const [year, month] = m.split("-")
  return `${MONTHS[month] || month} ${year}`
}

function getPeriodLabel(period: string): string {
  switch (period) {
    case "7d": return "7 dias"
    case "30d": return "30 dias"
    case "90d": return "90 dias"
    case "all": return "12 meses"
    default:
      if (/^\d{4}-\d{2}$/.test(period)) return formatMonth(period)
      return period
  }
}

function getReportRevenue(data: ReportData | null | undefined): number | undefined {
  if (!data) return undefined
  if (data.revenue?.klaviyoAttributedRevenue !== undefined) return data.revenue.klaviyoAttributedRevenue
  if (data.revenue?.totalRevenue !== undefined) return data.revenue.totalRevenue
  if (typeof data.revenue_manual === "number") return data.revenue_manual
  return undefined
}

const TYPE_LABELS: Record<string, string> = {
  klaviyo: "Klaviyo",
  shopify: "Shopify",
  combined: "Combinado",
  manual: "Manual",
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  published: "Publicado",
  sent: "Enviado",
  archived: "Arquivado",
}

// ── Component ────────────────────────────────────────────────────────────────

export function TabReports({
  initialReports,
  clients,
  totalCount,
  thisMonthCount,
  pendingStores,
  initialStoreId: _initialStoreId,
}: TabReportsProps) {
  const [reports, setReports] = useState(initialReports)
  const [searchTerm, setSearchTerm] = useState("")
  const [clientFilter, setClientFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [reportToDelete, setReportToDelete] = useState<ReportWithRelations | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [pendingBannerDismissed, setPendingBannerDismissed] = useState(false)

  // Available months from all reports
  const availableMonths = useMemo(() => {
    const set = new Set<string>()
    reports.forEach(r => set.add(getReportMonth(r)))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [reports])

  const monthOptions = useMemo(() => [
    { value: "all", label: "Todos os meses" },
    ...availableMonths.map(m => ({ value: m, label: formatMonth(m) })),
  ], [availableMonths])

  const clientOptions = useMemo(() => [
    { value: "all", label: "Todos os clientes" },
    ...clients.map(c => ({ value: c.id, label: c.name })),
  ], [clients])

  const typeOptions = useMemo(() => [
    { value: "all", label: "Todos os tipos" },
    { value: "klaviyo", label: "Klaviyo" },
    { value: "shopify", label: "Shopify" },
    { value: "combined", label: "Combinado" },
    { value: "manual", label: "Manual" },
  ], [])

  const statusOptions = useMemo(() => [
    { value: "all", label: "Todos" },
    { value: "draft", label: "Rascunho" },
    { value: "published", label: "Publicado" },
    { value: "sent", label: "Enviado" },
    { value: "archived", label: "Arquivado" },
  ], [])

  // Filter reports
  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      if (searchTerm) {
        const s = searchTerm.toLowerCase()
        const match = report.store_name?.toLowerCase().includes(s) ||
          report.client?.name?.toLowerCase().includes(s) ||
          report.client?.company?.toLowerCase().includes(s)
        if (!match) return false
      }
      if (clientFilter !== "all" && report.client_id !== clientFilter) return false
      if (typeFilter !== "all" && report.report_type !== typeFilter) return false
      if (statusFilter !== "all" && report.status !== statusFilter) return false
      if (monthFilter !== "all" && getReportMonth(report) !== monthFilter) return false
      return true
    })
  }, [reports, searchTerm, clientFilter, typeFilter, statusFilter, monthFilter])

  // Flatten to ReportRow for DataTable
  const rows: ReportRow[] = useMemo(() => {
    return filteredReports.map(r => {
      const rev = getReportRevenue(r.report_data as ReportData)
      return {
        id: r.id,
        clientName: r.client?.name || "—",
        clientId: r.client_id,
        clientCompany: r.client?.company || "",
        storeName: r.store?.store_name || r.store_name || "—",
        reportType: r.report_type,
        periodLabel: getPeriodLabel(r.period),
        revenue: rev ?? 0,
        hasRevenue: rev !== undefined,
        status: r.status || "draft",
        createdAt: r.created_at,
        documentUrl: r.document_url || "",
      }
    })
  }, [filteredReports])

  const hasActiveFilters = !!(searchTerm || clientFilter !== "all" || typeFilter !== "all" || statusFilter !== "all")

  function clearFilters() {
    setSearchTerm("")
    setClientFilter("all")
    setTypeFilter("all")
    setStatusFilter("all")
    setMonthFilter("all")
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!reportToDelete) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/client-reports?id=${reportToDelete.id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao excluir relatório")
      }
      setReports(prev => prev.filter(r => r.id !== reportToDelete.id))
      toast({ title: "Relatório excluído", description: "O relatório foi excluído com sucesso." })
    } catch (error) {
      console.error("Error deleting report:", error)
      toast({ variant: "destructive", title: "Erro ao excluir", description: "Não foi possível excluir o relatório." })
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setReportToDelete(null)
    }
  }

  async function updateStatus(reportId: string, newStatus: ReportStatus) {
    try {
      const res = await fetch("/api/client-reports", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, status: newStatus }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao atualizar status")
      }
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: newStatus } : r))
      toast({ title: "Status atualizado", description: `Status alterado para "${STATUS_LABELS[newStatus]}".` })
    } catch (error) {
      console.error("Error updating status:", error)
      toast({ variant: "destructive", title: "Erro ao atualizar", description: "Não foi possível atualizar o status." })
    }
  }

  // Find full report for actions
  function findReport(id: string) {
    return reports.find(r => r.id === id)
  }

  // ── DataTable Columns ────────────────────────────────────────────────────

  const columns: ColumnDef<ReportRow>[] = [
    {
      accessorKey: "clientName",
      header: "Cliente",
      type: "text",
      mobilePriority: "title",
      cell: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/clients/${row.clientId}`} className="hover:underline">
            <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
              {row.clientName}
            </p>
            {row.clientCompany && (
              <p className="text-xs text-gray-400 dark:text-[#5C6378] truncate">
                {row.clientCompany}
              </p>
            )}
          </Link>
        </div>
      ),
    },
    {
      accessorKey: "storeName",
      header: "Loja",
      type: "text",
      mobilePriority: "hidden",
      hideOnTablet: true,
      cell: (row) => (
        <span className="text-sm text-gray-600 dark:text-[#8B92A5] truncate max-w-[160px] block">
          {row.storeName}
        </span>
      ),
    },
    {
      accessorKey: "reportType",
      header: "Tipo",
      type: "badge",
      mobilePriority: "hidden",
      cell: (row) => {
        const variant = row.reportType === "klaviyo" ? "info"
          : row.reportType === "shopify" ? "positive"
          : "neutral"
        return (
          <Badge variant={variant} showDot={false} className="text-[10px]">
            {TYPE_LABELS[row.reportType] || row.reportType}
          </Badge>
        )
      },
    },
    {
      accessorKey: "periodLabel",
      header: "Período",
      type: "text",
      mobilePriority: "detail",
      cell: (row) => (
        <span className="text-sm text-gray-600 dark:text-[#8B92A5]">
          {row.periodLabel}
        </span>
      ),
    },
    {
      accessorKey: "revenue",
      header: "Receita",
      type: "currency",
      mobilePriority: "detail",
      cell: (row) => (
        <span className="text-sm font-medium font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
          {row.hasRevenue ? formatCurrency(row.revenue) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      type: "badge",
      mobilePriority: "badge",
      cell: (row) => <StatusBadge status={row.status} label={STATUS_LABELS[row.status]} />,
    },
    {
      accessorKey: "id",
      header: "",
      type: "custom",
      mobilePriority: "hidden",
      width: "48px",
      cell: (row) => {
        const report = findReport(row.id)
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/admin/reports/${row.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  Visualizar
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/admin/reports/${row.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </DropdownMenuItem>
              {row.documentUrl && (
                <DropdownMenuItem asChild>
                  <a href={row.documentUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => updateStatus(row.id, "draft")} disabled={row.status === "draft"}>
                <Clock className="mr-2 h-4 w-4" />
                Rascunho
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatus(row.id, "published")} disabled={row.status === "published"}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Publicado
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatus(row.id, "sent")} disabled={row.status === "sent"}>
                <Send className="mr-2 h-4 w-4" />
                Enviado
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatus(row.id, "archived")} disabled={row.status === "archived"}>
                <Archive className="mr-2 h-4 w-4" />
                Arquivar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-[#991B1B] dark:text-[#FCA5A5]"
                onClick={() => {
                  if (report) {
                    setReportToDelete(report)
                    setDeleteDialogOpen(true)
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* AlertBanner — pending stores */}
      {pendingStores.length > 0 && !pendingBannerDismissed && (
        <AlertBanner
          variant="warning"
          description={`${pendingStores.length} loja(s) sem relatório nos últimos 30 dias.`}
          action={{
            label: "Ver lojas",
            href: "/admin/stores",
          }}
          onDismiss={() => setPendingBannerDismissed(true)}
        />
      )}

      {/* Summary cards — DS v3.0 Rule 2 */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
          <span className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5]">Total</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3] mt-1">
            {totalCount}
          </p>
        </div>
        <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
          <span className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5]">Este mês</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-[#4E62D8] dark:text-[#7B8CEA] mt-1">
            {thisMonthCount}
          </p>
        </div>
        <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
          <span className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5]">Pendentes</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3] mt-1">
            {pendingStores.length}
          </p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-[#5C6378]" />
            <Input
              placeholder="Buscar cliente ou loja..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Mobile filter sheet */}
          <MobileFiltersSheet
            clientFilter={clientFilter}
            onClientFilterChange={setClientFilter}
            clientOptions={clientOptions}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            typeOptions={typeOptions}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            statusOptions={statusOptions}
            monthFilter={monthFilter}
            onMonthFilterChange={setMonthFilter}
            monthOptions={monthOptions}
            onClear={clearFilters}
            hasActiveFilters={hasActiveFilters}
          />
        </div>

        {/* Desktop filters */}
        <div className="hidden md:flex items-center gap-2">
          <FilterSelect value={monthFilter} onValueChange={setMonthFilter} options={monthOptions} placeholder="Mês" />
          <FilterSelect value={clientFilter} onValueChange={setClientFilter} options={clientOptions} placeholder="Cliente" />
          <FilterSelect value={typeFilter} onValueChange={setTypeFilter} options={typeOptions} placeholder="Tipo" />
          <FilterSelect value={statusFilter} onValueChange={setStatusFilter} options={statusOptions} placeholder="Status" />
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Results count */}
      {hasActiveFilters && (
        <p className="text-xs text-gray-400 dark:text-[#5C6378]">
          {rows.length} relatório{rows.length !== 1 ? "s" : ""} encontrado{rows.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* DataTable — DS v3.0 Rule 5 */}
      <DataTable
        columns={columns}
        data={rows}
        emptyMessage="Nenhum relatório encontrado"
        emptyDescription={hasActiveFilters ? "Tente ajustar os filtros" : "Crie seu primeiro relatório"}
        rowKey="id"
        onRowClick={(row) => {
          window.location.href = `/admin/reports/${row.id}`
        }}
      />

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir relatório?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O relatório{" "}
              <strong>{reportToDelete?.store_name || reportToDelete?.client?.name}</strong>{" "}
              será permanentemente excluído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-[#991B1B] text-white hover:bg-[#991B1B]/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
