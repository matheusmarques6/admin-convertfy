"use client"

import { useState, useEffect, useRef } from "react"
import {
  Plus,
  FileText,
  Download,
  Eye,
  Loader2,
  Calendar,
  Trash2,
  Store,
  BarChart3,
  Mail,
  DollarSign,
  X,
  GitCompare,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  TrendingUp,
  Users,
  MousePointerClick,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Calendar as CalendarWidget } from "@/components/ui/calendar"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { DateRange } from "react-day-picker"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { KlaviyoPerformanceReport } from "./klaviyo-performance-report"
import { RecoveryAnalysis } from "./recovery-analysis"

interface ClientReportsProps {
  clientId: string
}

interface ClientStore {
  id: string
  store_name: string
  klaviyo_private_key?: string
  klaviyo_api_key?: string
  shopify_store_domain?: string
  shopify_access_token?: string
}

interface SavedReport {
  id: string
  client_id: string
  store_id: string
  store_name: string
  report_type: string
  period: string
  date_range: {
    start: string
    end: string
  }
  report_data: Record<string, unknown>
  created_at: string
}

const formatCurrencyWithCode = (value: number | undefined | null, currency: string = 'BRL', locale: string = 'pt-BR') => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(num)
  } catch {
    return `${currency} ${num.toFixed(2)}`
  }
}

