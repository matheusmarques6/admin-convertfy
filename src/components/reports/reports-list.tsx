"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Plus,
  FileText,
  Download,
  Eye,
  Calendar,
  Store,
  Filter,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Archive,
  Send,
  CheckCircle,
  Clock,
  X,
  AlertCircle,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { createClient } from "@/lib/supabase/client"
import type { Report, ReportData, ReportStatus } from "@/types"

interface ReportWithRelations extends Report {
  client?: { id: string; name: string; company?: string } | null
  user?: { id: string; name: string } | null
  store?: { id: string; store_name: string } | null
}

interface ClientOption {
  id: string
  name: string
}

interface PendingStore {
  id: string
  store_name: string
  client_id: string
  client_name: string
  has_klaviyo: boolean
  has_shopify: boolean
}

interface ReportsListProps {
  initialReports: ReportWithRelations[]
  clients: ClientOption[]
  totalCount: number
  thisMonthCount: number
  pendingCount: number
  pendingStores: PendingStore[]
}

const months: Record<string, string> = {
  "01": "Janeiro",
  "02": "Fevereiro",
  "03": "Março",
  "04": "Abril",
  "05": "Maio",
  "06": "Junho",
  "07": "Julho",
  "08": "Agosto",
  "09": "Setembro",
  "10": "Outubro",
  "11": "Novembro",
  "12": "Dezembro",
}

function getReportMonth(report: ReportWithRelations): string {
  if (report.date_range?.start) {
    const date = new Date(report.date_range.start)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  }
  if (report.period && /^\d{4}-\d{2}$/.test(report.period)) {
    return report.period
  }
  const date = new Date(report.created_at)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-")
  return `${months[m] || m} ${year}`
}

function getReportRevenue(reportData: ReportData | null | undefined): number | undefined {
  if (!reportData) return undefined
  if (reportData.revenue?.klaviyoAttributedRevenue !== undefined) {
    return reportData.revenue.klaviyoAttributedRevenue
  }
  if (reportData.revenue?.totalRevenue !== undefined) {
    return reportData.revenue.totalRevenue
  }
  if (typeof reportData.revenue_manual === 'number') {
    return reportData.revenue_manual
  }
  return undefined
}

function getReportOrders(reportData: ReportData | null | undefined): number | undefined {
  if (!reportData) return undefined
  if (reportData.revenue?.totalOrders !== undefined) {
    return reportData.revenue.totalOrders
  }
  if (typeof reportData.orders === 'number') {
    return reportData.orders
  }
  return undefined
}

function getPeriodLabel(period: string): string {
  switch (period) {
    case "7d": return "7 dias"
    case "30d": return "30 dias"
    case "90d": return "90 dias"
    case "all": return "12 meses"
    default:
      if (/^\d{4}-\d{2}$/.test(period)) {
        return formatMonth(period)
      }
      return period
  }
}

function getStatusBadge(status: ReportStatus | undefined) {
  switch (status) {
    case "draft":
      return <Badge variant="secondary" className="text-xs"><Clock className="mr-1 h-3 w-3" />Rascunho</Badge>
    case "published":
      return <Badge variant="default" className="text-xs"><CheckCircle className="mr-1 h-3 w-3" />Publicado</Badge>
    case "sent":
      return <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30"><Send className="mr-1 h-3 w-3" />Enviado</Badge>
    case "archived":
      return <Badge variant="outline" className="text-xs"><Archive className="mr-1 h-3 w-3" />Arquivado</Badge>
    default:
      return <Badge variant="secondary" className="text-xs">-</Badge>
  }
}

function getReportTypeBadge(type: string) {
  switch (type) {
    case "klaviyo":
      return <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/30">Klaviyo</Badge>
    case "shopify":
      return <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">Shopify</Badge>
    case "combined":
      return <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/30">Combinado</Badge>
    case "manual":
      return <Badge variant="outline" className="text-xs">Manual</Badge>
    default:
      return <Badge variant="secondary" className="text-xs">{type}</Badge>
  }
}

