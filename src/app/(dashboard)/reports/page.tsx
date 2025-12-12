import Link from "next/link"
import { Plus, FileText, Download, Eye, Calendar } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"

export const dynamic = "force-dynamic"

async function getReports() {
  const supabase = await createClient()

  const { data: reports } = await supabase
    .from("reports")
    .select(`
      *,
      client:clients (
        id,
        name,
        company
      ),
      user:profiles!reports_user_id_fkey (
        id,
        name
      )
    `)
    .order("month", { ascending: false })

  return reports || []
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

export default async function ReportsPage() {
  const reports = await getReports()

  // Group by month
  const groupedReports = reports.reduce((acc, report) => {
    if (!acc[report.month]) {
      acc[report.month] = []
    }
    acc[report.month].push(report)
    return acc
  }, {} as Record<string, typeof reports>)

  const sortedMonths = Object.keys(groupedReports).sort((a, b) => b.localeCompare(a))

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
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Relatório
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
              <p className="text-2xl font-bold">
                {groupedReports[sortedMonths[0]]?.length || 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg p-3 bg-amber-500/10">
              <FileText className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pendentes</p>
              <p className="text-2xl font-bold">3</p>
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
            <Button className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Criar Relatório
            </Button>
          </CardContent>
        </Card>
      ) : (
        sortedMonths.map((month) => (
          <Card key={month}>
            <CardHeader>
              <CardTitle className="text-base">{formatMonth(month)}</CardTitle>
              <CardDescription>
                {groupedReports[month].length} relatórios
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {groupedReports[month].map((report) => (
                  <Card key={report.id} className="bg-muted/50">
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="font-medium">{report.client?.name}</span>
                      </div>

                      {/* Metrics preview */}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {report.metrics?.revenue !== undefined && (
                          <div>
                            <p className="text-xs text-muted-foreground">Receita</p>
                            <p className="font-medium">
                              {formatCurrency(report.metrics.revenue)}
                            </p>
                          </div>
                        )}
                        {report.metrics?.roas !== undefined && (
                          <div>
                            <p className="text-xs text-muted-foreground">ROAS</p>
                            <p className="font-medium">{report.metrics.roas}x</p>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1">
                          <Eye className="mr-2 h-3 w-3" />
                          Ver
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
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
