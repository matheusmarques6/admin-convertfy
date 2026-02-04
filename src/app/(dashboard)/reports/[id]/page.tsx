import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Download, Edit, FileText, TrendingUp, ShoppingCart, MousePointer, DollarSign, Mail } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate } from "@/lib/utils"

interface ReportPageProps {
  params: Promise<{ id: string }>
}

async function getReport(id: string) {
  const supabase = await createClient()

  const { data: report } = await supabase
    .from("reports")
    .select(`
      *,
      client:clients (
        id,
        name,
        company,
        email
      ),
      user:profiles!reports_user_id_fkey (
        id,
        name
      )
    `)
    .eq("id", id)
    .single()

  return report
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

export default async function ReportPage({ params }: ReportPageProps) {
  const { id } = await params
  const report = await getReport(id)

  if (!report) {
    notFound()
  }

  const metrics = report.metrics as {
    revenue?: number
    orders?: number
    conversion_rate?: number
    ad_spend?: number
    roas?: number
    email_revenue?: number
  } | null

  const clientData = report.client as { id: string; name: string; company?: string; email?: string } | null
  const userData = report.user as { id: string; name: string } | null

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
                Relatório - {formatMonth(report.month)}
              </h1>
              <Badge variant="outline">
                <FileText className="h-3 w-3 mr-1" />
                Relatório Mensal
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Cliente: {clientData?.name}
              {clientData?.company && ` (${clientData.company})`}
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
          <Button variant="outline" asChild>
            <Link href={`/reports/${id}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {metrics?.revenue !== undefined && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(metrics.revenue)}</div>
            </CardContent>
          </Card>
        )}

        {metrics?.orders !== undefined && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pedidos</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.orders}</div>
            </CardContent>
          </Card>
        )}

        {metrics?.conversion_rate !== undefined && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
              <MousePointer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.conversion_rate}%</div>
            </CardContent>
          </Card>
        )}

        {metrics?.ad_spend !== undefined && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Investimento em Ads</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(metrics.ad_spend)}</div>
            </CardContent>
          </Card>
        )}

        {metrics?.roas !== undefined && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">ROAS</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.roas}x</div>
            </CardContent>
          </Card>
        )}

        {metrics?.email_revenue !== undefined && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Receita de E-mail</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(metrics.email_revenue)}</div>
            </CardContent>
          </Card>
        )}
      </div>

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
          <CardTitle>Informações</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 md:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Criado por</dt>
              <dd className="font-medium">{userData?.name || "N/A"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Data de criação</dt>
              <dd className="font-medium">{formatDate(report.created_at)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Cliente</dt>
              <dd className="font-medium">{clientData?.name || "N/A"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Período</dt>
              <dd className="font-medium">{formatMonth(report.month)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
