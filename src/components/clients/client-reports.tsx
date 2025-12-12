"use client"

import { Plus, FileText, Download, Eye } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"
import type { Report } from "@/types"

interface ClientReportsProps {
  reports: Report[]
  clientId: string
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

export function ClientReports({ reports, clientId: _clientId }: ClientReportsProps) {
  const sortedReports = [...reports].sort((a, b) => b.month.localeCompare(a.month))

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex justify-end">
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Relatório
        </Button>
      </div>

      {/* Reports Grid */}
      {sortedReports.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground mb-4">
              Nenhum relatório enviado ainda
            </p>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Criar Primeiro Relatório
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sortedReports.map((report) => (
            <Card key={report.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  {formatMonth(report.month)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Metrics Summary */}
                <div className="grid grid-cols-2 gap-3">
                  {report.metrics?.revenue !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Receita</p>
                      <p className="text-sm font-medium">
                        {formatCurrency(report.metrics.revenue)}
                      </p>
                    </div>
                  )}
                  {report.metrics?.orders !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Pedidos</p>
                      <p className="text-sm font-medium">{report.metrics.orders}</p>
                    </div>
                  )}
                  {report.metrics?.roas !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">ROAS</p>
                      <p className="text-sm font-medium">{report.metrics.roas}x</p>
                    </div>
                  )}
                  {report.metrics?.ad_spend !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Investimento</p>
                      <p className="text-sm font-medium">
                        {formatCurrency(report.metrics.ad_spend)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Eye className="mr-2 h-3 w-3" />
                    Ver
                  </Button>
                  {report.document_url && (
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={report.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Download className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
