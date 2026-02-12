import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Download, FileText, TrendingUp, ShoppingCart, MousePointer, DollarSign, Mail, Users, Store, Calendar, Zap } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { Report, ReportData } from "@/types"

interface ReportPageProps {
  params: Promise<{ id: string }>
}

interface ReportWithRelations extends Report {
  client?: { id: string; name: string; company?: string; email?: string } | null
  user?: { id: string; name: string } | null
  store?: { id: string; store_name: string } | null
}

async function getReport(id: string): Promise<ReportWithRelations | null> {
  const supabase = await createClient()

  const { data: report } = await supabase
    .from("client_reports")
    .select(`
      *,
      client:clients (
        id,
        name,
        company,
        email
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
    .eq("id", id)
    .single()

  return report as ReportWithRelations | null
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

function formatMonth(month: string): string {
  const [year, m] = month.split("-")
  return `${months[m] || m} ${year}`
}

function formatPeriod(report: ReportWithRelations): string {
  if (report.date_range?.start && report.date_range?.end) {
    const start = new Date(report.date_range.start)
    const end = new Date(report.date_range.end)
    return `${start.toLocaleDateString('pt-BR')} - ${end.toLocaleDateString('pt-BR')}`
  }

  switch (report.period) {
    case "7d": return "Últimos 7 dias"
    case "30d": return "Últimos 30 dias"
    case "90d": return "Últimos 90 dias"
    case "all": return "Últimos 12 meses"
    default:
      if (/^\d{4}-\d{2}$/.test(report.period)) {
        return formatMonth(report.period)
      }
      return report.period
  }
}

function getReportTypeLabel(type: string): string {
  switch (type) {
    case 'klaviyo': return 'Klaviyo'
    case 'shopify': return 'Shopify'
    case 'combined': return 'Combinado'
    case 'manual': return 'Manual'
    default: return type
  }
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { id } = await params
  const report = await getReport(id)

  if (!report) {
    notFound()
  }

  const reportData = report.report_data as ReportData
  const clientData = report.client
  const userData = report.user

  // Extract metrics from report_data
  const revenue = reportData?.revenue
  const overview = reportData?.overview
  const emailPerformance = reportData?.emailPerformance
  const account = reportData?.account

  // Format currency based on account settings
  const currency = account?.currency || 'BRL'
  const formatReportCurrency = (value: number | undefined) => {
    if (value === undefined) return null
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency,
    }).format(value)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/reports">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">
                Relatório - {report.store_name || clientData?.name}
              </h1>
              <Badge variant="outline">
                <FileText className="h-3 w-3 mr-1" />
                {getReportTypeLabel(report.report_type)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {clientData?.name}
              {clientData?.company && ` (${clientData.company})`}
              {' • '}
              {formatPeriod(report)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {report.document_url && (
            <Button variant="outline" asChild>
              <a href={report.document_url} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Revenue Metrics */}
      {revenue && (
        <>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            Métricas de Receita
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {revenue.totalRevenue !== undefined && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Faturamento Total</CardTitle>
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600">
                    {formatReportCurrency(revenue.totalRevenue)}
                  </div>
                </CardContent>
              </Card>
            )}

            {revenue.klaviyoAttributedRevenue !== undefined && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Receita Klaviyo</CardTitle>
                  <Mail className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">
                    {formatReportCurrency(revenue.klaviyoAttributedRevenue)}
                  </div>
                </CardContent>
              </Card>
            )}

            {revenue.totalOrders !== undefined && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pedidos</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{revenue.totalOrders}</div>
                </CardContent>
              </Card>
            )}

            {revenue.averageOrderValue !== undefined && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
                  <DollarSign className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatReportCurrency(revenue.averageOrderValue)}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Overview Metrics */}
      {overview && (
        <>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Visão Geral
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {overview.totalSubscribers !== undefined && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total de Contatos</CardTitle>
                  <Users className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {overview.totalSubscribers.toLocaleString('pt-BR')}
                  </div>
                </CardContent>
              </Card>
            )}

            {overview.engagedSegmentSize !== undefined && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Engajados (90d)</CardTitle>
                  <Zap className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {overview.engagedSegmentSize.toLocaleString('pt-BR')}
                  </div>
                </CardContent>
              </Card>
            )}

            {overview.totalFlows !== undefined && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Flows Ativos</CardTitle>
                  <Zap className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overview.totalFlows}</div>
                </CardContent>
              </Card>
            )}

            {overview.totalCampaigns !== undefined && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Campanhas</CardTitle>
                  <Mail className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overview.totalCampaigns}</div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Email Performance */}
      {emailPerformance && (
        <>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-purple-500" />
            Performance de E-mail
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {emailPerformance.delivered !== undefined && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Entregues</CardTitle>
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {emailPerformance.delivered.toLocaleString('pt-BR')}
                  </div>
                  {emailPerformance.deliveryRate !== undefined && (
                    <p className="text-xs text-muted-foreground">
                      {emailPerformance.deliveryRate.toFixed(1)}% taxa de entrega
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {emailPerformance.openRate !== undefined && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Taxa de Abertura</CardTitle>
                  <MousePointer className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600">
                    {emailPerformance.openRate.toFixed(1)}%
                  </div>
                  {emailPerformance.opened !== undefined && (
                    <p className="text-xs text-muted-foreground">
                      {emailPerformance.opened.toLocaleString('pt-BR')} aberturas
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {emailPerformance.clickRate !== undefined && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Taxa de Clique</CardTitle>
                  <MousePointer className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {emailPerformance.clickRate.toFixed(1)}%
                  </div>
                  {emailPerformance.clicked !== undefined && (
                    <p className="text-xs text-muted-foreground">
                      {emailPerformance.clicked.toLocaleString('pt-BR')} cliques
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {emailPerformance.bounceRate !== undefined && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Taxa de Bounce</CardTitle>
                  <TrendingUp className="h-4 w-4 text-rose-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-rose-600">
                    {emailPerformance.bounceRate.toFixed(2)}%
                  </div>
                  {emailPerformance.bounced !== undefined && (
                    <p className="text-xs text-muted-foreground">
                      {emailPerformance.bounced.toLocaleString('pt-BR')} bounces
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Top Flows */}
      {reportData?.flows && reportData.flows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-500" />
              Top Flows
            </CardTitle>
            <CardDescription>Flows com maior receita no período</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {reportData.flows.slice(0, 5).map((flow, index) => (
                <div key={flow.id || index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0">
                      {index + 1}
                    </Badge>
                    <div>
                      <p className="font-medium">{flow.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {flow.recipients?.toLocaleString('pt-BR') || 0} destinatários
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-600">
                      {formatReportCurrency(flow.revenue || 0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {report.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
            <CardDescription>Notas e insights sobre o período</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{report.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Informações do Relatório</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sm text-muted-foreground">Cliente</dt>
              <dd className="font-medium">{clientData?.name || "N/A"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Loja</dt>
              <dd className="font-medium flex items-center gap-1">
                <Store className="h-3 w-3" />
                {report.store_name || "N/A"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Período</dt>
              <dd className="font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatPeriod(report)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Criado em</dt>
              <dd className="font-medium">{formatDate(report.created_at)}</dd>
            </div>
            {userData?.name && (
              <div>
                <dt className="text-sm text-muted-foreground">Criado por</dt>
                <dd className="font-medium">{userData.name}</dd>
              </div>
            )}
            {report.status && (
              <div>
                <dt className="text-sm text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={report.status === 'published' ? 'default' : 'secondary'}>
                    {report.status}
                  </Badge>
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
