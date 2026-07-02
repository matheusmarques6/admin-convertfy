"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import dynamic from "next/dynamic"
import { Download, BarChart3 } from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { PageSkeleton } from "@/components/ui/page-skeleton"

const CrmReportsCharts = dynamic(
  () => import("@/components/crm/crm-reports-charts").then((mod) => ({ default: mod.CrmReportsCharts })),
  {
    loading: () => <PageSkeleton variant="chart" showHeader={false} className="px-0 py-0" />,
    ssr: false,
  }
)

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
          <CrmReportsCharts orgSeries={orgSeries} funnelSeries={funnelSeries} />
        )}
      </div>
    </CrmPageShell>
  )
}
