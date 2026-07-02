"use client"

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

export interface CrmOrgSeriesPoint {
  day: string
  pipeline: number
  won_30d: number
  win_rate: number
  cycle: number
  mrr: number
  health: number
  nps: number
  stores: number
  inbox: number
  critical: number
}

export interface CrmFunnelSeriesPoint {
  day: string
  new: number
  qualified: number
  converted: number
  lost: number
  created: number
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

export function CrmReportsCharts({
  orgSeries,
  funnelSeries,
}: {
  orgSeries: CrmOrgSeriesPoint[]
  funnelSeries: CrmFunnelSeriesPoint[]
}) {
  return (
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
