"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  AlertTriangle,
  BarChart3,
  Download,
  Heart,
  Inbox,
  Smile,
  TrendingUp,
  Users,
} from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { PageSkeleton } from "@/components/ui/page-skeleton"

/**
 * Reports de Customer Success — versao dedicada (sem ruido de sales).
 *
 * Consome /api/crm/reports/timeseries (mesma fonte) mas filtra pra
 * mostrar apenas campos CS-relevantes:
 *   - MRR carteira ativa (evolucao)
 *   - Lojas ativas / em risco / criticas (evolucao + composicao)
 *   - Health score medio
 *   - NPS (score + respostas)
 *   - Inbox CS (aberto + pending)
 *
 * KPIs do topo mostram valor atual + delta vs primeiro dia da janela.
 */

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface OrgSnapshot {
  day: string
  active_stores_count: number
  total_mrr_cents: number
  avg_health_score: number | null
  critical_health_count: number
  warning_health_count: number
  healthy_count: number
  nps_score: number | null
  nps_responses_30d: number
  inbox_open_threads: number
  inbox_pending_threads: number
}

interface ReportData {
  window_days: number
  org_snapshots: OrgSnapshot[]
}

const fmtBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(cents / 100)

const fmtBRLTooltip = (v: unknown): string => {
  const n = typeof v === "number" ? v : Number(v) || 0
  // tooltip recebe valor em reais (ja convertido na serie)
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n)
}
const fmtBRLAxis = fmtBRLTooltip

export default function CsReportsPage() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useSWR<{
    org_snapshots: OrgSnapshot[]
    data?: ReportData
  }>(`/api/crm/reports/timeseries?days=${days}`, fetcher)

  const snaps: OrgSnapshot[] = useMemo(
    () => data?.data?.org_snapshots ?? data?.org_snapshots ?? [],
    [data],
  )
  const hasData = snaps.length > 0

  const series = useMemo(() => {
    return snaps.map((s) => ({
      day: s.day.slice(5),
      mrr: (Number(s.total_mrr_cents) || 0) / 100,
      stores: s.active_stores_count,
      healthy: s.healthy_count,
      warning: s.warning_health_count,
      critical: s.critical_health_count,
      health: Number(s.avg_health_score) || 0,
      nps: Number(s.nps_score) || 0,
      nps_resp: s.nps_responses_30d,
      inbox_open: s.inbox_open_threads,
      inbox_pending: s.inbox_pending_threads,
    }))
  }, [snaps])

  const kpis = useMemo(() => {
    if (snaps.length === 0) return null
    const last = snaps[snaps.length - 1]
    const first = snaps[0]
    const deltaPct = (now: number, prev: number) => {
      if (prev === 0) return null
      return ((now - prev) / prev) * 100
    }
    return {
      mrr: last.total_mrr_cents,
      mrr_delta: deltaPct(last.total_mrr_cents, first.total_mrr_cents),
      stores: last.active_stores_count,
      stores_delta: deltaPct(last.active_stores_count, first.active_stores_count),
      health: last.avg_health_score,
      health_delta:
        last.avg_health_score != null && first.avg_health_score != null
          ? last.avg_health_score - first.avg_health_score
          : null,
      nps: last.nps_score,
      nps_delta:
        last.nps_score != null && first.nps_score != null
          ? last.nps_score - first.nps_score
          : null,
      critical: last.critical_health_count,
      warning: last.warning_health_count,
      inbox_open: last.inbox_open_threads,
    }
  }, [snaps])

  const exportCsv = () => {
    if (!hasData) return
    const rows = [
      [
        "day",
        "mrr_reais",
        "active_stores",
        "healthy",
        "warning",
        "critical",
        "avg_health",
        "nps",
        "nps_responses_30d",
        "inbox_open",
        "inbox_pending",
      ],
      ...snaps.map((s) => [
        s.day,
        (s.total_mrr_cents || 0) / 100,
        s.active_stores_count,
        s.healthy_count,
        s.warning_health_count,
        s.critical_health_count,
        s.avg_health_score ?? "",
        s.nps_score ?? "",
        s.nps_responses_30d ?? "",
        s.inbox_open_threads,
        s.inbox_pending_threads,
      ]),
    ]
    const csv = rows
      .map((r) => r.map((v) => (v == null ? "" : String(v))).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `cs-report-${days}d-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <CrmPageShell
      title="Reports de Customer Success"
      subtitle={`Saúde da carteira · janela ${days}d · snapshot diário 06h UTC`}
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
        ) : !hasData || !kpis ? (
          <CrmEmptyState
            icon={<BarChart3 className="h-5 w-5" />}
            title="Nenhum snapshot disponível"
            description="O cron de snapshots roda diariamente às 06h UTC. Após a primeira execução, os reports começam a aparecer aqui."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                icon={<TrendingUp className="h-4 w-4" />}
                label="MRR carteira"
                value={fmtBRL(kpis.mrr)}
                delta={kpis.mrr_delta}
                deltaSuffix="%"
                color="success"
              />
              <Kpi
                icon={<Users className="h-4 w-4" />}
                label="Lojas ativas"
                value={String(kpis.stores)}
                delta={kpis.stores_delta}
                deltaSuffix="%"
              />
              <Kpi
                icon={<Heart className="h-4 w-4" />}
                label="Health médio"
                value={kpis.health != null ? kpis.health.toFixed(0) : "—"}
                delta={kpis.health_delta}
                deltaSuffix=" pts"
              />
              <Kpi
                icon={<Smile className="h-4 w-4" />}
                label="NPS"
                value={
                  kpis.nps != null
                    ? `${kpis.nps > 0 ? "+" : ""}${kpis.nps.toFixed(0)}`
                    : "—"
                }
                delta={kpis.nps_delta}
                deltaSuffix=" pts"
              />
            </div>

            {(kpis.critical > 0 || kpis.warning > 0) && (
              <div
                className="crm-card flex items-center gap-3"
                style={{
                  borderColor: kpis.critical > 0 ? "#FECACA" : "#FDE68A",
                  background: kpis.critical > 0 ? "#FEF2F2" : "#FFFBEB",
                }}
              >
                <AlertTriangle
                  className="h-4 w-4"
                  style={{ color: kpis.critical > 0 ? "#991B1B" : "#92400E" }}
                />
                <span
                  style={{
                    fontSize: 13,
                    color: kpis.critical > 0 ? "#991B1B" : "#92400E",
                    fontWeight: 500,
                  }}
                >
                  {kpis.critical > 0 && (
                    <>
                      <strong>{kpis.critical}</strong> loja
                      {kpis.critical === 1 ? "" : "s"} crítica
                      {kpis.critical === 1 ? "" : "s"} (health &lt; 50)
                    </>
                  )}
                  {kpis.critical > 0 && kpis.warning > 0 && " · "}
                  {kpis.warning > 0 && (
                    <>
                      <strong>{kpis.warning}</strong> em atenção
                    </>
                  )}
                </span>
              </div>
            )}

            <ChartCard title="MRR carteira ativa">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <defs>
                    <linearGradient id="g-cs-mrr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--crm-success-fg)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--crm-success-fg)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--crm-gray-200)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }}
                    tickFormatter={fmtBRLAxis}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 4,
                      border: "1px solid var(--crm-gray-200)",
                      background: "var(--crm-gray-0)",
                    }}
                    formatter={fmtBRLTooltip}
                  />
                  <Area
                    type="monotone"
                    dataKey="mrr"
                    name="MRR"
                    stroke="var(--crm-success-fg)"
                    fill="url(#g-cs-mrr)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <ChartCard title="Health score médio + NPS">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--crm-gray-200)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }}
                      domain={[0, 100]}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }}
                      domain={[-100, 100]}
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 4,
                        border: "1px solid var(--crm-gray-200)",
                        background: "var(--crm-gray-0)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="health"
                      name="Health médio"
                      stroke="#10B981"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="nps"
                      name="NPS"
                      stroke="var(--crm-info-fg)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Composição da carteira (saúde)">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} stackOffset="expand">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--crm-gray-200)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--crm-gray-500)" }}
                      tickFormatter={(v) => `${Math.round((v as number) * 100)}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 4,
                        border: "1px solid var(--crm-gray-200)",
                        background: "var(--crm-gray-0)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="healthy"
                      name="Saudáveis"
                      stackId="1"
                      stroke="#10B981"
                      fill="#10B981"
                      fillOpacity={0.7}
                    />
                    <Area
                      type="monotone"
                      dataKey="warning"
                      name="Em atenção"
                      stackId="1"
                      stroke="#F59E0B"
                      fill="#F59E0B"
                      fillOpacity={0.7}
                    />
                    <Area
                      type="monotone"
                      dataKey="critical"
                      name="Críticas"
                      stackId="1"
                      stroke="#EF4444"
                      fill="#EF4444"
                      fillOpacity={0.7}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Lojas ativas vs em risco">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
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
                    <Line
                      type="monotone"
                      dataKey="stores"
                      name="Lojas ativas"
                      stroke="var(--crm-gray-700)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="critical"
                      name="Em risco (crítica)"
                      stroke="#EF4444"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title={
                  <span className="inline-flex items-center gap-1.5">
                    <Inbox className="h-3.5 w-3.5" />
                    Inbox de atendimento
                  </span>
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="g-inbox-open" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--crm-info-fg)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--crm-info-fg)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
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
                    <Area
                      type="monotone"
                      dataKey="inbox_open"
                      name="Threads abertos"
                      stroke="var(--crm-info-fg)"
                      fill="url(#g-inbox-open)"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="inbox_pending"
                      name="Pendentes resposta"
                      stroke="var(--crm-warning-fg)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </>
        )}
      </div>
    </CrmPageShell>
  )
}

