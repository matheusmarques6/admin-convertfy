"use client"

import { useState, useEffect } from "react"
import {
  DollarSign,
  TrendingUp,
  Clock,
  AlertCircle,
  CreditCard,
  QrCode,
  FileText,
  Users,
  Repeat,
  RefreshCw,
  Calendar,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface BillingData {
  success: boolean
  connected: boolean
  period: string
  dateRange?: { from: string; to: string }
  summary: {
    received: number
    confirmed: number
    pending: number
    overdue: number
    refunded: number
    totalClients: number
    activeSubscriptions: number
  }
  byType: {
    PIX: number
    BOLETO: number
    CREDIT_CARD: number
  }
  counts: {
    total: number
    received: number
    pending: number
    overdue: number
  }
}

export function BillingMetrics() {
  const [period, setPeriod] = useState("month")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<BillingData | null>(null)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  async function loadData(customPeriod?: { start: string; end: string }) {
    setIsLoading(true)
    try {
      let url = `/api/integrations/asaas/billing?period=${period}`
      if (period === "custom" && customPeriod) {
        url += `&start_date=${customPeriod.start}&end_date=${customPeriod.end}`
      }
      const response = await fetch(url)
      const result = await response.json()
      if (result.success) {
        setData(result)
      }
    } catch (error) {
      console.error("Error loading billing:", error)
    } finally {
      setIsLoading(false)
    }
  }

  function handleCustomPeriod() {
    if (customStart && customEnd) {
      loadData({ start: customStart, end: customEnd })
    }
  }

  if (!data?.connected) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <DollarSign className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Conecte a Asaas</h3>
          <p className="text-muted-foreground text-center mt-1">
            Configure a integração com Asaas para ver métricas de faturamento
          </p>
          <Button variant="outline" className="mt-4" asChild>
            <a href="/settings/integrations">Configurar Integração</a>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-48">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="7days">Últimos 7 dias</SelectItem>
              <SelectItem value="month">Este mês</SelectItem>
              <SelectItem value="year">Este ano</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>

          {period === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Calendar className="h-4 w-4 mr-2" />
                  Definir período
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Data Início</Label>
                    <Input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Fim</Label>
                    <Input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleCustomPeriod} className="w-full">
                    Aplicar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}

          <Button variant="ghost" size="icon" onClick={() => loadData()} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
        </div>

        {data?.dateRange && (
          <p className="text-sm text-muted-foreground">
            {new Date(data.dateRange.from).toLocaleDateString("pt-BR")} - {new Date(data.dateRange.to).toLocaleDateString("pt-BR")}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Main Metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  Recebido
                </CardDescription>
                <CardTitle className="text-3xl text-emerald-600">
                  {formatCurrency(data?.summary.received || 0)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {data?.counts.received || 0} cobranças pagas
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Pendente
                </CardDescription>
                <CardTitle className="text-3xl text-amber-600">
                  {formatCurrency(data?.summary.pending || 0)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {data?.counts.pending || 0} cobranças a receber
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  Vencido
                </CardDescription>
                <CardTitle className="text-3xl text-red-600">
                  {formatCurrency(data?.summary.overdue || 0)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {data?.counts.overdue || 0} cobranças vencidas
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Total Período
                </CardDescription>
                <CardTitle className="text-3xl">
                  {formatCurrency((data?.summary.received || 0) + (data?.summary.pending || 0))}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {data?.counts.total || 0} cobranças no período
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Secondary Metrics */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Clientes Asaas</CardDescription>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-500" />
                  {data?.summary.totalClients || 0}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Assinaturas Ativas</CardDescription>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Repeat className="h-5 w-5 text-purple-500" />
                  {data?.summary.activeSubscriptions || 0}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Estornado</CardDescription>
                <CardTitle className="text-2xl flex items-center gap-2 text-gray-500">
                  {formatCurrency(data?.summary.refunded || 0)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* By Payment Type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Faturamento por Método</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="rounded-lg p-2 bg-green-500/10">
                    <QrCode className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">PIX</p>
                    <p className="text-lg font-semibold">{formatCurrency(data?.byType.PIX || 0)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="rounded-lg p-2 bg-blue-500/10">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Boleto</p>
                    <p className="text-lg font-semibold">{formatCurrency(data?.byType.BOLETO || 0)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="rounded-lg p-2 bg-purple-500/10">
                    <CreditCard className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cartão</p>
                    <p className="text-lg font-semibold">{formatCurrency(data?.byType.CREDIT_CARD || 0)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Overdue Alert */}
          {(data?.summary.overdue || 0) > 0 && (
            <Card className="border-red-500/50 bg-red-500/5">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="rounded-lg p-3 bg-red-500/10">
                  <AlertCircle className="h-6 w-6 text-red-500" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-red-600">Atenção: Cobranças Vencidas</p>
                  <p className="text-sm text-muted-foreground">
                    Você tem {data?.counts.overdue} cobranças vencidas totalizando {formatCurrency(data?.summary.overdue || 0)}
                  </p>
                </div>
                <Button variant="destructive" size="sm" asChild>
                  <a href="/clients?filter=overdue">Ver Inadimplentes</a>
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