export function ReportsList({
  initialReports,
  clients,
  totalCount,
  thisMonthCount,
  pendingCount,
  pendingStores,
}: ReportsListProps) {
  const [reports, setReports] = useState(initialReports)

  // Filters
  const [searchTerm, setSearchTerm] = useState("")
  const [clientFilter, setClientFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [showFilters, setShowFilters] = useState(false)

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [reportToDelete, setReportToDelete] = useState<ReportWithRelations | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Filter reports
  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        const matchesName = report.store_name?.toLowerCase().includes(search) ||
          report.client?.name?.toLowerCase().includes(search) ||
          report.client?.company?.toLowerCase().includes(search)
        if (!matchesName) return false
      }

      // Client filter
      if (clientFilter !== "all" && report.client_id !== clientFilter) {
        return false
      }

      // Type filter
      if (typeFilter !== "all" && report.report_type !== typeFilter) {
        return false
      }

      // Status filter
      if (statusFilter !== "all" && report.status !== statusFilter) {
        return false
      }

      return true
    })
  }, [reports, searchTerm, clientFilter, typeFilter, statusFilter])

  // Group by month
  const groupedReports = useMemo(() => {
    return filteredReports.reduce((acc, report) => {
      const month = getReportMonth(report)
      if (!acc[month]) {
        acc[month] = []
      }
      acc[month].push(report)
      return acc
    }, {} as Record<string, typeof filteredReports>)
  }, [filteredReports])

  const sortedMonths = Object.keys(groupedReports).sort((a, b) => b.localeCompare(a))

  // Delete report
  async function handleDelete() {
    if (!reportToDelete) return

    setIsDeleting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("client_reports")
        .delete()
        .eq("id", reportToDelete.id)

      if (error) throw error

      setReports(prev => prev.filter(r => r.id !== reportToDelete.id))
      toast({
        title: "Relatório excluído",
        description: "O relatório foi excluído com sucesso.",
      })
    } catch (error) {
      console.error("Error deleting report:", error)
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: "Não foi possível excluir o relatório.",
      })
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setReportToDelete(null)
    }
  }

  // Update status
  async function updateStatus(report: ReportWithRelations, newStatus: ReportStatus) {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("client_reports")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", report.id)

      if (error) throw error

      setReports(prev => prev.map(r =>
        r.id === report.id ? { ...r, status: newStatus } : r
      ))

      const statusLabels: Record<ReportStatus, string> = {
        draft: "Rascunho",
        published: "Publicado",
        sent: "Enviado",
        archived: "Arquivado",
      }

      toast({
        title: "Status atualizado",
        description: `O relatório agora está como "${statusLabels[newStatus]}".`,
      })
    } catch (error) {
      console.error("Error updating status:", error)
      toast({
        variant: "destructive",
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar o status.",
      })
    }
  }

  const hasActiveFilters = searchTerm || clientFilter !== "all" || typeFilter !== "all" || statusFilter !== "all"

  function clearFilters() {
    setSearchTerm("")
    setClientFilter("all")
    setTypeFilter("all")
    setStatusFilter("all")
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">
            Gerencie os relatórios mensais dos clientes
          </p>
        </div>
        <Button asChild>
          <Link href="/reports/new">
            <Plus className="mr-2 h-4 w-4" />
            Novo Relatório
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg p-3 bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total de Relatórios</p>
              <p className="text-2xl font-bold">{totalCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg p-3 bg-emerald-500/10">
              <Calendar className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Este Mês</p>
              <p className="text-2xl font-bold">{thisMonthCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg p-3 bg-amber-500/10">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pendentes</p>
              <p className="text-2xl font-bold">{pendingCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Reports Section */}
      {pendingStores.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-base">Relatórios Pendentes</CardTitle>
            </div>
            <CardDescription>
              Lojas que não tiveram relatório gerado nos últimos 30 dias
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {pendingStores.map((store) => (
                <div
                  key={store.id}
                  className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-background"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{store.store_name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {store.client_name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {store.has_klaviyo && (
                        <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/30">
                          Klaviyo
                        </Badge>
                      )}
                      {store.has_shopify && (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                          Shopify
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button size="sm" asChild>
                    <Link
                      href={`/reports/new?client_id=${store.client_id}&store_id=${store.id}`}
                    >
                      <Zap className="mr-1 h-3 w-3" />
                      Gerar
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente ou loja..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className={hasActiveFilters ? "border-primary" : ""}
              >
                <Filter className="mr-2 h-4 w-4" />
                Filtros
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center">
                    !
                  </Badge>
                )}
              </Button>
            </div>

            {showFilters && (
              <div className="flex flex-wrap gap-4 p-4 rounded-lg bg-muted/50">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Cliente</label>
                  <Select value={clientFilter} onValueChange={setClientFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os clientes</SelectItem>
                      {clients.map(client => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Tipo</label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      <SelectItem value="klaviyo">Klaviyo</SelectItem>
                      <SelectItem value="shopify">Shopify</SelectItem>
                      <SelectItem value="combined">Combinado</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="draft">Rascunho</SelectItem>
                      <SelectItem value="published">Publicado</SelectItem>
                      <SelectItem value="sent">Enviado</SelectItem>
                      <SelectItem value="archived">Arquivado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {hasActiveFilters && (
                  <div className="flex items-end">
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="mr-1 h-3 w-3" />
                      Limpar filtros
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results info */}
      {hasActiveFilters && (
        <p className="text-sm text-muted-foreground">
          {filteredReports.length} relatório{filteredReports.length !== 1 ? "s" : ""} encontrado{filteredReports.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Reports by Month */}
      {sortedMonths.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">
              {hasActiveFilters ? "Nenhum relatório encontrado" : "Nenhum relatório encontrado"}
            </h3>
            <p className="text-muted-foreground mt-1">
              {hasActiveFilters
                ? "Tente ajustar os filtros de busca"
                : "Crie seu primeiro relatório"
              }
            </p>
            {!hasActiveFilters && (
              <Button className="mt-4" asChild>
                <Link href="/reports/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Relatório
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        sortedMonths.map((month) => (
          <Card key={month}>
            <CardHeader>
              <CardTitle className="text-base">{formatMonth(month)}</CardTitle>
              <CardDescription>
                {groupedReports[month].length} relatório{groupedReports[month].length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {groupedReports[month].map((report) => {
                  const reportData = report.report_data as ReportData
                  const revenue = getReportRevenue(reportData)
                  const orders = getReportOrders(reportData)

                  return (
                    <Card key={report.id} className="bg-muted/50">
                      <CardContent className="pt-4 space-y-3">
                        {/* Header with client/store name */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <FileText className="h-4 w-4 text-primary shrink-0" />
                            <span className="font-medium truncate">
                              {report.store_name || report.client?.name || 'Relatório'}
                            </span>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/reports/${report.id}`}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Visualizar
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/reports/${report.id}/edit`}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Editar
                                </Link>
                              </DropdownMenuItem>
                              {report.document_url && (
                                <DropdownMenuItem asChild>
                                  <a href={report.document_url} target="_blank" rel="noopener noreferrer">
                                    <Download className="mr-2 h-4 w-4" />
                                    Download PDF
                                  </a>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => updateStatus(report, "draft")}
                                disabled={report.status === "draft"}
                              >
                                <Clock className="mr-2 h-4 w-4" />
                                Marcar como Rascunho
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => updateStatus(report, "published")}
                                disabled={report.status === "published"}
                              >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Marcar como Publicado
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => updateStatus(report, "sent")}
                                disabled={report.status === "sent"}
                              >
                                <Send className="mr-2 h-4 w-4" />
                                Marcar como Enviado
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => updateStatus(report, "archived")}
                                disabled={report.status === "archived"}
                              >
                                <Archive className="mr-2 h-4 w-4" />
                                Arquivar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setReportToDelete(report)
                                  setDeleteDialogOpen(true)
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {getReportTypeBadge(report.report_type)}
                          {getStatusBadge(report.status)}
                        </div>

                        {/* Period info */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Store className="h-3 w-3" />
                          <span>{getPeriodLabel(report.period)}</span>
                        </div>

                        {/* Metrics preview */}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {revenue !== undefined && (
                            <div>
                              <p className="text-xs text-muted-foreground">Receita</p>
                              <p className="font-medium text-emerald-600">
                                {formatCurrency(revenue)}
                              </p>
                            </div>
                          )}
                          {orders !== undefined && (
                            <div>
                              <p className="text-xs text-muted-foreground">Pedidos</p>
                              <p className="font-medium">{orders}</p>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="flex-1" asChild>
                            <Link href={`/reports/${report.id}`}>
                              <Eye className="mr-2 h-3 w-3" />
                              Ver
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/reports/${report.id}/edit`}>
                              <Pencil className="h-3 w-3" />
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ))
      )}

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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
