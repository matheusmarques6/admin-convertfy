"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import {
  AlertTriangle,
  Heart,
  HeartHandshake,
  RefreshCw,
  Smile,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react"

/**
 * Dashboard do workspace OPERACIONAL (Customer Success).
 *
 * Espelha o pattern do /admin/comercial/dashboard mas focado em CS:
 *  - KPIs: MRR carteira, lojas ativas, NPS, lojas em risco
 *  - Distribuicao de saude (saudavel/atencao/critico/sem_score)
 *  - Pipelines CS abertos (open_count por pipeline)
 *  - Top 10 lojas em risco (drill-in)
 *
 * Consome /api/crm/dashboard/cs (ja existente).
 */

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const json = await r.json()
  return json?.data ?? json
}

interface CsDashboardData {
  total_stores: number
  health_distribution: {
    healthy: number
    warning: number
    critical: number
    no_score: number
  }
  total_mrr_cents: number
  nps: {
    score: number | null
    avg: number | null
    count: number
    promoters: number
    passives: number
    detractors: number
  }
  at_risk: Array<{
    store_id: string
    store_name: string
    client_name: string | null
    health_score: number | null
    mrr_cents: number | null
    nps_last_score: number | null
  }>
  by_pipeline: Array<{
    id: string
    name: string
    color: string | null
    open_count: number
  }>
}

const fmtBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(cents / 100)

