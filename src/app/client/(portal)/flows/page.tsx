"use client"

import { useState, useEffect, useCallback } from "react"
import {
  CalendarDays,
  RefreshCw,
  AlertCircle,
  Zap,
  TrendingUp,
  Mail,
  DollarSign,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency, formatNumber, formatDateRange } from "@/lib/utils/format"
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"
import type { DashboardData } from "../dashboard/types"

export default function PortalFlowsPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState("30d")
  const [selectedFlow, setSelectedFlow] = useState<{ id: string; name: string; revenue: number; delivered: number; openRate: number; clickRate: number } | null>(null)

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)

    try {
      let storeId: string | null = null
      try { storeId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }
      const params = new URLSearchParams({
        period,
        ...(storeId && { store_id: storeId }),
      })
      const response = await fetch(`/api/portal/dashboard?${params}`)
      if (!response.ok) throw new Error("Erro ao carregar dados")
      const result = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      console.error("Flows fetch error:", err)
      setError("Não foi possível carregar os dados. Tente novamente.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-24 bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24 bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-100 dark:border-slate-700/30" />
          ))}
        </div>
        <Skeleton className="h-80 bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-100 dark:border-slate-700/30" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200 dark:border-slate-700/40 p-10 text-center max-w-md">
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Erro ao carregar</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{error}</p>
          <Button onClick={() => fetchData()} className="bg-primary hover:bg-primary/85 text-white">
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const klaviyo = data.klaviyo
  const flows = klaviyo?.topFlows || []
  const totalFlowRevenue = klaviyo?.flowRevenue || 0
  const activeFlows = klaviyo?.activeFlows || 0
  const totalFlows = klaviyo?.flowsCount || 0
  const avgOpenRate = flows.length > 0
    ? flows.reduce((acc, f) => acc + f.openRate, 0) / flows.length
    : 0

  const bestFlow = flows.length > 0 ? flows[0] : null

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Flows</h1>
          <div className="flex items-center gap-2 mt-1">
            {data.dateRange && (
              <p className="text-sm text-slate-500 dark:text-slate-400">{formatDateRange(data.dateRange.start, data.dateRange.end)}</p>
            )}
            {refreshing && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Atualizando...
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] h-10 bg-white dark:bg-[#1A1D27] border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 rounded-lg">
              <CalendarDays className="h-4 w-4 mr-2 text-slate-400 dark:text-slate-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-[#1A1D27] border-slate-200 dark:border-slate-700/40 shadow-lg">
              <SelectItem value="7d">7 dias</SelectItem>
              <SelectItem value="15d">15 dias</SelectItem>
              <SelectItem value="30d">30 dias</SelectItem>
              <SelectItem value="90d">90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-10 w-10 bg-white dark:bg-[#1A1D27] border-slate-200 dark:border-slate-700/40 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06] rounded-lg"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <AnimatedContainer className="space-y-6">
        {/* Summary Cards */}
        <AnimatedItem>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard icon={Zap} iconBg="bg-purple-50" iconColor="text-purple-600" label="Flows Ativos" value={String(activeFlows)} subtitle={`de ${totalFlows} total`} />
            <SummaryCard icon={DollarSign} iconBg="bg-emerald-50" iconColor="text-emerald-600" label="Receita Total" value={formatCurrency(totalFlowRevenue)} subtitle="no período" valueColor="text-emerald-600" />
            <SummaryCard icon={TrendingUp} iconBg="bg-cyan-50" iconColor="text-cyan-600" label="Melhor Flow" value={bestFlow?.name || "—"} subtitle={bestFlow ? formatCurrency(bestFlow.revenue) : "—"} isSmallValue />
            <SummaryCard icon={Mail} iconBg="bg-blue-50" iconColor="text-blue-600" label="Taxa Média Abertura" value={`${avgOpenRate.toFixed(1)}%`} subtitle="dos flows" />
          </div>
        </AnimatedItem>

        {/* Flows Table */}
        <AnimatedItem>
          <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
              <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">Todos os Flows</h3>
            </div>

            {flows.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-12 text-center">Nenhum flow encontrado no período</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700/30 bg-slate-50/50 dark:bg-slate-800/30">
                      <th scope="col" className="text-left text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-6">Nome</th>
                      <th scope="col" className="text-right text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-4">Entregas</th>
                      <th scope="col" className="text-right text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-4">Abertura</th>
                      <th scope="col" className="text-right text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-4">Cliques</th>
                      <th scope="col" className="text-right text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-4">Receita</th>
                      <th scope="col" className="text-right text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-6">Rec/dest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flows.map((flow, index) => {
                      const revenuePerRecipient = flow.delivered > 0 ? flow.revenue / flow.delivered : 0
                      return (
                        <tr key={flow.id} onClick={() => setSelectedFlow(flow)} className={`border-b border-slate-50 dark:border-slate-700/20 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer ${index === 0 ? "bg-emerald-50/30 dark:bg-emerald-500/5" : ""}`}>
                          <td className="py-3.5 px-6">
                            <div className="flex items-center gap-2.5">
                              {index < 3 && (
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                  index === 0 ? "bg-primary/10 text-primary" : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                                }`}>
                                  {index + 1}
                                </div>
                              )}
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[220px]">{flow.name}</span>
                            </div>
                          </td>
                          <td className="text-right text-sm text-slate-600 dark:text-slate-300 py-3.5 px-4">{formatNumber(flow.delivered)}</td>
                          <td className="text-right text-sm text-slate-600 dark:text-slate-300 py-3.5 px-4">{flow.openRate.toFixed(1)}%</td>
                          <td className="text-right text-sm text-slate-600 dark:text-slate-300 py-3.5 px-4">{flow.clickRate.toFixed(1)}%</td>
                          <td className="text-right text-sm font-semibold text-emerald-600 py-3.5 px-4">{formatCurrency(flow.revenue)}</td>
                          <td className="text-right text-sm text-slate-600 dark:text-slate-300 py-3.5 px-6">{formatCurrency(revenuePerRecipient)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </AnimatedItem>
      </AnimatedContainer>

      {selectedFlow && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedFlow(null)}>
          <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200 dark:border-slate-700/40 shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 dark:border-slate-700/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[8px] bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center">
                    <Zap className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{selectedFlow.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Detalhes do flow no período</p>
                  </div>
                </div>
                <button onClick={() => setSelectedFlow(null)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <X className="h-4 w-4 text-slate-400" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-[8px] p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Entregas</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{formatNumber(selectedFlow.delivered)}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-[8px] p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Receita</p>
                  <p className="text-xl font-bold text-emerald-600">{formatCurrency(selectedFlow.revenue)}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-[8px] p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Taxa de Abertura</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{selectedFlow.openRate.toFixed(1)}%</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-[8px] p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Taxa de Clique</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{selectedFlow.clickRate.toFixed(1)}%</p>
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-[8px] p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Receita por Destinatário</p>
                <p className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {formatCurrency(selectedFlow.delivered > 0 ? selectedFlow.revenue / selectedFlow.delivered : 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  subtitle,
  valueColor = "text-slate-800 dark:text-slate-100",
  isSmallValue = false,
}: {
  icon: LucideIcon
  iconBg: string
  iconColor: string
  label: string
  value: string
  subtitle: string
  valueColor?: string
  isSmallValue?: boolean
}) {
  return (
    <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 p-4 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</span>
      </div>
      <p className={`${isSmallValue ? "text-sm" : "text-xl"} font-bold ${valueColor} truncate`}>{value}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>
    </div>
  )
}
