"use client"

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
import { Inbox } from "lucide-react"

export interface CsSeriesPoint {
  day: string
  mrr: number
  stores: number
  healthy: number
  warning: number
  critical: number
  health: number
  nps: number
  nps_resp: number
  inbox_open: number
  inbox_pending: number
}

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

export function CsReportsCharts({ series }: { series: CsSeriesPoint[] }) {
  return (
    <>
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
