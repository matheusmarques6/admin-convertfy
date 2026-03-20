"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import {
  Download,
  FileText,
  TrendingUp,
  ShoppingCart,
  MousePointer,
  DollarSign,
  Mail,
  Users,
  Store,
  Calendar,
  Zap,
  Pencil,
  Trash2,
  MoreHorizontal,
  CheckCircle,
  Clock,
  Send,
  Archive,
  Loader2,
  Copy,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { createClient } from "@/lib/supabase/client"
import { PageHeader } from "@/components/ui/page-header"
import { toast } from "@/lib/hooks/use-toast"
import { ROUTES } from "@/lib/routes"
import { formatDate } from "@/lib/utils"
import type { Report, ReportData, ReportStatus } from "@/types"

interface ReportWithRelations extends Report {
  client?: { id: string; name: string; company?: string; email?: string } | null
  user?: { id: string; name: string } | null
  store?: { id: string; store_name: string } | null
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

function getStatusBadge(status: ReportStatus | undefined) {
  switch (status) {
    case "draft":
      return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Rascunho</Badge>
    case "published":
      return <Badge variant="default"><CheckCircle className="mr-1 h-3 w-3" />Publicado</Badge>
    case "sent":
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30"><Send className="mr-1 h-3 w-3" />Enviado</Badge>
    case "archived":
      return <Badge variant="outline"><Archive className="mr-1 h-3 w-3" />Arquivado</Badge>
    default:
      return null
  }
}

export default function ReportPage() {
  const router = useRouter()
  const params = useParams()
  const reportId = params.id as string

  const [report, setReport] = useState<ReportWithRelations | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Load report
  useEffect(() => {
    async function loadReport() {
      setIsLoading(true)
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("client_reports")
          .select(`
            *,
            client:clients (id, name, company, email),
            user:profiles (id, name),
            store:client_stores (id, store_name)
          `)
          .eq("id", reportId)
          .single()

        if (error) throw error
        if (!data) {
          router.push("/admin/reports")
          return
        }

        setReport(data as ReportWithRelations)
      } catch (error) {
        console.error("Error loading report:", error)
        toast({
          variant: "destructive",
          title: "Erro ao carregar relatório",
          description: "Não foi possível carregar o relatório.",
        })
        router.push("/admin/reports")
      } finally {
        setIsLoading(false)
      }
    }

    loadReport()
  }, [reportId, router])

  // Update status
  async function updateStatus(newStatus: ReportStatus) {
    if (!report) return

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("client_reports")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", reportId)

      if (error) throw error

      setReport(prev => prev ? { ...prev, status: newStatus } : null)

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

  // Delete report
  async function handleDelete() {
    if (!report) return

    setIsDeleting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("client_reports")
        .delete()
        .eq("id", reportId)

      if (error) throw error

      toast({
        title: "Relatório excluído",
        description: "O relatório foi excluído com sucesso.",
      })
      router.push("/admin/reports")
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
    }
  }

  // Copy report link
  function copyReportLink() {
    const url = `${window.location.origin}/reports/${reportId}`
    navigator.clipboard.writeText(url)
    toast({
      title: "Link copiado",
      description: "O link do relatório foi copiado para a área de transferência.",
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!report) {
    return null
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
      <PageHeader
        title={`Relatório - ${report.store_name || clientData?.name}`}
        description={`${clientData?.name}${clientData?.company ? ` (${clientData.company})` : ''} • ${formatPeriod(report)}`}
        breadcrumb={[
          { label: "Relatórios", href: ROUTES.ADMIN.REPORTS.LIST },
          { label: report.store_name || clientData?.name || "Relatório" },
        ]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">
              <FileText className="h-3 w-3 mr-1" />
              {getReportTypeLabel(report.report_type)}
            </Badge>
            {getStatusBadge(report.status)}
            <Button variant="outline" size="sm" onClick={copyReportLink}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar Link
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/reports/${reportId}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </Link>
            </Button>
            {report.document_url && (
              <Button variant="outline" size="sm" asChild>
                <a href={report.document_url} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </a>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => updateStatus("draft")}
                  disabled={report.status === "draft"}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  Marcar como Rascunho
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateStatus("published")}
                  disabled={report.status === "published"}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Marcar como Publicado
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateStatus("sent")}
                  disabled={report.status === "sent"}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Marcar como Enviado
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateStatus("archived")}
                  disabled={report.status === "archived"}
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Arquivar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteDialogOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Revenue Metrics */}
      {revenue && (
        <>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            Métricas de Receita
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {(() => {
              const displayRevenue = revenue.storeRevenue ?? revenue.totalRevenue
              return displayRevenue !== undefined ? (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Faturamento Total</CardTitle>
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {formatReportCurrency(displayRevenue)}
                  </div>
                </CardContent>
              </Card>
              ) : null
            })()}

            {revenue.klaviyoAttributedRevenue !== undefined && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Receita Klaviyo</CardTitle>
                  <Mail className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
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
                  <Zap className="h-4 w-4 text-primary" />
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
            <Mail className="h-5 w-5 text-primary" />
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
                  <div className="text-2xl font-bold text-foreground">
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
                  <div className="text-2xl font-bold text-blue-500">
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
                  <TrendingUp className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
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
        <Card className="rounded-xl border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
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
                    <p className="font-bold text-emerald-500">
                      {formatReportCurrency(flow.revenue || 0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Campaigns */}
      {reportData?.campaigns && reportData.campaigns.length > 0 && (
        <Card className="rounded-xl border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-500" />
              Top Campanhas
            </CardTitle>
            <CardDescription>Campanhas com maior receita no período</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {reportData.campaigns.slice(0, 5).map((campaign, index) => (
                <div key={campaign.id || index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0">
                      {index + 1}
                    </Badge>
                    <div>
                      <p className="font-medium">{campaign.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {campaign.openRate?.toFixed(1)}% abertura • {campaign.clickRate?.toFixed(1)}% clique
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-500">
                      {formatReportCurrency(campaign.revenue || 0)}
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
        <Card className="rounded-xl border bg-card">
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
      <Card className="rounded-xl border bg-card">
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
            {report.updated_at && (
              <div>
                <dt className="text-sm text-muted-foreground">Atualizado em</dt>
                <dd className="font-medium">{formatDate(report.updated_at)}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir relatório?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O relatório{" "}
              <strong>{report.store_name || report.client?.name}</strong>{" "}
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
