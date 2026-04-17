"use client"

import { useState, useMemo } from "react"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"

type Severity = 0 | 1 | 2

interface Alert {
  id: string
  title: string
  description: string
  client: string
  severity: Severity
}

type FilterValue = "all" | "critical" | "warning" | "info"

const _MOCK_ALERTS: Alert[] = [
  {
    id: "1",
    title: "Deliverability em queda",
    description: "Bounce rate 4.1%, limite 2%",
    client: "Based 3.0",
    severity: 0,
  },
  {
    id: "2",
    title: "3 flows pausados",
    description: "Welcome, Abandono, Win-back",
    client: "EPORTH Energia",
    severity: 0,
  },
  {
    id: "3",
    title: "9 dias sem envio",
    description: "Ultima campanha: 15/03",
    client: "NUZE",
    severity: 1,
  },
  {
    id: "4",
    title: "Onboarding atrasado",
    description: "11d na fase 1a Campanha",
    client: "Casa & Decor",
    severity: 1,
  },
  {
    id: "5",
    title: "Unsub rate alto",
    description: "0.23% nos ultimos 30 dias",
    client: "Donaris Joias",
    severity: 1,
  },
  {
    id: "6",
    title: "Lista estagnada",
    description: "0.1% crescimento, meta 2%",
    client: "Clube Rock",
    severity: 2,
  },
]

const SEVERITY_BAR_COLORS: Record<Severity, string> = {
  0: "bg-[#EF4444]",
  1: "bg-[#F59E0B]",
  2: "bg-[#3B82F6]",
}

const FILTER_OPTIONS: { value: FilterValue; label: string; severity?: Severity }[] = [
  { value: "all", label: "Todos" },
  { value: "critical", label: "Criticos", severity: 0 },
  { value: "warning", label: "Alertas", severity: 1 },
  { value: "info", label: "Info", severity: 2 },
]

interface AlertProp {
  id: string
  title: string
  description: string
  clientName: string
  severity: number
}

interface DashboardAlertsProps {
  loading?: boolean
  alerts?: AlertProp[]
}

export function DashboardAlerts({ loading, alerts: alertsProp }: DashboardAlertsProps) {
  const [filter, setFilter] = useState<FilterValue>("all")

  // Use real data when available, fallback to mock
  const allAlerts: Alert[] = useMemo(() => {
    if (alertsProp && alertsProp.length > 0) {
      return alertsProp.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        client: a.clientName,
        severity: (Math.min(2, Math.max(0, a.severity)) as Severity),
      }))
    }
    return []
  }, [alertsProp])

  const criticalCount = useMemo(
    () => allAlerts.filter((a) => a.severity === 0).length,
    [allAlerts]
  )

  const filteredAlerts = useMemo(() => {
    if (filter === "all") return allAlerts
    const option = FILTER_OPTIONS.find((o) => o.value === filter)
    if (option?.severity === undefined) return allAlerts
    return allAlerts.filter((a) => a.severity === option.severity)
  }, [filter, allAlerts])

  const filterLabel = (opt: (typeof FILTER_OPTIONS)[number]) => {
    if (opt.value === "all") return `Todos(${allAlerts.length})`
    return opt.label
  }

  return (
    <div
      className={cn(
        "rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27]",
        "dark:bg-[#1A1D27] dark:border-[rgba(255,255,255,0.08)]",
        "flex flex-col self-start"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium text-gray-700 dark:text-white/90 dark:text-gray-300">
            Alertas
          </span>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-gray-300 hover:text-gray-500 dark:text-white/60 dark:text-[#5C6378] dark:hover:text-[#8B92A5] transition-colors">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-relaxed">
                Alertas automáticos sobre problemas que requerem atenção: pagamentos vencidos, contratos expirando, health score baixo, falhas de entrega e flows pausados.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {criticalCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-[#EF4444] px-2 py-0.5 text-[11px] font-semibold leading-none text-white">
              {criticalCount} criticos
            </span>
          )}
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterValue)}
          className={cn(
            "h-7 rounded-md border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27] px-2 text-xs text-gray-600 dark:text-white/70",
            "outline-none focus:ring-1 focus:ring-gray-300",
            "dark:bg-[#1A1D27] dark:border-[rgba(255,255,255,0.08)] dark:text-gray-400 dark:text-white/50 dark:focus:ring-gray-600"
          )}
        >
          {FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {filterLabel(opt)}
            </option>
          ))}
        </select>
      </div>

      {/* Alert rows */}
      <div className="px-4">
        {loading ? (
          <div className="space-y-3 py-1">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={cn(
                "flex items-stretch gap-3 py-3",
                "border-b border-[rgba(0,0,0,0.04)] last:border-b-0",
                "hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.02)]",
                "transition-colors"
              )}
            >
              {/* Severity bar */}
              <div
                className={cn(
                  "w-[3px] rounded-full shrink-0 self-stretch",
                  SEVERITY_BAR_COLORS[alert.severity]
                )}
              />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-900 dark:text-white dark:text-gray-100 leading-tight">
                  {alert.title}
                </p>
                <p className="text-[12px] text-gray-400 dark:text-white/50 dark:text-gray-500 dark:text-white/60 leading-tight mt-0.5">
                  {alert.description}
                </p>
              </div>

              {/* Client name */}
              <span className="text-[12px] font-medium text-gray-600 dark:text-white/70 dark:text-gray-400 dark:text-white/50 shrink-0 self-center">
                {alert.client}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3">
        <p className="text-[12px] text-gray-400 dark:text-white/50 dark:text-gray-500 dark:text-white/60">
          {filteredAlerts.length} de {allAlerts.length} alertas
        </p>
      </div>
    </div>
  )
}
