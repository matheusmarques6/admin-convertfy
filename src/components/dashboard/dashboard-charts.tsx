"use client"

import { useMemo } from "react"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────

interface ChartDataPoint {
  date: string
  value: number
}

interface CampaignDataPoint {
  week: string
  openRate: number
  clickRate: number
}

interface DashboardChartsProps {
  revenueData?: ChartDataPoint[]
  revenuePrevious?: ChartDataPoint[]
  campaignData?: CampaignDataPoint[]
  compareEnabled?: boolean
  loading?: boolean
}

// ─── Empty State ──────────────────────────────────────────

function ChartEmptyState({ title, message }: { title: string; message: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-[240px] flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#242836]/50 p-6 text-center dark:border-[#2A2F3D] dark:bg-[#1A1D27]/40">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-300 dark:text-[#5C6378]"
          >
            <path d="M3 3v18h18" />
            <path d="M7 14l4-4 4 4 6-6" />
          </svg>
          <p className="text-xs text-gray-500 dark:text-white/60 dark:text-[#8B92A5]">{message}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Custom Tooltip (DS v3.0) ─────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) {
  if (!active || !payload?.length) return null

  return (
    <div
      className={cn(
        "rounded-[6px] px-3 py-2 shadow-lg",
        "bg-gray-900 dark:bg-[#242836]",
        "text-sm text-white dark:text-[#EAEDF3]",
      )}
    >
      <p className="text-xs text-gray-400 dark:text-white/50 dark:text-[#5C6378] mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="font-mono tabular-nums font-medium">
          {entry.name === "value" ? "R$ " : ""}
          {entry.value.toLocaleString("pt-BR")}
          {entry.name === "openRate" || entry.name === "clickRate" ? "%" : ""}
        </p>
      ))}
    </div>
  )
}

