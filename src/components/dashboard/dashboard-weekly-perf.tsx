"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip as InfoTooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"

interface WeeklyDataPoint {
  week: string
  open: number
  click: number
  conv: number
}

interface DashboardWeeklyPerfProps {
  loading?: boolean
  data?: WeeklyDataPoint[]
}

const EMPTY_DATA: WeeklyDataPoint[] = [
  { week: "Sem 1", open: 0, click: 0, conv: 0 },
  { week: "Sem 2", open: 0, click: 0, conv: 0 },
  { week: "Sem 3", open: 0, click: 0, conv: 0 },
  { week: "Sem 4", open: 0, click: 0, conv: 0 },
]

const COLORS = {
  open: "#4E62D8",
  click: "#7B8CEA",
  conv: "#B8C1F0",
}

const LEGEND_ITEMS = [
  { key: "open", label: "Open %", color: COLORS.open },
  { key: "click", label: "Click %", color: COLORS.click },
  { key: "conv", label: "Conv %", color: COLORS.conv },
]

const Y_TICKS = [0, 12, 24, 36, 48]

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string; color: string }>
  label?: string
}) {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="rounded-[8px] bg-gray-900 px-3 py-2 shadow-lg dark:bg-gray-800">
      <p className="mb-1 text-xs font-medium text-white">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-xs text-gray-200">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span>
            {entry.dataKey === "open"
              ? "Open"
              : entry.dataKey === "click"
                ? "Click"
                : "Conv"}
            : {entry.value}%
          </span>
        </div>
      ))}
    </div>
  )
}

function SkeletonState() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-4 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="flex gap-3">
          <div className="h-3 w-14 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-14 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-14 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
      <div className="flex h-[200px] items-end gap-4 pt-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-1 items-end gap-[2px]">
            <div
              className="flex-1 animate-pulse rounded-t bg-gray-200 dark:bg-gray-700"
              style={{ height: `${50 + i * 10}%` }}
            />
            <div
              className="flex-1 animate-pulse rounded-t bg-gray-200 dark:bg-gray-700"
              style={{ height: `${40 + i * 8}%` }}
            />
            <div
              className="flex-1 animate-pulse rounded-t bg-gray-200 dark:bg-gray-700"
              style={{ height: `${10 + i * 2}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardWeeklyPerf({ loading = false, data }: DashboardWeeklyPerfProps) {
  const chartData = data && data.length > 0 ? data : EMPTY_DATA
  const hasRealData = !!(data && data.length > 0)
  return (
    <div
      className={cn(
        "rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27] p-6",
        "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]"
      )}
    >
      {loading ? (
        <SkeletonState />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h3 className="text-[14px] font-medium text-gray-700 dark:text-white/90 dark:text-gray-300">
                Performance por Semana
              </h3>
              <TooltipProvider delayDuration={200}>
                <InfoTooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-gray-300 hover:text-gray-500 dark:text-white/60 dark:text-[#5C6378] dark:hover:text-[#8B92A5] transition-colors">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-relaxed">
                    Taxa de abertura, clique e conversão dos emails por semana. Acompanhe a evolução do engajamento ao longo do tempo.
                  </TooltipContent>
                </InfoTooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-3">
              {LEGEND_ITEMS.map((item) => (
                <div key={item.key} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[11px] text-gray-500 dark:text-white/60 dark:text-gray-400 dark:text-white/50">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="h-[220px] w-full relative">
            {!hasRealData && !loading && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/60 dark:bg-[#1A1D27]/60 rounded-[6px]">
                <p className="text-sm text-gray-400 dark:text-white/50 dark:text-[#5C6378]">Aguardando dados do sync</p>
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 0, left: -12, bottom: 0 }}
                barGap={2}
                barCategoryGap="20%"
              >
                <CartesianGrid
                  horizontal
                  vertical={false}
                  stroke="rgba(0,0,0,0.06)"
                  strokeDasharray=""
                />
                <XAxis
                  dataKey="week"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 11,
                    fill: "#9CA3AF",
                    fontFamily: "sans-serif",
                  }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  ticks={Y_TICKS}
                  domain={[0, 48]}
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{
                    fontSize: 11,
                    fill: "#9CA3AF",
                    fontFamily: "ui-monospace, monospace",
                  }}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "rgba(0,0,0,0.03)" }}
                />
                <Bar
                  dataKey="open"
                  fill={COLORS.open}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={24}
                />
                <Bar
                  dataKey="click"
                  fill={COLORS.click}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={24}
                />
                <Bar
                  dataKey="conv"
                  fill={COLORS.conv}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
