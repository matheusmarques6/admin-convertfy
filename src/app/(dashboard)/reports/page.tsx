import Link from "next/link"
import { Plus, FileText, Download, Eye, Calendar, Clock, Store } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import type { Report, ReportData } from "@/types"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"

export const dynamic = "force-dynamic"

interface ReportWithRelations extends Report {
  client?: { id: string; name: string; company?: string } | null
  user?: { id: string; name: string } | null
  store?: { id: string; store_name: string } | null
}

async function getReports(): Promise<ReportWithRelations[]> {
  const supabase = await createClient()

  const { data: reports } = await supabase
    .from("client_reports")
    .select(`
      *,
      client:clients (
        id,
        name,
        company
      ),
      user:profiles (
        id,
        name
      ),
      store:client_stores (
        id,
        store_name
      )
    `)
    .order("created_at", { ascending: false })

  return (reports || []) as ReportWithRelations[]
}

async function getPendingReportsCount(): Promise<number> {
  const supabase = await createClient()

  // Get all client stores with Klaviyo configured
  const { data: stores } = await supabase
    .from("client_stores")
    .select("id, client_id")
    .or("klaviyo_private_key.neq.,klaviyo_api_key.neq.")

  if (!stores || stores.length === 0) return 0

  // Get store IDs that have reports in the last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: recentReports } = await supabase
    .from("client_reports")
    .select("store_id")
    .gte("created_at", thirtyDaysAgo.toISOString())

  const storesWithReports = new Set(recentReports?.map(r => r.store_id) || [])

  // Count stores without recent reports
  const pendingCount = stores.filter(s => !storesWithReports.has(s.id)).length

  return pendingCount
}

async function getThisMonthCount(): Promise<number> {
  const supabase = await createClient()

  const now = new Date()
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const { count } = await supabase
    .from("client_reports")
    .select("*", { count: "exact", head: true })
    .gte("created_at", firstDayOfMonth.toISOString())

  return count || 0
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
  // Try to get month from date_range
  if (report.date_range?.start) {
    const date = new Date(report.date_range.start)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  }
  // Fallback to period if it's in YYYY-MM format
  if (report.period && /^\d{4}-\d{2}$/.test(report.period)) {
    return report.period
  }
  // Default to created_at month
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
  // Try Klaviyo revenue first
  if (reportData.revenue?.klaviyoAttributedRevenue !== undefined) {
    return reportData.revenue.klaviyoAttributedRevenue
  }
  if (reportData.revenue?.totalRevenue !== undefined) {
    return reportData.revenue.totalRevenue
  }
  // Fallback to legacy manual metrics
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

export default async function ReportsPage() {
  const [reports, pendingCount, thisMonthCount] = await Promise.all([
    getReports(),
    getPendingReportsCount(),
    getThisMonthCount()
  ])

  // Group by month
  const groupedReports = reports.reduce((acc, report) => {
    const month = getReportMonth(report)
    if (!acc[month]) {
      acc[month] = []
    }
    acc[month].push(report)
    return acc
  }, {} as Record<string, typeof reports>)

  const sortedMonths = Object.keys(groupedReports).sort((a, b) => b.localeCompare(a))

  return (
    <PagePermissionWrapper requiredFeatures={["view_reports"]}>
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
              <p className="text-2xl font-bold">{reports.length}</p>
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

      {/* Reports by Month */}
      {sortedMonths.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">Nenhum relatório encontrado</h3>
            <p className="text-muted-foreground mt-1">
              Crie seu primeiro relatório
            </p>
            <Button className="mt-4" asChild>
              <Link href="/reports/new">
                <Plus className="mr-2 h-4 w-4" />
                Criar Relatório
              </Link>
            </Button>
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
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="font-medium truncate">
                              {report.store_name || report.client?.name || 'Relatório'}
                            </span>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {report.report_type || 'manual'}
                          </Badge>
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
                          {report.document_url && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={report.document_url} target="_blank" rel="noopener noreferrer">
                                <Download className="h-3 w-3" />
                              </a>
                            </Button>
                          )}
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
    </div>
    </PagePermissionWrapper>
  )
}
