"use client"

import { useState, useRef } from "react"
import {
  TrendingUp,
  Users,
  Mail,
  DollarSign,
  Target,
  Download,
  Calendar,
  ArrowUpRight,
  BarChart3,
  PieChart,
  Loader2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"

interface PerformanceData {
  period: string
  storeName: string
  // Funnel metrics
  funnelLTV: { current: number; total: number }
  leadGrowth: number
  recurringCustomersRate: number
  // Engagement
  totalLeads: number
  engagedLeads: number
  // Financial
  totalRevenue: number
  averageTicket: number
  emailRevenue: number
  // Attribution
  trafficPercent: number
  emailPercent: number
  // Projections
  monthlyProjection: number
  emailMonthlyProjection: number
  conversionRate: number
  annualProjection: number
  emailAnnualProjection: number
}

interface KlaviyoPerformanceReportProps {
  storeName: string
  data?: PerformanceData
  onPeriodChange?: (period: string) => void
}

export function KlaviyoPerformanceReport({
  storeName,
  data,
  onPeriodChange
}: KlaviyoPerformanceReportProps) {
  const [selectedPeriod, setSelectedPeriod] = useState("last_30_days")
  const [isExporting, setIsExporting] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  // Demo data for visualization (would be replaced with real data)
  const reportData: PerformanceData = data || {
    period: "24/09 - 02/12",
    storeName: storeName,
    funnelLTV: { current: 27, total: 4 },
    leadGrowth: 11.20,
    recurringCustomersRate: 21.9,
    totalLeads: 31981,
    engagedLeads: 21377,
    totalRevenue: 400500,
    averageTicket: 174,
    emailRevenue: 183500,
    trafficPercent: 54.21,
    emailPercent: 45.79,
    monthlyProjection: 500000,
    emailMonthlyProjection: 150000,
    conversionRate: 30,
    annualProjection: 6000000,
    emailAnnualProjection: 1800000,
  }

  const handlePeriodChange = (value: string) => {
    setSelectedPeriod(value)
    onPeriodChange?.(value)
  }

  const handleExportPDF = async () => {
    setIsExporting(true)
    try {
      // Dynamic import for html2pdf
      const html2pdf = (await import("html2pdf.js")).default

      const element = reportRef.current
      if (!element) return

      const opt = {
        margin: 0.5,
        filename: `relatorio-${storeName}-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in' as const, format: 'a4' as const, orientation: 'portrait' as const }
      }

      await html2pdf().set(opt).from(element).save()
    } catch (error) {
      console.error("Error exporting PDF:", error)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-[200px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Selecione o período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_7_days">Últimos 7 dias</SelectItem>
              <SelectItem value="last_30_days">Últimos 30 dias</SelectItem>
              <SelectItem value="last_90_days">Últimos 90 dias</SelectItem>
              <SelectItem value="this_month">Este mês</SelectItem>
              <SelectItem value="last_month">Mês passado</SelectItem>
              <SelectItem value="this_quarter">Este trimestre</SelectItem>
              <SelectItem value="this_year">Este ano</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleExportPDF} disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Exportar PDF
        </Button>
      </div>

      {/* Report Content */}
      <div ref={reportRef} className="space-y-6 bg-background p-6 rounded-lg">
        {/* Report Header */}
        <div className="text-center pb-6 border-b">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <span key={star} className="text-yellow-400 text-lg">★</span>
              ))}
            </div>
          </div>
          <h1 className="text-3xl font-bold text-primary">{storeName.toUpperCase()}</h1>
          <p className="text-muted-foreground mt-1">
            {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}
          </p>
          <Badge variant="outline" className="mt-2">
            APRESENTAÇÃO DE RESULTADOS
          </Badge>
        </div>

        {/* Attention Banner */}
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-amber-500/20">
                <Target className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-amber-700">ATENÇÃO</h3>
                <p className="text-sm text-amber-600/80 mt-1">
                  A seguir, apresentamos os resultados do período de {reportData.period},
                  com o objetivo de fornecer uma análise mensal do crescimento.
                  A gestão desses resultados foi realizada pela Agência Convertfy.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Conversion by Funnel */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">CONVERSÃO INDIVIDUAL POR FUNIL</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Analisado entre os dias {reportData.period}
          </p>

          <div className="grid grid-cols-3 gap-4">
            {/* LTV Funnel */}
            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
              <CardContent className="p-6 text-center">
                <p className="text-xs text-slate-400 uppercase tracking-wider">Funil de LTV</p>
                <div className="my-4">
                  <div className="w-20 h-20 mx-auto rounded-full border-4 border-cyan-400 flex items-center justify-center">
                    <span className="text-2xl font-bold">
                      {reportData.funnelLTV.current}/{reportData.funnelLTV.total}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Lead Growth */}
            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
              <CardContent className="p-6 text-center">
                <p className="text-xs text-slate-400 uppercase tracking-wider">Crescimento de Leads</p>
                <div className="my-4">
                  <div className="w-20 h-20 mx-auto rounded-full border-4 border-emerald-400 flex items-center justify-center">
                    <span className="text-2xl font-bold text-emerald-400">
                      +{(reportData.leadGrowth || 0).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recurring Customers */}
            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
              <CardContent className="p-6 text-center">
                <p className="text-xs text-slate-400 uppercase tracking-wider">Taxa de Clientes Recorrentes</p>
                <div className="my-4">
                  <div className="w-20 h-20 mx-auto rounded-full border-4 border-purple-400 flex items-center justify-center">
                    <span className="text-2xl font-bold text-purple-400">
                      {(reportData.recurringCustomersRate || 0).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Leads vs Engaged */}
        <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-2 mb-6">
              <Users className="h-5 w-5 text-cyan-400" />
              <h2 className="text-lg font-semibold">LEADS X ENGAJADOS</h2>
            </div>
            <div className="flex items-center justify-center gap-16">
              <div className="text-center">
                <div className="flex items-center gap-2 justify-center">
                  <Users className="h-6 w-6 text-cyan-400" />
                  <span className="text-3xl font-bold">{(reportData.totalLeads || 0).toLocaleString()}</span>
                </div>
                <p className="text-sm text-slate-400 mt-1">Todos os Leads</p>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-2 justify-center">
                  <Mail className="h-6 w-6 text-emerald-400" />
                  <span className="text-3xl font-bold text-emerald-400">{(reportData.engagedLeads || 0).toLocaleString()}</span>
                </div>
                <p className="text-sm text-slate-400 mt-1">Engajados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Financial Results */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">RESULTADOS FINANCEIROS</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Faturamento {reportData.period}
          </p>

          <div className="grid grid-cols-3 gap-4">
            {/* Total Revenue */}
            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs text-slate-400 uppercase">Faturamento</span>
                </div>
                <p className="text-2xl font-bold text-emerald-400">
                  {formatCurrency(reportData.totalRevenue)}
                </p>
              </CardContent>
            </Card>

            {/* Average Ticket */}
            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs text-slate-400 uppercase">Ticket Médio</span>
                </div>
                <p className="text-2xl font-bold text-cyan-400">
                  {formatCurrency(reportData.averageTicket)}
                </p>
              </CardContent>
            </Card>

            {/* Email Revenue */}
            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="h-4 w-4 text-purple-400" />
                  <span className="text-xs text-slate-400 uppercase">Faturamento Email</span>
                </div>
                <p className="text-2xl font-bold text-purple-400">
                  {formatCurrency(reportData.emailRevenue)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Attribution Split */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <ArrowUpRight className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{reportData.trafficPercent}%</p>
                    <p className="text-xs text-slate-400">Tráfego</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <Mail className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{reportData.emailPercent}%</p>
                    <p className="text-xs text-slate-400">Email</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Projections */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">PROJEÇÃO DE FATURAMENTO</h2>
          </div>

          {/* Monthly Projection */}
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-slate-400">Mensal</span>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  Meta
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-4 rounded-lg bg-slate-800/50">
                  <DollarSign className="h-6 w-6 mx-auto mb-2 text-emerald-400" />
                  <p className="text-xl font-bold">{formatCurrency(reportData.monthlyProjection)}</p>
                  <p className="text-xs text-slate-400 mt-1">Mensal</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-slate-800/50">
                  <Mail className="h-6 w-6 mx-auto mb-2 text-purple-400" />
                  <p className="text-xl font-bold">{formatCurrency(reportData.emailMonthlyProjection)}</p>
                  <p className="text-xs text-slate-400 mt-1">Mensal</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-slate-800/50">
                  <PieChart className="h-6 w-6 mx-auto mb-2 text-cyan-400" />
                  <p className="text-xl font-bold">{reportData.conversionRate}%</p>
                  <p className="text-xs text-slate-400 mt-1">Conversão</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-slate-800/50">
                  <Target className="h-6 w-6 mx-auto mb-2 text-amber-400" />
                  <p className="text-xl font-bold">XXX</p>
                  <p className="text-xs text-slate-400 mt-1">Ticket Médio</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Annual Projection */}
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-slate-400">Anual</span>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
                  Projeção
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-4 rounded-lg bg-slate-800/50">
                  <DollarSign className="h-6 w-6 mx-auto mb-2 text-emerald-400" />
                  <p className="text-xl font-bold">{formatCurrency(reportData.annualProjection)}</p>
                  <p className="text-xs text-slate-400 mt-1">Anual</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-slate-800/50">
                  <Mail className="h-6 w-6 mx-auto mb-2 text-purple-400" />
                  <p className="text-xl font-bold">{formatCurrency(reportData.emailAnnualProjection)}</p>
                  <p className="text-xs text-slate-400 mt-1">Anual</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-slate-800/50">
                  <PieChart className="h-6 w-6 mx-auto mb-2 text-cyan-400" />
                  <p className="text-xl font-bold">{reportData.conversionRate}%</p>
                  <p className="text-xs text-slate-400 mt-1">Conversão</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-slate-800/50">
                  <Target className="h-6 w-6 mx-auto mb-2 text-amber-400" />
                  <p className="text-xl font-bold">XXX</p>
                  <p className="text-xs text-slate-400 mt-1">Ticket Médio</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center pt-6 border-t text-sm text-muted-foreground">
          <p>Relatório gerado automaticamente pela plataforma Convertfy</p>
          <p className="mt-1">{new Date().toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</p>
        </div>
      </div>
    </div>
  )
}