function Kpi({
  icon,
  label,
  value,
  delta,
  deltaSuffix,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  delta?: number | null
  deltaSuffix?: string
  color?: "success" | "default"
}) {
  const valueColor =
    color === "success" ? "var(--crm-success-fg)" : "var(--crm-gray-900)"
  const deltaPositive = delta != null && delta >= 0
  return (
    <div className="crm-card flex flex-col gap-1.5">
      <div
        className="flex items-center gap-2"
        style={{
          fontSize: "var(--crm-text-xs)",
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: "var(--crm-weight-medium)",
        }}
      >
        {icon}
        {label}
      </div>
      <div
        style={{
          fontSize: "var(--crm-text-2xl)",
          fontWeight: "var(--crm-weight-medium)",
          color: valueColor,
          fontFamily: "var(--crm-font-mono)",
          lineHeight: "var(--crm-leading-tight)",
        }}
      >
        {value}
      </div>
      {delta != null && (
        <div
          style={{
            fontSize: "var(--crm-text-xs)",
            color: deltaPositive ? "var(--crm-success-fg)" : "var(--crm-danger-fg)",
            fontFamily: "var(--crm-font-mono)",
          }}
        >
          {deltaPositive ? "+" : ""}
          {delta.toFixed(1)}
          {deltaSuffix ?? ""}
          <span style={{ color: "var(--crm-gray-500)", marginLeft: 4 }}>
            no período
          </span>
        </div>
      )}
    </div>
  )
}

function ChartCard({
  title,
  children,
  size = "md",
}: {
  title: React.ReactNode
  children: React.ReactNode
  /** sm = 180/200, md = 200/240, lg = 220/280 */
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