export function ClientReports({ clientId }: ClientReportsProps) {
  const [stores, setStores] = useState<ClientStore[]>([])
  const [shopifyStores, setShopifyStores] = useState<Array<{ id: string; store_name: string }>>([])
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [isLoadingStores, setIsLoadingStores] = useState(true)
  const [isLoadingReports, setIsLoadingReports] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [viewingReport, setViewingReport] = useState<SavedReport | null>(null)
  const [showCompareDialog, setShowCompareDialog] = useState(false)
  const [compareReport1, setCompareReport1] = useState<string>("")
  const [compareReport2, setCompareReport2] = useState<string>("")
  const [showCompareResults, setShowCompareResults] = useState(false)

  // Form state for creating report
  const [selectedStore, setSelectedStore] = useState<string>("")
  const [selectedPeriod, setSelectedPeriod] = useState<string>("30d")
  const [reportType, setReportType] = useState<string>("klaviyo")
  const [customStartDate, setCustomStartDate] = useState<string>("")
  const [customEndDate, setCustomEndDate] = useState<string>("")
  const [customRange, setCustomRange] = useState<DateRange | undefined>()

  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadStores()
    loadSavedReports()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function loadStores() {
    setIsLoadingStores(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("client_stores")
        .select("id, store_name, klaviyo_private_key, klaviyo_api_key, shopify_store_domain, shopify_access_token")
        .eq("client_id", clientId)
        .order("store_name")

      if (error) throw error

      const allStores = data || []

      // Filter stores with Klaviyo configured
      const klaviyoStores = allStores.filter(s => s.klaviyo_private_key || s.klaviyo_api_key)
      setStores(klaviyoStores)

      // Filter stores with Shopify configured
      const shopifyConfigured = allStores
        .filter(s => s.shopify_store_domain && s.shopify_access_token)
        .map(s => ({ id: s.id, store_name: s.store_name }))
      setShopifyStores(shopifyConfigured)

      if (klaviyoStores.length > 0) {
        setSelectedStore(klaviyoStores[0].id)
      }
    } catch (error) {
      console.error("Error loading stores:", error)
    } finally {
      setIsLoadingStores(false)
    }
  }

  async function loadSavedReports() {
    setIsLoadingReports(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("client_reports")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })

      if (error) {
        // Table might not exist yet
        console.warn("Error loading reports:", error)
        setSavedReports([])
      } else {
        setSavedReports(data || [])
      }
    } catch (error) {
      console.error("Error loading reports:", error)
      setSavedReports([])
    } finally {
      setIsLoadingReports(false)
    }
  }

  async function createReport() {
    if (!selectedStore) {
      toast({
        variant: "destructive",
        title: "Selecione uma loja",
        description: "É necessário selecionar uma loja para gerar o relatório.",
      })
      return
    }

    // Validate custom date range
    if (selectedPeriod === "custom") {
      if (!customStartDate || !customEndDate) {
        toast({
          variant: "destructive",
          title: "Datas obrigatórias",
          description: "Selecione as datas de início e fim do período.",
        })
        return
      }
      if (new Date(customStartDate) > new Date(customEndDate)) {
        toast({
          variant: "destructive",
          title: "Datas inválidas",
          description: "A data de início deve ser anterior à data de fim.",
        })
        return
      }
    }

    setIsCreating(true)
    try {
      // Build API URL with custom dates if needed
      let apiUrl = `/api/integrations/klaviyo/report?store_id=${selectedStore}&period=${selectedPeriod}`
      if (selectedPeriod === "custom" && customStartDate && customEndDate) {
        apiUrl += `&start_date=${customStartDate}&end_date=${customEndDate}`
      }

      // Create abort controller for timeout (3 minutes for report generation)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 180000)

      // Fetch report data from Klaviyo
      const res = await fetch(apiUrl, { signal: controller.signal })
      clearTimeout(timeoutId)
      const reportData = await res.json()

      if (!reportData.success) {
        throw new Error(reportData.error || "Erro ao gerar relatório")
      }

      // Handle rate-limited response with no cache
      if (reportData.rateLimited && reportData.error === "rate_limited_no_cache") {
        toast({
          variant: "destructive",
          title: "Klaviyo temporariamente limitada",
          description: reportData.message || "Tente novamente em alguns minutos.",
        })
        setIsCreating(false)
        return
      }

      // Block saving partial/stale data from rate-limited cache
      if (reportData.rateLimited && reportData.partial) {
        toast({
          variant: "destructive",
          title: "Dados parciais - não é possível salvar",
          description: "O relatório contém dados incompletos do cache devido a rate-limit da Klaviyo. Tente novamente em alguns minutos para obter dados completos.",
        })
        setIsCreating(false)
        return
      }

      // Get store name
      const store = stores.find(s => s.id === selectedStore)

      // Calculate date range
      const now = new Date()
      let startDate: Date
      let endDate: Date = now

      if (selectedPeriod === "custom" && customStartDate && customEndDate) {
        startDate = new Date(customStartDate)
        endDate = new Date(customEndDate)
      } else {
        switch (selectedPeriod) {
          case "7d":
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            break
          case "30d":
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            break
          case "90d":
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
            break
          default:
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        }
      }

      // Save to database via API
      const saveRes = await fetch("/api/client-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          store_id: selectedStore,
          store_name: store?.store_name || "Loja",
          report_type: reportType,
          period: selectedPeriod,
          date_range: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
          report_data: reportData,
        }),
      })
      const result = await saveRes.json()
      if (!saveRes.ok) throw new Error(result.error || "Erro ao salvar relatório")
      const newReport = result.data.report

      toast({
        title: "Relatório criado!",
        description: "O relatório foi salvo com sucesso.",
      })

      setSavedReports([newReport, ...savedReports])
      setShowCreateDialog(false)
    } catch (error) {
      console.error("Error creating report:", error)
      let errorMessage = "Tente novamente mais tarde."
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = "Tempo limite excedido. O relatório está demorando muito para ser gerado. Tente um período menor."
        } else {
          errorMessage = error.message
        }
      }
      toast({
        variant: "destructive",
        title: "Erro ao criar relatório",
        description: errorMessage,
      })
    } finally {
      setIsCreating(false)
    }
  }

  async function deleteReport(reportId: string) {
    try {
      const res = await fetch(`/api/client-reports?id=${reportId}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao excluir relatório")
      }

      setSavedReports(savedReports.filter(r => r.id !== reportId))
      toast({
        title: "Relatório excluído",
        description: "O relatório foi removido com sucesso.",
      })
    } catch (error) {
      console.error("Error deleting report:", error)
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: "Não foi possível excluir o relatório.",
      })
    }
  }

  const handleExportPDF = async () => {
    if (!viewingReport) return

    try {
      const html2pdf = (await import("html2pdf.js")).default

      const element = reportRef.current
      if (!element) return

      const opt = {
        margin: 0.3,
        filename: `relatorio-${viewingReport.store_name}-${new Date(viewingReport.created_at).toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'in' as const, format: 'a4' as const, orientation: 'portrait' as const }
      }

      await html2pdf().set(opt).from(element).save()
    } catch (error) {
      console.error("Error exporting PDF:", error)
    }
  }

  // Parse date string without timezone conversion (handles YYYY-MM-DD and ISO formats)
  const parseDateString = (dateStr: string) => {
    const parts = dateStr.split('T')[0].split('-')
    return {
      year: parseInt(parts[0]),
      month: parseInt(parts[1]),
      day: parseInt(parts[2])
    }
  }

  const getPeriodLabel = (period: string, dateRange?: { start: string; end: string }) => {
    // Always show actual dates if available (matches Klaviyo dashboard format)
    // Parse without timezone conversion to avoid date shift issues
    if (dateRange?.start && dateRange?.end) {
      const start = parseDateString(dateRange.start)
      const end = parseDateString(dateRange.end)
      const formatDate = (d: { day: number; month: number; year: number }) =>
        `${d.day.toString().padStart(2, '0')}/${d.month.toString().padStart(2, '0')}/${d.year}`
      return `${formatDate(start)} - ${formatDate(end)}`
    }

    // Fallback to period labels if no dates available
    switch (period) {
      case "7d": return "Últimos 7 dias"
      case "30d": return "Últimos 30 dias"
      case "90d": return "Últimos 90 dias"
      case "all": return "Últimos 12 meses"
      case "custom": return "Personalizado"
      default: return period
    }
  }

  // Helper to get currency from report data
  const getReportCurrency = (report: SavedReport) => {
    const data = report.report_data as { account?: { currency?: string; locale?: string } }
    return {
      currency: data?.account?.currency || 'BRL',
      locale: data?.account?.locale || 'pt-BR',
    }
  }

  const formatReportDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Comparison helpers
  const getComparisonData = () => {
    const report1 = savedReports.find(r => r.id === compareReport1)
    const report2 = savedReports.find(r => r.id === compareReport2)
    if (!report1 || !report2) return null

    const data1 = report1.report_data as Record<string, Record<string, number>>
    const data2 = report2.report_data as Record<string, Record<string, number>>
    const { currency: currency1, locale: locale1 } = getReportCurrency(report1)

    const calcChange = (v1: number | undefined, v2: number | undefined) => {
      const val1 = v1 || 0
      const val2 = v2 || 0
      if (val2 === 0) return val1 > 0 ? 100 : 0
      return ((val1 - val2) / val2) * 100
    }

    return {
      report1,
      report2,
      currency: currency1,
      locale: locale1,
      metrics: {
        revenue: {
          label: "Receita Klaviyo",
          value1: data1?.revenue?.klaviyoAttributedRevenue || 0,
          value2: data2?.revenue?.klaviyoAttributedRevenue || 0,
          change: calcChange(data1?.revenue?.klaviyoAttributedRevenue, data2?.revenue?.klaviyoAttributedRevenue),
          format: "currency",
        },
        totalRevenue: {
          label: "Faturamento Total",
          value1: data1?.revenue?.totalRevenue || 0,
          value2: data2?.revenue?.totalRevenue || 0,
          change: calcChange(data1?.revenue?.totalRevenue, data2?.revenue?.totalRevenue),
          format: "currency",
        },
        orders: {
          label: "Pedidos",
          value1: data1?.revenue?.totalOrders || 0,
          value2: data2?.revenue?.totalOrders || 0,
          change: calcChange(data1?.revenue?.totalOrders, data2?.revenue?.totalOrders),
          format: "number",
        },
        avgOrderValue: {
          label: "Ticket Médio",
          value1: data1?.revenue?.averageOrderValue || 0,
          value2: data2?.revenue?.averageOrderValue || 0,
          change: calcChange(data1?.revenue?.averageOrderValue, data2?.revenue?.averageOrderValue),
          format: "currency",
        },
        subscribers: {
          label: "Contatos",
          value1: data1?.overview?.totalSubscribers || 0,
          value2: data2?.overview?.totalSubscribers || 0,
          change: calcChange(data1?.overview?.totalSubscribers, data2?.overview?.totalSubscribers),
          format: "number",
        },
        openRate: {
          label: "Taxa de Abertura",
          value1: data1?.emailPerformance?.openRate || 0,
          value2: data2?.emailPerformance?.openRate || 0,
          change: calcChange(data1?.emailPerformance?.openRate, data2?.emailPerformance?.openRate),
          format: "percent",
        },
        clickRate: {
          label: "Taxa de Clique",
          value1: data1?.emailPerformance?.clickRate || 0,
          value2: data2?.emailPerformance?.clickRate || 0,
          change: calcChange(data1?.emailPerformance?.clickRate, data2?.emailPerformance?.clickRate),
          format: "percent",
        },
        delivered: {
          label: "Emails Entregues",
          value1: data1?.emailPerformance?.delivered || 0,
          value2: data2?.emailPerformance?.delivered || 0,
          change: calcChange(data1?.emailPerformance?.delivered, data2?.emailPerformance?.delivered),
          format: "number",
        },
      },
    }
  }

  const formatComparisonValue = (value: number, format: string, currency: string, locale: string) => {
    switch (format) {
      case "currency":
        return formatCurrencyWithCode(value, currency, locale)
      case "percent":
        return `${value.toFixed(1)}%`
      case "number":
      default:
        return value.toLocaleString('pt-BR')
    }
  }

  const handleStartComparison = () => {
    if (compareReport1 && compareReport2 && compareReport1 !== compareReport2) {
      setShowCompareDialog(false)
      setShowCompareResults(true)
    }
  }

  if (isLoadingStores || isLoadingReports) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Tabs defaultValue="reports" className="space-y-6">
      <div className="flex justify-between items-center">
        <TabsList>
          <TabsTrigger value="reports">Relatórios</TabsTrigger>
          <TabsTrigger value="recovery" disabled={shopifyStores.length === 0}>
            Recuperação de Vendas
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          {savedReports.length >= 2 && (
            <Button variant="secondary" onClick={() => setShowCompareDialog(true)}>
              <GitCompare className="mr-2 h-4 w-4" />
              Comparar
            </Button>
          )}
          <Button onClick={() => setShowCreateDialog(true)} disabled={stores.length === 0}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Relatório
          </Button>
        </div>
      </div>

      <TabsContent value="reports" className="space-y-6">

      {/* No stores warning */}
      {stores.length === 0 && (
        <Card className="border-warning/50 bg-warning/10">
          <CardContent className="flex items-start gap-3 py-4">
            <Store className="h-5 w-5 text-warning mt-0.5" />
            <div>
              <p className="font-medium text-warning">Configure uma loja</p>
              <p className="text-sm text-muted-foreground">
                Para criar relatórios, configure a API do Klaviyo em pelo menos uma loja.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reports Grid */}
      {savedReports.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground mb-4">
              Nenhum relatório criado ainda
            </p>
            {stores.length > 0 && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeiro Relatório
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {savedReports.map((report) => {
            const data = report.report_data as Record<string, unknown>
            const revenue = data?.revenue as Record<string, number> | undefined
            const overview = data?.overview as Record<string, number> | undefined
            const { currency, locale } = getReportCurrency(report)

            return (
              <Card key={report.id} className="rounded-xl border bg-card">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      {report.store_name}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteReport(report.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <CardDescription className="flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    {formatReportDate(report.created_at)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Period Badge */}
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral">
                      {getPeriodLabel(report.period, report.date_range)}
                    </Badge>
                    <Badge variant="neutral" showDot={false} className="capitalize">
                      {report.report_type}
                    </Badge>
                  </div>

                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    {revenue?.klaviyoAttributedRevenue !== undefined && (
                      <div className="p-2 rounded-lg bg-success/10">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          Receita Klaviyo
                        </p>
                        <p className="text-sm font-bold text-success">
                          {formatCurrencyWithCode(revenue.klaviyoAttributedRevenue, currency, locale)}
                        </p>
                      </div>
                    )}
                    {overview?.totalSubscribers !== undefined && (
                      <div className="p-2 rounded-lg bg-info/10">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          Contatos
                        </p>
                        <p className="text-sm font-bold text-info">
                          {overview.totalSubscribers?.toLocaleString() || 0}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => setViewingReport(report)}
                    >
                      <Eye className="mr-2 h-3 w-3" />
                      Ver
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create Report Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Relatório</DialogTitle>
            <DialogDescription>
              Configure as opções para gerar o relatório
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Store Selection */}
            <div className="space-y-2">
              <Label>Loja</Label>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma loja" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Report Type */}
            <div className="space-y-2">
              <Label>Tipo de Relatório</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="klaviyo">Klaviyo - Email Marketing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Period */}
            <div className="space-y-2">
              <Label>Período</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="90d">Últimos 90 dias</SelectItem>
                  <SelectItem value="all">Últimos 12 meses</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Date Range */}
            {selectedPeriod === "custom" && (
              <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Período Personalizado
                  {customRange?.from && customRange?.to && (
                    <span className="text-xs text-muted-foreground font-normal ml-2">
                      {format(customRange.from, "dd/MM/yy", { locale: ptBR })} — {format(customRange.to, "dd/MM/yy", { locale: ptBR })}
                    </span>
                  )}
                </Label>
                <CalendarWidget
                  mode="range"
                  selected={customRange}
                  onSelect={(range) => {
                    setCustomRange(range)
                    if (range?.from) setCustomStartDate(format(range.from, "yyyy-MM-dd"))
                    if (range?.to) setCustomEndDate(format(range.to, "yyyy-MM-dd"))
                  }}
                  numberOfMonths={2}
                  locale={ptBR}
                  disabled={{ after: new Date() }}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={createReport} disabled={isCreating || !selectedStore}>
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gerar Relatório
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Report Dialog */}
      <Dialog open={!!viewingReport} onOpenChange={(open) => !open && setViewingReport(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Relatório - {viewingReport?.store_name}
                </DialogTitle>
                <DialogDescription>
                  Gerado em {viewingReport ? formatReportDate(viewingReport.created_at) : ""}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleExportPDF}>
                  <Download className="mr-2 h-4 w-4" />
                  Exportar PDF
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setViewingReport(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          {viewingReport && (
            <div ref={reportRef}>
              <KlaviyoPerformanceReport
                storeId={viewingReport.store_id}
                storeName={viewingReport.store_name}
                savedReportData={viewingReport.report_data as unknown as Parameters<typeof KlaviyoPerformanceReport>[0]['savedReportData']}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Compare Reports Selection Dialog */}
      <Dialog open={showCompareDialog} onOpenChange={setShowCompareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5 text-primary" />
              Comparar Relatórios
            </DialogTitle>
            <DialogDescription>
              Selecione dois relatórios para comparar side-by-side
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Relatório Base (mais antigo)</Label>
              <Select value={compareReport1} onValueChange={setCompareReport1}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o primeiro relatório" />
                </SelectTrigger>
                <SelectContent>
                  {savedReports.map((report) => (
                    <SelectItem
                      key={report.id}
                      value={report.id}
                      disabled={report.id === compareReport2}
                    >
                      {report.store_name} - {getPeriodLabel(report.period, report.date_range)} ({formatReportDate(report.created_at)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Relatório de Comparação (mais recente)</Label>
              <Select value={compareReport2} onValueChange={setCompareReport2}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o segundo relatório" />
                </SelectTrigger>
                <SelectContent>
                  {savedReports.map((report) => (
                    <SelectItem
                      key={report.id}
                      value={report.id}
                      disabled={report.id === compareReport1}
                    >
                      {report.store_name} - {getPeriodLabel(report.period, report.date_range)} ({formatReportDate(report.created_at)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCompareDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleStartComparison}
              disabled={!compareReport1 || !compareReport2 || compareReport1 === compareReport2}
            >
              <GitCompare className="mr-2 h-4 w-4" />
              Comparar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compare Results Dialog */}
      <Dialog open={showCompareResults} onOpenChange={setShowCompareResults}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <GitCompare className="h-5 w-5 text-primary" />
                  Comparativo de Relatórios
                </DialogTitle>
                <DialogDescription>
                  Análise comparativa de performance entre períodos
                </DialogDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowCompareResults(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>

          {(() => {
            const comparisonData = getComparisonData()
            if (!comparisonData) return <p className="text-muted-foreground">Selecione dois relatórios válidos</p>

            const { report1, report2, currency, locale, metrics } = comparisonData

            return (
              <div className="space-y-6">
                {/* Period Headers */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="font-medium text-muted-foreground">Métrica</div>
                  <div className="text-center">
                    <Badge variant="neutral" showDot={false} className="mb-1">Base</Badge>
                    <p className="text-sm font-medium">{report1.store_name}</p>
                    <p className="text-xs text-muted-foreground">{getPeriodLabel(report1.period, report1.date_range)}</p>
                  </div>
                  <div className="text-center">
                    <Badge variant="neutral" className="mb-1">Comparação</Badge>
                    <p className="text-sm font-medium">{report2.store_name}</p>
                    <p className="text-xs text-muted-foreground">{getPeriodLabel(report2.period, report2.date_range)}</p>
                  </div>
                </div>

                {/* Metrics Comparison */}
                <div className="space-y-2">
                  {Object.entries(metrics).map(([key, metric]) => {
                    const isPositive = metric.change > 0
                    const isNeutral = metric.change === 0

                    return (
                      <Card key={key} className="bg-muted/30">
                        <CardContent className="py-3">
                          <div className="grid grid-cols-3 gap-4 items-center">
                            <div className="flex items-center gap-2">
                              {key === 'revenue' || key === 'totalRevenue' || key === 'avgOrderValue' ? (
                                <DollarSign className="h-4 w-4 text-success" />
                              ) : key === 'subscribers' ? (
                                <Users className="h-4 w-4 text-info" />
                              ) : key === 'openRate' || key === 'clickRate' ? (
                                <MousePointerClick className="h-4 w-4 text-primary" />
                              ) : key === 'orders' ? (
                                <TrendingUp className="h-4 w-4 text-warning" />
                              ) : (
                                <Mail className="h-4 w-4 text-info" />
                              )}
                              <span className="font-medium text-sm">{metric.label}</span>
                            </div>
                            <div className="text-center">
                              <p className="font-bold text-lg">
                                {formatComparisonValue(metric.value1, metric.format, currency, locale)}
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="font-bold text-lg">
                                {formatComparisonValue(metric.value2, metric.format, currency, locale)}
                              </p>
                              <div className={`flex items-center justify-center gap-1 text-sm ${
                                isNeutral ? 'text-muted-foreground' :
                                isPositive ? 'text-success' : 'text-destructive'
                              }`}>
                                {isNeutral ? (
                                  <Minus className="h-3 w-3" />
                                ) : isPositive ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                  <ArrowDownRight className="h-3 w-3" />
                                )}
                                <span>{isNeutral ? '0%' : `${isPositive ? '+' : ''}${metric.change.toFixed(1)}%`}</span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>

                {/* Summary */}
                <Card className="rounded-xl border bg-card text-foreground">
                  <CardContent className="py-4">
                    <h4 className="font-medium mb-3">Resumo da Comparação</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-2 rounded-lg bg-white/10">
                        <p className="text-xs text-muted-foreground">Receita Klaviyo</p>
                        <p className={`text-lg font-bold ${metrics.revenue.change >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {metrics.revenue.change >= 0 ? '+' : ''}{metrics.revenue.change.toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-white/10">
                        <p className="text-xs text-muted-foreground">Pedidos</p>
                        <p className={`text-lg font-bold ${metrics.orders.change >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {metrics.orders.change >= 0 ? '+' : ''}{metrics.orders.change.toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-white/10">
                        <p className="text-xs text-muted-foreground">Taxa Abertura</p>
                        <p className={`text-lg font-bold ${metrics.openRate.change >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {metrics.openRate.change >= 0 ? '+' : ''}{metrics.openRate.change.toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-white/10">
                        <p className="text-xs text-muted-foreground">Taxa Clique</p>
                        <p className={`text-lg font-bold ${metrics.clickRate.change >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {metrics.clickRate.change >= 0 ? '+' : ''}{metrics.clickRate.change.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
      </TabsContent>

      <TabsContent value="recovery">
        {shopifyStores.length > 0 ? (
          <RecoveryAnalysis
            stores={shopifyStores}
            selectedStoreId={shopifyStores[0].id}
          />
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Store className="h-8 w-8 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Configure a integração Shopify em pelo menos uma loja para usar esta análise.
              </p>
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  )
}
