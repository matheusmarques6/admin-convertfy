"use client"

import { useState } from "react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { Sparkles, RefreshCw, TrendingUp, AlertTriangle, CheckCircle, Lightbulb, Info } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { PeriodPicker, type PeriodValue } from "@/components/ui/period-picker"
import { Skeleton } from "@/components/ui/skeleton"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Insight {
  type: "positive" | "warning" | "critical" | "opportunity" | "info"
  title: string
  description: string
  action: string | null
}

const TYPE_CONFIG: Record<string, { icon: typeof TrendingUp; color: string; bg: string }> = {
  positive: { icon: CheckCircle, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/30" },
  warning: { icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30" },
  critical: { icon: AlertTriangle, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30" },
  opportunity: { icon: Lightbulb, color: "text-[#4E62D8] dark:text-[#7B8CEA]", bg: "bg-[#EEF0FB] dark:bg-[#4E62D8]/10 border-[#C7CDEF] dark:border-[#4E62D8]/30" },
  info: { icon: Info, color: "text-gray-500 dark:text-white/60", bg: "bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/10" },
}

export default function InsightsPage() {
  const [period, setPeriod] = useState<PeriodValue>({ period: "30d" })
  const periodParam = period.period === "custom" ? "30d" : period.period

  const { data, isLoading, mutate } = useSWR(
    `/api/dashboard/insights?period=${periodParam}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 120_000 }
  )

  const insights: Insight[] = data?.insights ?? []
  const generatedAt = data?.generatedAt

  return (
    <div className="max-w-[900px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-[#4E62D8] to-[#7B8CEA] flex items-center justify-center">
            <Icon icon={Sparkles} size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold text-gray-900 dark:text-white tracking-tight">Insights IA</h1>
            <p className="text-[13px] text-gray-500 dark:text-white/50">Analise automatica dos seus KPIs com sugestoes acionaveis</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PeriodPicker value={period} onChange={setPeriod} />
          <Button variant="secondary" size="sm" onClick={() => mutate()} disabled={isLoading}>
            <Icon icon={RefreshCw} size={16} className={cn("mr-1.5", isLoading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Generated at */}
      {generatedAt && !isLoading && (
        <p className="text-[11px] text-gray-400 dark:text-white/40 mb-4">
          Gerado em {new Date(generatedAt).toLocaleString("pt-BR")} via GPT-4o Mini
        </p>
      )}

      {/* Insights */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-[10px]" />
          ))}
        </div>
      ) : insights.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-[10px] border border-dashed border-gray-200 dark:border-white/10">
          <Icon icon={Sparkles} size={24} className="text-gray-300 dark:text-white/20 mb-3" />
          <p className="text-sm text-gray-500 dark:text-white/50">Sem dados suficientes para gerar insights.</p>
          <p className="text-xs text-gray-400 dark:text-white/40 mt-1">Conecte lojas com Klaviyo para ver sugestoes da IA.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {insights.map((insight, i) => {
            const config = TYPE_CONFIG[insight.type] || TYPE_CONFIG.info
            const InsightIcon = config.icon
            return (
              <div
                key={i}
                className={cn(
                  "rounded-[10px] border p-5 transition-all",
                  config.bg
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    <Icon icon={InsightIcon} size={20} className={config.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white mb-1">
                      {insight.title}
                    </h3>
                    <p className="text-[13px] text-gray-600 dark:text-white/70 leading-relaxed">
                      {insight.description}
                    </p>
                    {insight.action && (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-gray-400 dark:text-white/40 uppercase">Acao sugerida:</span>
                        <span className="text-[12px] font-medium text-gray-700 dark:text-white/80">
                          {insight.action}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
