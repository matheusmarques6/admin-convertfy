"use client"

import { useState } from "react"
import useSWR from "swr"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { TrendingUp, Trophy, Target, Clock, BarChart3 } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface DashboardData {
  window_days: number
  pipeline_value: number
  won_value: number
  lost_value: number
  open_count: number
  won_count: number
  lost_count: number
  win_rate: number
  avg_cycle_days: number
  by_pipeline: Array<{ id: string; name: string; color: string | null; open_value: number; open_count: number; won_value: number; won_count: number }>
  by_source: Array<{ source: string; open_count: number; won_count: number; won_value: number }>
  recent_wins: Array<{ id: string; title: string; value: number | null; won_at: string | null; pipeline_id: string }>
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v)

export default function SalesDashboardPage() {
  const [days, setDays] = useState(30)

  const { data, isLoading } = useSWR<{ data: DashboardData }>(
    `/api/crm/dashboard/sales?days=${days}`,
    fetcher,
  )

  const d = data?.data

  return (
    <CrmPageShell
      title="Dashboard comercial"
      subtitle={`Janela: ${days} dias · Pipeline value e fechamentos`}
      actions={
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
      }
    >
      <div className="p-6">
        {isLoading || !d ? (
          <div style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}>
            Carregando metricas...
          </div>
        ) : d.open_count === 0 && d.won_count === 0 && d.lost_count === 0 ? (
          <CrmEmptyState
            icon={<BarChart3 className="h-5 w-5" />}
            title="Sem deals na janela selecionada"
            description="Crie deals em qualquer pipeline comercial para comecar a ver KPIs aqui."
          />
        ) : (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                icon={<TrendingUp className="h-4 w-4" />}
                label="Pipeline value"
                value={fmtBRL(d.pipeline_value)}
                hint={`${d.open_count} deals abertos`}
              />
              <Kpi
                icon={<Trophy className="h-4 w-4" />}
                label="Ganhos"
                value={fmtBRL(d.won_value)}
                hint={`${d.won_count} deals em ${d.window_days}d`}
                color="success"
              />
              <Kpi
                icon={<Target className="h-4 w-4" />}
                label="Win rate"
                value={`${d.win_rate.toFixed(1)}%`}
                hint={`${d.won_count}W · ${d.lost_count}L`}
              />
              <Kpi
                icon={<Clock className="h-4 w-4" />}
                label="Ciclo medio"
                value={`${d.avg_cycle_days.toFixed(0)}d`}
                hint="Criacao -> ganho"
              />
            </div>

            {/* By pipeline */}
            {d.by_pipeline.length > 0 && (
              <section>
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
                  Por pipeline
                </h3>
                <div
                  className="overflow-hidden"
                  style={{
                    border: "1px solid var(--crm-gray-200)",
                    borderRadius: "var(--crm-radius-md)",
                    background: "var(--crm-gray-0)",
                  }}
                >
                  <table className="w-full" style={{ fontSize: "var(--crm-text-base)" }}>
                    <thead>
                      <tr style={{ background: "var(--crm-gray-50)", height: "var(--crm-table-header-height)" }}>
                        <Th>PIPELINE</Th>
                        <Th align="right">ABERTOS</Th>
                        <Th align="right">VALOR ABERTO</Th>
                        <Th align="right">GANHOS</Th>
                        <Th align="right">VALOR GANHO</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.by_pipeline.map((p) => (
                        <tr
                          key={p.id}
                          style={{
                            height: "var(--crm-table-row-height)",
                            borderTop: "1px solid var(--crm-gray-200)",
                          }}
                        >
                          <td className="px-3" style={{ color: "var(--crm-gray-900)", fontWeight: "var(--crm-weight-medium)" }}>
                            {p.name}
                          </td>
                          <td className="px-3 text-right tabular-nums" style={{ color: "var(--crm-gray-700)" }}>
                            {p.open_count}
                          </td>
                          <td className="px-3 text-right tabular-nums" style={{ color: "var(--crm-gray-900)", fontFamily: "var(--crm-font-mono)" }}>
                            {fmtBRL(p.open_value)}
                          </td>
                          <td className="px-3 text-right tabular-nums" style={{ color: "var(--crm-gray-700)" }}>
                            {p.won_count}
                          </td>
                          <td className="px-3 text-right tabular-nums" style={{ color: "var(--crm-success-fg)", fontFamily: "var(--crm-font-mono)" }}>
                            {fmtBRL(p.won_value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* By source */}
            {d.by_source.length > 0 && (
              <section>
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
                  Por fonte
                </h3>
                <div
                  className="overflow-hidden"
                  style={{
                    border: "1px solid var(--crm-gray-200)",
                    borderRadius: "var(--crm-radius-md)",
                    background: "var(--crm-gray-0)",
                  }}
                >
                  <table className="w-full" style={{ fontSize: "var(--crm-text-base)" }}>
                    <thead>
                      <tr style={{ background: "var(--crm-gray-50)", height: "var(--crm-table-header-height)" }}>
                        <Th>FONTE</Th>
                        <Th align="right">ABERTOS</Th>
                        <Th align="right">GANHOS</Th>
                        <Th align="right">VALOR GANHO</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.by_source.map((s) => (
                        <tr
                          key={s.source}
                          style={{
                            height: "var(--crm-table-row-height)",
                            borderTop: "1px solid var(--crm-gray-200)",
                          }}
                        >
                          <td className="px-3" style={{ color: "var(--crm-gray-900)" }}>{s.source}</td>
                          <td className="px-3 text-right tabular-nums" style={{ color: "var(--crm-gray-700)" }}>{s.open_count}</td>
                          <td className="px-3 text-right tabular-nums" style={{ color: "var(--crm-gray-700)" }}>{s.won_count}</td>
                          <td className="px-3 text-right tabular-nums" style={{ color: "var(--crm-success-fg)", fontFamily: "var(--crm-font-mono)" }}>
                            {fmtBRL(s.won_value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Recent wins */}
            {d.recent_wins.length > 0 && (
              <section>
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
                  Ultimos ganhos
                </h3>
                <ul className="space-y-2">
                  {d.recent_wins.map((w) => (
                    <li
                      key={w.id}
                      className="crm-card flex items-center justify-between"
                    >
                      <span style={{ color: "var(--crm-gray-900)", fontWeight: "var(--crm-weight-medium)" }}>
                        {w.title}
                      </span>
                      <span className="flex items-center gap-3">
                        {w.value != null && (
                          <span style={{ color: "var(--crm-success-fg)", fontFamily: "var(--crm-font-mono)", fontWeight: "var(--crm-weight-medium)" }}>
                            {fmtBRL(w.value)}
                          </span>
                        )}
                        <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
                          {w.won_at && new Date(w.won_at).toLocaleDateString("pt-BR")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </CrmPageShell>
  )
}

function Kpi({ icon, label, value, hint, color }: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  color?: "success" | "default"
}) {
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
          color: color === "success" ? "var(--crm-success-fg)" : "var(--crm-gray-900)",
          fontFamily: "var(--crm-font-mono)",
          lineHeight: "var(--crm-leading-tight)",
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
          {hint}
        </div>
      )}
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="font-medium px-3"
      style={{
        textAlign: align || "left",
        color: "var(--crm-gray-600)",
        fontSize: "var(--crm-text-xs)",
      }}
    >
      {children}
    </th>
  )
}
