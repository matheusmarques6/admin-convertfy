"use client"

import useSWR from "swr"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { Heart, AlertTriangle, TrendingUp, MessageSquare } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface CsDashboard {
  total_stores: number
  health_distribution: { healthy: number; warning: number; critical: number; no_score: number }
  total_mrr_cents: number
  nps: { score: number | null; avg: number | null; count: number; promoters: number; passives: number; detractors: number }
  at_risk: Array<{ store_id: string; store_name: string; client_name: string; health_score: number | null; mrr_cents: number | null; nps: number | null }>
  by_pipeline: Array<{ id: string; name: string; color: string | null; open_count: number }>
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v)

export default function CsDashboardPage() {
  const { data, isLoading } = useSWR<{ data: CsDashboard }>("/api/crm/dashboard/cs", fetcher)
  const d = data?.data

  return (
    <CrmPageShell
      title="Customer Success"
      subtitle="Carteira ativa, health score, NPS e SLA"
    >
      <div className="p-6">
        {isLoading || !d ? (
          <div style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}>
            Carregando metricas...
          </div>
        ) : d.total_stores === 0 ? (
          <CrmEmptyState
            icon={<Heart className="h-5 w-5" />}
            title="Nenhuma loja ativa na carteira"
            description="Cadastre lojas com contrato ativo para acompanhar health score e NPS."
          />
        ) : (
          <div className="space-y-6">
            {/* KPIs principais */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                icon={<Heart className="h-4 w-4" />}
                label="Carteira ativa"
                value={`${d.total_stores}`}
                hint="Lojas com contrato ativo"
              />
              <Kpi
                icon={<TrendingUp className="h-4 w-4" />}
                label="MRR total"
                value={fmtBRL(d.total_mrr_cents / 100)}
                hint="Soma das lojas ativas"
              />
              <Kpi
                icon={<MessageSquare className="h-4 w-4" />}
                label="NPS"
                value={d.nps.score != null ? d.nps.score.toFixed(0) : "—"}
                hint={d.nps.count > 0 ? `${d.nps.count} respostas` : "Sem respostas"}
                color={
                  d.nps.score == null
                    ? "default"
                    : d.nps.score >= 50
                      ? "success"
                      : d.nps.score >= 0
                        ? "default"
                        : "danger"
                }
              />
              <Kpi
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Em risco"
                value={`${d.health_distribution.critical}`}
                hint={`Health < 50 · ${d.health_distribution.warning} em atencao`}
                color={d.health_distribution.critical > 0 ? "danger" : "default"}
              />
            </div>

            {/* Distribuicao de health */}
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
                Distribuicao de health
              </h3>
              <HealthBar dist={d.health_distribution} total={d.total_stores} />
            </section>

            {/* Lojas em risco */}
            {d.at_risk.length > 0 && (
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
                  Lojas em risco (top 10)
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
                        <Th>LOJA</Th>
                        <Th>CLIENTE</Th>
                        <Th align="right">HEALTH</Th>
                        <Th align="right">NPS</Th>
                        <Th align="right">MRR</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.at_risk.map((s) => (
                        <tr
                          key={s.store_id}
                          style={{ height: "var(--crm-table-row-height)", borderTop: "1px solid var(--crm-gray-200)" }}
                        >
                          <td className="px-3" style={{ color: "var(--crm-gray-900)", fontWeight: "var(--crm-weight-medium)" }}>
                            {s.store_name}
                          </td>
                          <td className="px-3" style={{ color: "var(--crm-gray-700)" }}>{s.client_name}</td>
                          <td className="px-3 text-right tabular-nums">
                            <span
                              style={{
                                color: "var(--crm-danger-fg)",
                                fontWeight: "var(--crm-weight-medium)",
                                fontFamily: "var(--crm-font-mono)",
                              }}
                            >
                              {s.health_score ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 text-right tabular-nums" style={{ color: "var(--crm-gray-700)", fontFamily: "var(--crm-font-mono)" }}>
                            {s.nps ?? "—"}
                          </td>
                          <td className="px-3 text-right tabular-nums" style={{ color: "var(--crm-gray-700)", fontFamily: "var(--crm-font-mono)" }}>
                            {s.mrr_cents != null ? fmtBRL(s.mrr_cents / 100) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Deals CS abertos por pipeline */}
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
                  Cards CS abertos
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {d.by_pipeline.map((p) => (
                    <div key={p.id} className="crm-card">
                      <div
                        style={{
                          fontSize: "var(--crm-text-xs)",
                          color: "var(--crm-gray-500)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          fontWeight: "var(--crm-weight-medium)",
                        }}
                      >
                        {p.name}
                      </div>
                      <div
                        className="mt-1"
                        style={{
                          fontSize: "var(--crm-text-2xl)",
                          fontWeight: "var(--crm-weight-medium)",
                          color: "var(--crm-gray-900)",
                          fontFamily: "var(--crm-font-mono)",
                          lineHeight: "var(--crm-leading-tight)",
                        }}
                      >
                        {p.open_count}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </CrmPageShell>
  )
}

function HealthBar({
  dist,
  total,
}: {
  dist: { healthy: number; warning: number; critical: number; no_score: number }
  total: number
}) {
  if (total === 0) return null
  const pct = (n: number) => (n / total) * 100

  return (
    <div className="crm-card">
      <div
        className="flex h-2 w-full overflow-hidden"
        style={{ borderRadius: "var(--crm-radius-sm)", background: "var(--crm-gray-100)" }}
      >
        <div style={{ width: `${pct(dist.healthy)}%`, background: "var(--crm-success-fg)" }} />
        <div style={{ width: `${pct(dist.warning)}%`, background: "var(--crm-warning-fg)" }} />
        <div style={{ width: `${pct(dist.critical)}%`, background: "var(--crm-danger-fg)" }} />
        <div style={{ width: `${pct(dist.no_score)}%`, background: "var(--crm-gray-300)" }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Legend
          color="var(--crm-success-fg)"
          label="Saudavel (>=70)"
          count={dist.healthy}
          pct={pct(dist.healthy)}
        />
        <Legend
          color="var(--crm-warning-fg)"
          label="Atencao (50-69)"
          count={dist.warning}
          pct={pct(dist.warning)}
        />
        <Legend
          color="var(--crm-danger-fg)"
          label="Critico (<50)"
          count={dist.critical}
          pct={pct(dist.critical)}
        />
        <Legend
          color="var(--crm-gray-400)"
          label="Sem score"
          count={dist.no_score}
          pct={pct(dist.no_score)}
        />
      </div>
    </div>
  )
}

function Legend({ color, label, count, pct }: { color: string; label: string; count: number; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ width: 8, height: 8, borderRadius: "var(--crm-radius-full)", background: color }} />
      <div className="flex flex-col">
        <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>{label}</span>
        <span
          style={{
            fontSize: "var(--crm-text-sm)",
            color: "var(--crm-gray-900)",
            fontFamily: "var(--crm-font-mono)",
            fontWeight: "var(--crm-weight-medium)",
          }}
        >
          {count} ({pct.toFixed(0)}%)
        </span>
      </div>
    </div>
  )
}

function Kpi({ icon, label, value, hint, color }: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  color?: "success" | "default" | "danger"
}) {
  const colorMap: Record<string, string> = {
    success: "var(--crm-success-fg)",
    danger: "var(--crm-danger-fg)",
    default: "var(--crm-gray-900)",
  }
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
          color: colorMap[color || "default"],
          fontFamily: "var(--crm-font-mono)",
          lineHeight: "var(--crm-leading-tight)",
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>{hint}</div>
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