export default function CsDashboardPage() {
  const { data, isLoading, mutate } = useSWR<CsDashboardData>(
    "/api/crm/dashboard/cs",
    fetcher,
    { revalidateOnFocus: false },
  )

  const d = data

  const [runningHealth, setRunningHealth] = useState(false)
  const [runningRenewal, setRunningRenewal] = useState(false)
  const [runMessage, setRunMessage] = useState<string | null>(null)

  async function runHealthNow() {
    if (runningHealth) return
    setRunningHealth(true)
    setRunMessage(null)
    try {
      const r = await fetch("/api/admin/crm-health/compute-now", {
        method: "POST",
        credentials: "include",
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body?.error?.message || "Falha no recalculo")
      const res = body.data ?? body
      setRunMessage(
        `Health recalculado: ${res.ok}/${res.total} OK · ${res.alerts_created} novo(s) alerta(s) CS`,
      )
      await mutate()
    } catch (e) {
      setRunMessage(`Erro: ${(e as Error).message}`)
    } finally {
      setRunningHealth(false)
    }
  }

  async function runRenewalNow() {
    if (runningRenewal) return
    setRunningRenewal(true)
    setRunMessage(null)
    try {
      const r = await fetch("/api/admin/crm-renewal/detect-now", {
        method: "POST",
        credentials: "include",
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body?.error?.message || "Falha na deteccao")
      const res = body.data ?? body
      setRunMessage(
        `Renovacoes: ${res.scanned} loja(s) na janela · ${res.created} novo(s) lead(s) · ${res.skipped} ja flaggadas`,
      )
      await mutate()
    } catch (e) {
      setRunMessage(`Erro: ${(e as Error).message}`)
    } finally {
      setRunningRenewal(false)
    }
  }

  const healthPct = useMemo(() => {
    if (!d) return null
    const total =
      d.health_distribution.healthy +
      d.health_distribution.warning +
      d.health_distribution.critical +
      d.health_distribution.no_score
    if (total === 0) return null
    return {
      healthy: (d.health_distribution.healthy / total) * 100,
      warning: (d.health_distribution.warning / total) * 100,
      critical: (d.health_distribution.critical / total) * 100,
      no_score: (d.health_distribution.no_score / total) * 100,
    }
  }, [d])

  const npsLabel = useMemo(() => {
    if (!d?.nps?.score && d?.nps?.score !== 0) return "—"
    const s = d.nps.score
    return s > 0 ? `+${s.toFixed(0)}` : s.toFixed(0)
  }, [d])

  return (
    <CrmPageShell
      title="Dashboard de Customer Success"
      subtitle="Saúde da carteira ativa, MRR, NPS e pipelines em andamento"
      actions={
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--crm-space-2)",
          }}
        >
          <button
            onClick={runHealthNow}
            disabled={runningHealth || runningRenewal}
            title="Recalcula health score de todas as lojas e cria leads CS pra criticas (<50). Cron real roda 5h UTC."
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              background: "#fff",
              border: "1px solid var(--crm-border)",
              color: "var(--crm-gray-700)",
              cursor: runningHealth ? "wait" : "pointer",
              opacity: runningHealth || runningRenewal ? 0.6 : 1,
            }}
          >
            <Zap className="h-3.5 w-3.5" />
            {runningHealth ? "Recalculando..." : "Recalcular health"}
          </button>
          <button
            onClick={runRenewalNow}
            disabled={runningHealth || runningRenewal}
            title="Detecta lojas com contract_end_date em ate 60d e cria leads renewal_opportunity. Cron real roda 7h UTC."
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              background: "#fff",
              border: "1px solid var(--crm-border)",
              color: "var(--crm-gray-700)",
              cursor: runningRenewal ? "wait" : "pointer",
              opacity: runningHealth || runningRenewal ? 0.6 : 1,
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {runningRenewal ? "Detectando..." : "Detectar renovações"}
          </button>
        </div>
      }
    >
      <div className="p-6">
        {runMessage && (
          <div
            style={{
              marginBottom: 16,
              padding: "8px 12px",
              background: runMessage.startsWith("Erro")
                ? "#FEF2F2"
                : "#ECFDF5",
              color: runMessage.startsWith("Erro") ? "#991B1B" : "#065F46",
              border: `1px solid ${runMessage.startsWith("Erro") ? "#FECACA" : "#A7F3D0"}`,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {runMessage}
          </div>
        )}
        {isLoading || !d ? (
          <PageSkeleton variant="metrics" showHeader={false} className="px-0 py-0" />
        ) : d.total_stores === 0 ? (
          <CrmEmptyState
            icon={<HeartHandshake className="h-5 w-5" />}
            title="Nenhuma loja ativa na carteira"
            description="Quando você tiver lojas ativas vinculadas a clientes, elas aparecem aqui com health, MRR e NPS."
            action={
              <Link
                href="/admin/operacional/pipelines"
                className="crm-button-primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--crm-space-2)",
                }}
              >
                Abrir pipelines CS
              </Link>
            }
          />
        ) : (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                icon={<TrendingUp className="h-4 w-4" />}
                label="MRR carteira"
                value={fmtBRL(d.total_mrr_cents)}
                hint={`${d.total_stores} ${d.total_stores === 1 ? "loja ativa" : "lojas ativas"}`}
                color="success"
              />
              <Kpi
                icon={<Users className="h-4 w-4" />}
                label="Lojas ativas"
                value={String(d.total_stores)}
                hint={
                  healthPct
                    ? `${d.health_distribution.healthy} saudáveis · ${d.health_distribution.critical} críticas`
                    : undefined
                }
              />
              <Kpi
                icon={<Smile className="h-4 w-4" />}
                label="NPS"
                value={npsLabel}
                hint={
                  d.nps.count > 0
                    ? `${d.nps.count} resp · ${d.nps.promoters}P · ${d.nps.passives}N · ${d.nps.detractors}D`
                    : "Sem respostas no período"
                }
              />
              <Kpi
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Lojas em risco"
                value={String(
                  d.health_distribution.critical + d.health_distribution.warning,
                )}
                hint={`${d.health_distribution.critical} críticas · ${d.health_distribution.warning} em atenção`}
                color={d.health_distribution.critical > 0 ? "danger" : "default"}
              />
            </div>

            {/* Distribuicao de saude */}
            {healthPct && (
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
                  Distribuição de saúde
                </h3>
                <div
                  className="crm-card"
                  style={{
                    padding: "var(--crm-space-4)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  {/* Barra empilhada */}
                  <div
                    style={{
                      display: "flex",
                      height: 10,
                      borderRadius: 999,
                      overflow: "hidden",
                      background: "var(--crm-gray-100)",
                    }}
                  >
                    {healthPct.healthy > 0 && (
                      <div
                        style={{ width: `${healthPct.healthy}%`, background: "#10B981" }}
                        title={`${d.health_distribution.healthy} saudáveis`}
                      />
                    )}
                    {healthPct.warning > 0 && (
                      <div
                        style={{ width: `${healthPct.warning}%`, background: "#F59E0B" }}
                        title={`${d.health_distribution.warning} em atenção`}
                      />
                    )}
                    {healthPct.critical > 0 && (
                      <div
                        style={{ width: `${healthPct.critical}%`, background: "#EF4444" }}
                        title={`${d.health_distribution.critical} críticas`}
                      />
                    )}
                    {healthPct.no_score > 0 && (
                      <div
                        style={{
                          width: `${healthPct.no_score}%`,
                          background: "var(--crm-gray-300)",
                        }}
                        title={`${d.health_distribution.no_score} sem score`}
                      />
                    )}
                  </div>
                  {/* Legenda */}
                  <div
                    className="flex flex-wrap"
                    style={{ gap: 16, fontSize: 12, color: "var(--crm-gray-600)" }}
                  >
                    <Legend dot="#10B981" label="Saudáveis" value={d.health_distribution.healthy} />
                    <Legend dot="#F59E0B" label="Em atenção" value={d.health_distribution.warning} />
                    <Legend dot="#EF4444" label="Críticas" value={d.health_distribution.critical} />
                    <Legend dot="var(--crm-gray-300)" label="Sem score" value={d.health_distribution.no_score} />
                  </div>
                </div>
              </section>
            )}

            {/* Por pipeline */}
            {d.by_pipeline.length > 0 && (
              <section>
                <div className="flex items-center justify-between" style={{ marginBottom: "var(--crm-space-3)" }}>
                  <h3
                    style={{
                      fontSize: "var(--crm-text-xs)",
                      color: "var(--crm-gray-500)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontWeight: "var(--crm-weight-medium)",
                    }}
                  >
                    Por pipeline CS
                  </h3>
                  <Link
                    href="/admin/operacional/pipelines/admin"
                    style={{
                      fontSize: 11.5,
                      color: "var(--crm-brand)",
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                  >
                    Configurar pipelines →
                  </Link>
                </div>
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
                      <tr
                        style={{
                          background: "var(--crm-gray-50)",
                          height: "var(--crm-table-header-height)",
                        }}
                      >
                        <Th>PIPELINE</Th>
                        <Th align="right">DEALS ABERTOS</Th>
                        <Th align="right"> </Th>
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
                          <td className="px-3" style={{ color: "var(--crm-gray-900)" }}>
                            <span
                              className="inline-flex items-center gap-2"
                              style={{ fontWeight: "var(--crm-weight-medium)" }}
                            >
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  background: p.color ?? "var(--crm-brand)",
                                  display: "inline-block",
                                }}
                              />
                              {p.name}
                            </span>
                          </td>
                          <td
                            className="px-3 text-right tabular-nums"
                            style={{
                              color: "var(--crm-gray-900)",
                              fontFamily: "var(--crm-font-mono)",
                            }}
                          >
                            {p.open_count}
                          </td>
                          <td className="px-3 text-right">
                            <Link
                              href={`/admin/operacional/pipelines/${p.id}`}
                              style={{
                                fontSize: 11.5,
                                color: "var(--crm-brand)",
                                textDecoration: "none",
                                fontWeight: 500,
                              }}
                            >
                              Abrir →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

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
                  Lojas em risco ({d.at_risk.length})
                </h3>
                <ul className="space-y-2">
                  {d.at_risk.map((s) => (
                    <li
                      key={s.store_id}
                      className="crm-card flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Heart
                          className="h-3.5 w-3.5"
                          style={{
                            color:
                              (s.health_score ?? 100) < 50
                                ? "#EF4444"
                                : "#F59E0B",
                            flexShrink: 0,
                          }}
                        />
                        <div className="min-w-0">
                          <div
                            className="truncate"
                            style={{
                              color: "var(--crm-gray-900)",
                              fontWeight: "var(--crm-weight-medium)",
                            }}
                          >
                            {s.store_name}
                          </div>
                          {s.client_name && (
                            <div
                              className="truncate"
                              style={{
                                fontSize: "var(--crm-text-xs)",
                                color: "var(--crm-gray-500)",
                              }}
                            >
                              {s.client_name}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        {s.health_score != null && (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color:
                                s.health_score < 50 ? "#991B1B" : "#92400E",
                              background:
                                s.health_score < 50 ? "#FEF2F2" : "#FFFBEB",
                              padding: "2px 8px",
                              borderRadius: 4,
                            }}
                          >
                            health {s.health_score}
                          </span>
                        )}
                        {s.mrr_cents != null && s.mrr_cents > 0 && (
                          <span
                            className="crm-tnum"
                            style={{
                              fontSize: 12,
                              fontFamily: "var(--crm-font-mono)",
                              color: "var(--crm-gray-700)",
                            }}
                          >
                            {fmtBRL(s.mrr_cents)}
                          </span>
                        )}
                      </div>
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

function Kpi({
  icon,
  label,
  value,
  hint,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  color?: "success" | "danger" | "default"
}) {
  const valueColor =
    color === "success"
      ? "var(--crm-success-fg)"
      : color === "danger"
        ? "var(--crm-danger-fg)"
        : "var(--crm-gray-900)"
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

function Legend({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dot,
          display: "inline-block",
        }}
      />
      <span>{label}</span>
      <span
        className="crm-tnum"
        style={{ color: "var(--crm-gray-900)", fontWeight: 500 }}
      >
        {value}
      </span>
    </span>
  )
}
