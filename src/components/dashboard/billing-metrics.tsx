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
import { CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { GlowCard } from "@/components/ui/glow-card"

interface BillingData {
  connected: boolean
  errorMessage?: string
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
  asaasMrr?: number
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
  inadimplentes?: {
    totalClients: number
    totalValue: number
    totalCharges: number
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (period !== "custom") {
      loadData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  async function loadData(customPeriod?: { start: string; end: string }) {
    setIsLoading(true)
    setError(null)
    try {
      let url = `/api/integrations/asaas/billing?period=${period}`
      if (period === "custom" && customPeriod) {
        url += `&start_date=${customPeriod.start}&end_date=${customPeriod.end}`
      }
      const response = await fetch(url)
      if (!response.ok) {
        setError("Não foi possível carregar os dados financeiros. Tente novamente.")
        return
      }
      const result = await response.json()
      if (result.errorMessage) {
        setError(result.errorMessage)
      }
      setData(result)
    } catch (err) {
      console.error("Error loading billing:", err)
      setError("Erro de conexão ao carregar dados financeiros.")
    } finally {
      setIsLoading(false)
    }
  }



  // Show loading state first
  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-40 bg-muted animate-pulse rounded-md" />
          <div className="h-8 w-8 bg-muted animate-pulse rounded-md" />
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="rounded-xl border bg-card">
              <div className="h-28 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Show error state
  if (error && (!data || !data.connected)) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5">
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <AlertCircle className="h-10 w-10 text-destructive mb-3" />
          <h3 className="text-base font-medium">Erro no Resumo Financeiro</h3>
          <p className="text-sm text-muted-foreground text-center mt-1 max-w-md">
            {error}
          </p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => loadData()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Tentar Novamente
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings/integrations">Verificar Integração</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Show connect message only after loading completes and we know it's not connected
  if (data && !data.connected) {
    return (
      <div className="rounded-xl border border-dashed bg-card">
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <DollarSign className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-base font-medium">Conecte a Asaas</h3>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Configure a integração com Asaas para ver métricas de faturamento
          </p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <Link href="/settings/integrations">Configurar Integração</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
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

          <DateRangePicker
            startDate={customStart ? new Date(customStart + "T12:00:00") : undefined}
            endDate={customEnd ? new Date(customEnd + "T12:00:00") : undefined}
            onApply={(start, end) => {
              const startStr = start.toISOString().split("T")[0]
              const endStr = end.toISOString().split("T")[0]
              setCustomStart(startStr)
              setCustomEnd(endStr)
              setPeriod("custom")
              loadData({ start: startStr, end: endStr })
            }}
          />

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => loadData()} disabled={isLoading}>
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </Button>
        </div>

        {data?.dateRange && (
          <p className="text-xs text-muted-foreground">
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
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <GlowCard color="success" intensity="subtle" surfaceClassName="p-5">
              <CardDescription className="flex items-center gap-1.5 text-xs">
                <TrendingUp className="h-3.5 w-3.5 text-success" />
                Recebido
              </CardDescription>
              <CardTitle className="text-2xl text-success mt-2">
                {formatCurrency(data?.summary.received || 0)}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1.5">
                {data?.counts.received || 0} cobranças pagas
              </p>
            </GlowCard>

            <GlowCard color="warning" intensity="subtle" surfaceClassName="p-5">
              <CardDescription className="flex items-center gap-1.5 text-xs">
                <Clock className="h-3.5 w-3.5 text-warning" />
                Pendente
              </CardDescription>
              <CardTitle className="text-2xl text-warning mt-2">
                {formatCurrency(data?.summary.pending || 0)}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1.5">
                {data?.counts.pending || 0} cobranças a receber
              </p>
            </GlowCard>

            <GlowCard color="destructive" intensity="subtle" surfaceClassName="p-5">
              <CardDescription className="flex items-center gap-1.5 text-xs">
                <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                Vencido
              </CardDescription>
              <CardTitle className="text-2xl text-destructive mt-2">
                {formatCurrency(data?.summary.overdue || 0)}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1.5">
                {data?.counts.overdue || 0} cobranças vencidas
              </p>
            </GlowCard>

            <GlowCard color="primary" intensity="subtle" surfaceClassName="p-5">
              <CardDescription className="flex items-center gap-1.5 text-xs">
                <DollarSign className="h-3.5 w-3.5" />
                Total Período
              </CardDescription>
              <CardTitle className="text-2xl mt-2">
                {formatCurrency((data?.summary.received || 0) + (data?.summary.pending || 0))}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1.5">
                {data?.counts.total || 0} cobranças no período
              </p>
            </GlowCard>

            <GlowCard color="mrr" intensity="moderate" surfaceClassName="p-5">
              <CardDescription className="flex items-center gap-1.5 text-xs">
                <Repeat className="h-3.5 w-3.5 text-primary" />
                MRR
              </CardDescription>
              <CardTitle className="text-2xl text-primary mt-2">
                {formatCurrency(data?.connected && data?.asaasMrr ? data.asaasMrr : mrr)}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1.5">
                Receita recorrente mensal
              </p>
            </GlowCard>
          </div>

          {/* Secondary Metrics */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <GlowCard color="primary" intensity="subtle" surfaceClassName="p-5">
              <CardDescription className="text-xs">Clientes Asaas</CardDescription>
              <CardTitle className="text-xl flex items-center gap-2 mt-2">
                <Users className="h-4 w-4 text-primary" />
                {data?.summary.totalClients || 0}
              </CardTitle>
            </GlowCard>

            <GlowCard color="destructive" intensity="subtle" surfaceClassName="p-5">
              <CardDescription className="flex items-center gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5 text-destructive" />
                Clientes Inadimplentes
              </CardDescription>
              <CardTitle className="text-xl text-destructive mt-2">
                {data?.inadimplentes?.totalClients || 0}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {data?.inadimplentes?.totalCharges || 0} cobranças · {formatCurrency(data?.inadimplentes?.totalValue || 0)}
              </p>
            </GlowCard>

            <GlowCard color="mrr" intensity="subtle" surfaceClassName="p-5">
              <CardDescription className="text-xs">Assinaturas Ativas</CardDescription>
              <CardTitle className="text-xl flex items-center gap-2 mt-2">
                <Repeat className="h-4 w-4 text-primary" />
                {data?.summary.activeSubscriptions || 0}
              </CardTitle>
            </GlowCard>

            <GlowCard color="primary" intensity="subtle" surfaceClassName="p-5">
              <CardDescription className="text-xs">Estornado</CardDescription>
              <CardTitle className="text-xl flex items-center gap-2 text-muted-foreground mt-2">
                {formatCurrency(data?.summary.refunded || 0)}
              </CardTitle>
            </GlowCard>
          </div>

          {/* By Payment Type */}
          <div className="rounded-xl border bg-card">
            <div className="p-5 pb-3">
              <h3 className="text-sm font-medium">Faturamento por Método</h3>
            </div>
            <div className="px-5 pb-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
                  <div className="rounded-lg p-2 bg-success/10">
                    <QrCode className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">PIX</p>
                    <p className="text-base font-semibold">{formatCurrency(data?.byType.PIX || 0)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
                  <div className="rounded-lg p-2 bg-primary/10">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Boleto</p>
                    <p className="text-base font-semibold">{formatCurrency(data?.byType.BOLETO || 0)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
                  <div className="rounded-lg p-2 bg-warning/10">
                    <CreditCard className="h-4 w-4 text-warning" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cartão</p>
                    <p className="text-base font-semibold">{formatCurrency(data?.byType.CREDIT_CARD || 0)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Overdue Alert */}
          {(data?.summary.overdue || 0) > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5">
              <div className="flex items-center gap-4 px-5 py-3">
                <div className="rounded-lg p-2.5 bg-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">Atenção: Cobranças Vencidas</p>
                  <p className="text-xs text-muted-foreground">
                    Você tem {data?.counts.overdue} cobranças vencidas totalizando {formatCurrency(data?.summary.overdue || 0)}
                  </p>
                </div>
                <Button variant="destructive" size="sm" asChild>
                  <Link href="/clients?filter=overdue">Ver Inadimplentes</Link>
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
