"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
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
import { GlowCard } from "@/components/ui/glow-card"

interface BillingData {
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

interface BillingMetricsProps {
  mrr?: number
}

export function BillingMetrics({ mrr = 0 }: BillingMetricsProps) {
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
      if (response.ok) {
        const result = await response.json()
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

  // Show loading state first
  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="h-10 w-48 bg-muted animate-pulse rounded-md" />
          <div className="h-10 w-10 bg-muted animate-pulse rounded-md" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="h-32 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // Show connect message only after loading completes and we know it's not connected
  if (data && !data.connected) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <DollarSign className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Conecte a Asaas</h3>
          <p className="text-muted-foreground text-center mt-1">
            Configure a integração com Asaas para ver métricas de faturamento
          </p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/settings/integrations">Configurar Integração</Link>
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <GlowCard color="success" intensity="intense" surfaceClassName="p-6">
              <CardDescription className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-success" />
                Recebido
              </CardDescription>
              <CardTitle className="text-3xl text-success text-glow-success mt-2">
                {formatCurrency(data?.summary.received || 0)}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                {data?.counts.received || 0} cobranças pagas
              </p>
            </GlowCard>

            <GlowCard color="warning" intensity="intense" surfaceClassName="p-6">
              <CardDescription className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning" />
                Pendente
              </CardDescription>
              <CardTitle className="text-3xl text-warning text-glow-warning mt-2">
                {formatCurrency(data?.summary.pending || 0)}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                {data?.counts.pending || 0} cobranças a receber
              </p>
            </GlowCard>

            <GlowCard color="destructive" intensity="intense" surfaceClassName="p-6">
              <CardDescription className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                Vencido
              </CardDescription>
              <CardTitle className="text-3xl text-destructive text-glow-destructive mt-2">
                {formatCurrency(data?.summary.overdue || 0)}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                {data?.counts.overdue || 0} cobranças vencidas
              </p>
            </GlowCard>

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

            <GlowCard color="mrr" intensity="intense" surfaceClassName="p-6 gradient-accent-border">
              <CardDescription className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-primary" />
                MRR
              </CardDescription>
              <CardTitle className="text-3xl text-primary text-glow-mrr mt-2">
                {formatCurrency(mrr)}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Receita recorrente mensal
              </p>
            </GlowCard>
          </div>

          {/* Secondary Metrics */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Clientes Asaas</CardDescription>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  {data?.summary.totalClients || 0}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Assinaturas Ativas</CardDescription>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Repeat className="h-5 w-5 text-primary" />
                  {data?.summary.activeSubscriptions || 0}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Estornado</CardDescription>
                <CardTitle className="text-2xl flex items-center gap-2 text-muted-foreground">
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
                  <div className="rounded-lg p-2 bg-success/10">
                    <QrCode className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">PIX</p>
                    <p className="text-lg font-semibold">{formatCurrency(data?.byType.PIX || 0)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="rounded-lg p-2 bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Boleto</p>
                    <p className="text-lg font-semibold">{formatCurrency(data?.byType.BOLETO || 0)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="rounded-lg p-2 bg-warning/10">
                    <CreditCard className="h-5 w-5 text-warning" />
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
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="rounded-lg p-3 bg-destructive/10">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-destructive">Atenção: Cobranças Vencidas</p>
                  <p className="text-sm text-muted-foreground">
                    Você tem {data?.counts.overdue} cobranças vencidas totalizando {formatCurrency(data?.summary.overdue || 0)}
                  </p>
                </div>
                <Button variant="destructive" size="sm" asChild>
                  <Link href="/clients?filter=overdue">Ver Inadimplentes</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