// ─── Chart Skeleton ───────────────────────────────────────

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-4 w-40 bg-gray-100 dark:bg-[#242836] rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="h-[240px] bg-gray-50 dark:bg-[#242836] dark:bg-[#1A1D27] rounded-[8px] animate-pulse flex items-end justify-between px-8 pb-8 gap-2">
          {[40, 65, 50, 80, 60, 75, 90, 55].map((h, i) => (
            <div
              key={i}
              className="w-full bg-gray-100 dark:bg-[#242836] rounded-t-[4px]"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Revenue Area Chart ───────────────────────────────────

function RevenueChart({
  data,
  compareData,
  chartHeight,
  loading,
}: {
  data: ChartDataPoint[]
  compareData?: ChartDataPoint[]
  chartHeight: number
  loading?: boolean
}) {
  // Merge current + previous data for compare mode
  const mergedData = useMemo(() => {
    if (!compareData) return data
    return data.map((d, i) => ({
      ...d,
      previousValue: compareData[i]?.value ?? 0,
    }))
  }, [data, compareData])

  if (loading) return <ChartSkeleton />

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Receita por período
          </CardTitle>
          {compareData && (
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-white/60 dark:text-[#8B92A5]">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#4E62D8] dark:bg-[#7B8CEA] rounded-full" />
                Atual
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-b border-dashed border-gray-300 dark:border-[#5C6378]" />
                Anterior
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <AreaChart data={mergedData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4E62D8" stopOpacity={0.22} />
                <stop offset="50%" stopColor="#4E62D8" stopOpacity={0.06} />
                <stop offset="100%" stopColor="#4E62D8" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="revenueGradientDark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7B8CEA" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#7B8CEA" stopOpacity={0.01} />
              </linearGradient>
            </defs>

            <CartesianGrid
              horizontal={true}
              vertical={false}
              stroke="#F3F4F6"
              className="dark:hidden"
            />
            <CartesianGrid
              horizontal={true}
              vertical={false}
              stroke="rgba(255,255,255,0.04)"
              className="hidden dark:block"
            />

            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#9CA3AF" }}
              dy={8}
              interval="preserveStartEnd"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#9CA3AF" }}
              tickFormatter={(value: number) => `R$${(value / 1000).toFixed(0)}k`}
              width={60}
            />

            <Tooltip content={<ChartTooltip />} />

            {compareData && (
              <Area
                type="monotone"
                dataKey="previousValue"
                name="Anterior"
                stroke="#D1D5DB"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                fill="none"
                dot={false}
              />
            )}

            <Area
              type="monotone"
              dataKey="value"
              name="value"
              stroke="#4E62D8"
              strokeWidth={2.5}
              fill="url(#revenueGradient)"
              dot={false}
              activeDot={{
                r: 4,
                fill: "#4E62D8",
                stroke: "#FFFFFF",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ─── Campaign Bar Chart ───────────────────────────────────

function CampaignPerformanceChart({
  data,
  chartHeight,
  loading,
}: {
  data: CampaignDataPoint[]
  chartHeight: number
  loading?: boolean
}) {
  if (loading) return <ChartSkeleton />

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          Performance de Campanhas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={true} vertical={false} stroke="#F3F4F6" />

            <XAxis
              dataKey="week"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#9CA3AF" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#9CA3AF" }}
              tickFormatter={(v: number) => `${v}%`}
              width={45}
            />

            <Tooltip content={<ChartTooltip />} />

            <Bar
              dataKey="openRate"
              name="openRate"
              fill="#4E62D8"
              radius={[4, 4, 0, 0]}
              barSize={16}
            />
            <Bar
              dataKey="clickRate"
              name="clickRate"
              fill="#A8B2EE"
              radius={[4, 4, 0, 0]}
              barSize={16}
            />
          </BarChart>
        </ResponsiveContainer>

        {/* Manual legend (DS v3.0 — more control than Recharts Legend) */}
        <div className="flex items-center justify-center gap-6 mt-3">
          <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/60 dark:text-[#8B92A5]">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#4E62D8] dark:bg-[#7B8CEA]" />
            Open Rate
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/60 dark:text-[#8B92A5]">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#A8B2EE] dark:bg-[#5A6EE0]" />
            Click Rate
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── DashboardCharts (exported) ───────────────────────────

export function DashboardCharts({
  revenueData,
  revenuePrevious,
  campaignData,
  compareEnabled = false,
  loading = false,
}: DashboardChartsProps) {
  const isMobile = useMediaQuery("(max-width: 489px)")
  const isSmall = useMediaQuery("(max-width: 767px)")
  const isMedium = useMediaQuery("(max-width: 1039px)")

  const chartHeight = isMobile ? 180 : isSmall ? 200 : isMedium ? 240 : 280

  const hasRevenue = (revenueData?.length ?? 0) > 0
  const hasPrevious = compareEnabled && (revenuePrevious?.length ?? 0) > 0
  const hasCampaign = (campaignData?.length ?? 0) > 0

  return (
    <div
      className={cn(
        "mt-6",
        "flex flex-col gap-4",
        "lg:grid lg:grid-cols-5 lg:gap-6",
      )}
    >
      {/* Area Chart — Revenue (3/5 on desktop) */}
      <div className="lg:col-span-3">
        {loading ? (
          <ChartSkeleton />
        ) : hasRevenue ? (
          <RevenueChart
            data={revenueData!}
            compareData={hasPrevious ? revenuePrevious : undefined}
            chartHeight={chartHeight}
            loading={false}
          />
        ) : (
          <ChartEmptyState
            title="Receita por período"
            message="Sem dados de receita para o período selecionado. Conecte uma loja ou ajuste o filtro."
          />
        )}
      </div>

      {/* Bar Chart — Campaign Performance (2/5) */}
      <div className="lg:col-span-2">
        {loading ? (
          <ChartSkeleton />
        ) : hasCampaign ? (
          <CampaignPerformanceChart
            data={campaignData!}
            chartHeight={chartHeight}
            loading={false}
          />
        ) : (
          <ChartEmptyState
            title="Performance de Campanhas"
            message="Nenhuma campanha enviada no período selecionado."
          />
        )}
      </div>
    </div>
  )
}
