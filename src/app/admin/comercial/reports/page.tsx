"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from "recharts"
import { Download, BarChart3 } from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { PageSkeleton } from "@/components/ui/page-skeleton"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface ReportData {
  window_days: number
  org_snapshots: Array<{
    day: string
    sales_pipeline_value: number
    sales_won_value_30d: number
    sales_won_count_30d: number
    sales_win_rate_30d: number | null
    sales_avg_cycle_days_30d: number | null
    avg_health_score: number | null
    nps_score: number | null
    total_mrr_cents: number
    active_stores_count: number
    inbox_open_threads: number
    critical_health_count: number
  }>
  funnel_snapshots: Array<{
    day: string
    new_count: number
    qualified_count: number
    converted_count: number
    lost_count: number
    created_today: number
  }>
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v)

// Wrappers que aceitam o tipo aberto do recharts v3 (ValueType =
// number | string | undefined) e normalizam pra number antes de formatar.
const fmtBRLTooltip = (v: unknown): string => {
  const n = typeof v === "number" ? v : Number(v) || 0
  return fmtBRL(n)
}
const fmtBRLAxis = (v: unknown): string => {
  const n = typeof v === "number" ? v : Number(v) || 0
  return fmtBRL(n)
}

export default function ReportsPage() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useSWR<ReportData>(
    `/api/crm/reports/timeseries?days=${days}`,
    fetcher,
  )

  const d = data

  const orgSeries = useMemo(() => {
    return (d?.org_snapshots || []).map((s) => ({
      day: s.day.slice(5), // MM-DD
      pipeline: Number(s.sales_pipeline_value) || 0,
      won_30d: Number(s.sales_won_value_30d) || 0,
      win_rate: Number(s.sales_win_rate_30d) || 0,
      cycle: Number(s.sales_avg_cycle_days_30d) || 0,
      mrr: (Number(s.total_mrr_cents) || 0) / 100,
      health: Number(s.avg_health_score) || 0,
      nps: Number(s.nps_score) || 0,
      stores: s.active_stores_count,
      inbox: s.inbox_open_threads,
      critical: s.critical_health_count,
    }))
  }, [d])

  const funnelSeries = useMemo(() => {
    return (d?.funnel_snapshots || []).map((s) => ({
      day: s.day.slice(5),
      new: s.new_count,
      qualified: s.qualified_count,
      converted: s.converted_count,
      lost: s.lost_count,
      created: s.created_today,
    }))
  }, [d])

  const exportCsv = () => {
    if (!d) return
    const rows = [
      ["day", "pipeline_value", "won_30d", "win_rate", "avg_cycle", "mrr", "avg_health", "nps", "active_stores", "inbox_open"],
      ...d.org_snapshots.map((s) => [
        s.day,
        s.sales_pipeline_value,
        s.sales_won_value_30d,
        s.sales_win_rate_30d,
        s.sales_avg_cycle_days_30d,
        s.total_mrr_cents / 100,
        s.avg_health_score,
        s.nps_score,
        s.active_stores_count,
        s.inbox_open_threads,
      ]),
    ]
    const csv = rows.map((r) => r.map((v) => (v == null ? "" : String(v))).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `crm-report-${days}d-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasData = (d?.org_snapshots?.length || 0) > 0

  return (
    <CrmPageShell
      title="Reports CRM"
      subtitle={`Snapshot-first BI · janela ${days}d · cron diario as 06h UTC`}
      actions={
        <>
          <select
            className="crm-input"
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
          >
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
            <option value={180}>180 dias</option>
            <option value={365}>365 dias</option>
          </select>
          <button
            className="crm-button-ghost"
            onClick={exportCsv}
            disabled={!hasData}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--crm-space-2)",
              opacity: hasData ? 1 : 0.5,
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        </>
      }
    >
      <div className="p-6 space-y-6">
        {isLoading ? (
          <PageSkeleton variant="chart" showHeader={false} className="px-0 py-0" />
        ) : !hasData ? (
          <CrmEmptyState
            icon={<BarChart3 className="h-5 w-5" />}
            title="Nenhum snapshot disponivel"
            description="O cron de snapshots roda diariamente as 06h UTC. Apos a primeira execucao, os reports comecam a aparecer aqui."
          />
        ) : (
          <>
            {/* Pipeline value over time */}
            <ChartCard title="Pipeline value vs Ganhos 30d (Sales)">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={orgSeries}>
                  <defs>
                    <linearGradient id="g-pipeline" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--crm-accent)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--crm-accent)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g-won" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--crm-success-fg)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--crm-success-fg)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--crm-gray-200)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} tickFormatter={fmtBRLAxis} />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 4,
                      border: "1px solid var(--crm-gray-200)",
                      background: "var(--crm-gray-0)",
                    }}
                    formatter={fmtBRLTooltip}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="pipeline" name="Pipeline" stroke="var(--crm-accent)" fill="url(#g-pipeline)" strokeWidth={2} />
                  <Area type="monotone" dataKey="won_30d" name="Ganhos 30d" stroke="var(--crm-success-fg)" fill="url(#g-won)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <ChartCard title="Win rate (%) e ciclo medio (dias)">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={orgSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--crm-gray-200)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 4,
                        border: "1px solid var(--crm-gray-200)",
                        background: "var(--crm-gray-0)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line yAxisId="left" type="monotone" dataKey="win_rate" name="Win rate %" stroke="var(--crm-success-fg)" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="cycle" name="Ciclo (dias)" stroke="var(--crm-warning-fg)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Health score medio e NPS">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={orgSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--crm-gray-200)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 4,
                        border: "1px solid var(--crm-gray-200)",
                        background: "var(--crm-gray-0)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="health" name="Health" stroke="var(--crm-accent)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="nps" name="NPS" stroke="var(--crm-info-fg)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="MRR carteira ativa">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={orgSeries}>
                    <defs>
                      <linearGradient id="g-mrr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--crm-success-fg)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--crm-success-fg)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--crm-gray-200)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} tickFormatter={fmtBRLAxis} />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 4,
                        border: "1px solid var(--crm-gray-200)",
                        background: "var(--crm-gray-0)",
                      }}
                      formatter={fmtBRLTooltip}
                    />
                    <Area type="monotone" dataKey="mrr" name="MRR" stroke="var(--crm-success-fg)" fill="url(#g-mrr)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Lojas e inbox aberto">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={orgSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--crm-gray-200)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 4,
                        border: "1px solid var(--crm-gray-200)",
                        background: "var(--crm-gray-0)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="stores" name="Lojas ativas" stroke="var(--crm-gray-700)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="critical" name="Em risco" stroke="var(--crm-danger-fg)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="inbox" name="Inbox aberto" stroke="var(--crm-info-fg)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Funnel */}
            {funnelSeries.length > 0 && (
              <ChartCard title="Funil de leads (snapshot diario)">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={funnelSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--crm-gray-200)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 4,
                        border: "1px solid var(--crm-gray-200)",
                        background: "var(--crm-gray-0)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="new" name="Novos" stroke="var(--crm-info-fg)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="qualified" name="Qualificados" stroke="var(--crm-warning-fg)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="converted" name="Convertidos" stroke="var(--crm-success-fg)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="lost" name="Perdidos" stroke="var(--crm-danger-fg)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </>
        )}
      </div>
    </CrmPageShell>
  )
}

function ChartCard({
  title,
  children,
  size = "md",
}: {
  title: string
  children: React.ReactNode
  /** sm = 180px mobile / 200px desktop. md = 200/240. lg = 220/280. */
  size?: "sm" | "md" | "lg"
}) {
  const heightClass =
    size === "sm"
      ? "h-[180px] sm:h-[200px]"
      : size === "lg"
        ? "h-[220px] sm:h-[280px]"
        : "h-[200px] sm:h-[240px]"
  return (
    <div className="crm-card">
      <h3
        style={{
          fontSize: "var(--crm-text-xs)",
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: "var(--crm-weight-medium)",
          marginBottom: "var(--crm-space-3)",
        }}
      >
        {title}
      </h3>
      <div className={heightClass}>{children}</div>
    </div>
  )
}
