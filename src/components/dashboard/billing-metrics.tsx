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
  RotateCcw,
} from "lucide-react"
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
import { createClient } from "@/lib/supabase/client"

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
  const [refundMetrics, setRefundMetrics] = useState<{ total: number; count: number } | null>(null)
  const [refundMetricsLoading, setRefundMetricsLoading] = useState(true)

  useEffect(() => {
    loadRefundMetrics()
  }, [])

  useEffect(() => {
    if (period !== "custom") {
      loadData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  async function loadRefundMetrics() {
    setRefundMetricsLoading(true)
    try {
      const supabase = createClient()
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: rows, error: queryError } = await supabase
        .from("refunds")
        .select("amount")
        .eq("status", "processed")
        .gte("processed_at", thirtyDaysAgo.toISOString())

      if (queryError) {
        console.error("Error loading refund metrics:", queryError)
        setRefundMetrics(null)
        return
      }

      const total = (rows || []).reduce((sum, r) => sum + Number(r.amount), 0)
      setRefundMetrics({ total, count: (rows || []).length })
    } catch (err) {
      console.error("Error loading refund metrics:", err)
      setRefundMetrics(null)
    } finally {
      setRefundMetricsLoading(false)
    }
  }

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
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="rounded-[8px] border">
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
      <div className="rounded-[8px] border border-destructive/30 bg-destructive/5">
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <AlertCircle className="h-10 w-10 text-destructive mb-3" />
          <h3 className="text-base font-medium text-foreground">Erro no Resumo Financeiro</h3>
          <p className="text-sm text-muted-foreground text-center mt-1 max-w-md">
            {error}
          </p>
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" size="sm" onClick={() => loadData()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Tentar Novamente
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/admin/settings/integrations">Verificar Integração</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Show connect message only after loading completes and we know it's not connected
  if (data && !data.connected) {
    return (
      <div className="rounded-[8px] border border-dashed bg-card">
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <DollarSign className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-base font-medium text-foreground">Conecte a Asaas</h3>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Configure a integração com Asaas para ver métricas de faturamento
          </p>
          <Button variant="secondary" size="sm" className="mt-4" asChild>
            <Link href="/admin/settings/integrations">Configurar Integração</Link>
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
            <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <span className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5]">Recebido</span>
              </div>
              <p className="text-xl font-semibold tracking-tight font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
                {formatCurrency(data?.summary.received || 0)}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-1">
                {data?.counts.received || 0} assinaturas pagas
              </p>
            </div>

            <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5]">Pendente</span>
              </div>
              <p className="text-xl font-semibold tracking-tight font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
                {formatCurrency(data?.summary.pending || 0)}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-1">
                {data?.counts.pending || 0} assinaturas a receber
              </p>
            </div>

            <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5]">Vencido</span>
              </div>
              <p className="text-xl font-semibold tracking-tight font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
                {formatCurrency(data?.summary.overdue || 0)}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-1">
                {data?.counts.overdue || 0} assinaturas vencidas
              </p>
            </div>

            <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-gray-500 dark:text-[#8B92A5]" />
                <span className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5]">Total Período</span>
              </div>
              <p className="text-xl font-semibold tracking-tight font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
                {formatCurrency((data?.summary.received || 0) + (data?.summary.pending || 0))}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-1">
                {data?.counts.total || 0} assinaturas no período
              </p>
            </div>

            <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Repeat className="h-4 w-4 text-[#4E62D8] dark:text-[#7B8CEA]" />
                <span className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5]">MRR</span>
              </div>
              <p className="text-xl font-semibold tracking-tight font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
                {formatCurrency(data?.connected && data?.asaasMrr ? data.asaasMrr : mrr)}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-1">
                Receita recorrente mensal
              </p>
            </div>
          </div>

          {/* Secondary row */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <div className="rounded-[8px] border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Clientes Asaas</span>
              </div>
              <p className="text-lg font-semibold text-foreground">{data?.summary.totalClients || 0}</p>
            </div>
            <div className="rounded-[8px] border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Inadimplentes</span>
              </div>
              <p className="text-lg font-semibold text-foreground">{data?.inadimplentes?.totalClients || 0}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {data?.inadimplentes?.totalCharges || 0} assinaturas · {formatCurrency(data?.inadimplentes?.totalValue || 0)}
              </p>
            </div>
            <div className="rounded-[8px] border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Assinaturas Ativas</span>
              </div>
              <p className="text-lg font-semibold text-foreground">{data?.summary.activeSubscriptions || 0}</p>
            </div>
            <div className="rounded-[8px] border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Estornado</span>
              </div>
              <p className="text-lg font-semibold text-foreground">{formatCurrency(data?.summary.refunded || 0)}</p>
            </div>
            <div className="rounded-[8px] border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <RotateCcw className="h-3.5 w-3.5 text-violet-500" />
                <span className="text-xs text-muted-foreground">Reembolsos (30d)</span>
              </div>
              {refundMetricsLoading ? (
                <div className="flex items-center justify-center h-10">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <p className="text-lg font-semibold text-foreground">
                    {refundMetrics ? formatCurrency(refundMetrics.total) : "--"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {refundMetrics ? `${refundMetrics.count} ${refundMetrics.count === 1 ? "reembolso" : "reembolsos"}` : "--"}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Payment Methods */}
          <div className="rounded-[8px] border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-6 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground">Por método:</span>
              <div className="flex items-center gap-2">
                <QrCode className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">PIX</span>
                <span className="text-sm font-medium text-foreground">{formatCurrency(data?.byType.PIX || 0)}</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Boleto</span>
                <span className="text-sm font-medium text-foreground">{formatCurrency(data?.byType.BOLETO || 0)}</span>
              </div>
              <div className="flex items-center gap-2">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Cartão</span>
                <span className="text-sm font-medium text-foreground">{formatCurrency(data?.byType.CREDIT_CARD || 0)}</span>
              </div>
            </div>
          </div>

          {/* Overdue Alert */}
          {(data?.summary.overdue || 0) > 0 && (
            <div className="rounded-[8px] border border-destructive/30 bg-destructive/5">
              <div className="flex items-center gap-4 px-5 py-3">
                <AlertCircle className="h-5 w-5 text-[#991B1B] dark:text-[#FCA5A5]" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">Atenção: Assinaturas Vencidas</p>
                  <p className="text-xs text-muted-foreground">
                    Você tem {data?.counts.overdue} assinaturas vencidas totalizando {formatCurrency(data?.summary.overdue || 0)}
                  </p>
                </div>
                <Button variant="destructive" size="sm" asChild>
                  <Link href="/admin/clients?filter=overdue">Ver Inadimplentes</Link>
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
