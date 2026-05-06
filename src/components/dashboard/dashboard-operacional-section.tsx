"use client"

import { useMemo } from "react"
import useSWR from "swr"
import { Heart, AlertTriangle, TrendingUp, MessageSquare, ExternalLink } from "lucide-react"
import { KpiCard } from "@/components/ui/kpi-card"
import { KpiCardRow } from "@/components/ui/kpi-card-row"
import { Skeleton } from "@/components/ui/skeleton"
import { AnimatedItem } from "@/components/ui/animated-container"
import Link from "next/link"
import { ROUTES } from "@/lib/routes"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface CsDashboard {
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
    client_name: string
    health_score: number | null
    mrr_cents: number | null
    nps: number | null
  }>
  by_pipeline: Array<{
    id: string
    name: string
    color: string | null
    open_count: number
  }>
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v)

const fmtBRLCompact = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2).replace(".", ",")}M`
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`
  return fmtBRL(v)
}

/**
 * Section da dashboard exibindo metricas de Customer Success / carteira.
 *
 * Renderizada na dashboard operacional logo apos o TopBar. Usa os mesmos
 * tokens visuais (KpiCard, KpiCardRow, AnimatedItem, Skeleton) da
 * dashboard geral pra manter coerencia — ZERO uso de --crm-* tokens.
 */
export function DashboardOperacionalSection() {
  const { data, isLoading } = useSWR<CsDashboard>(
    "/api/crm/dashboard/cs",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  )

  const distPct = useMemo(() => {
    if (!data || data.total_stores === 0)
      return { healthy: 0, warning: 0, critical: 0, noScore: 0 }
    const t = data.total_stores
    return {
      healthy: (data.health_distribution.healthy / t) * 100,
      warning: (data.health_distribution.warning / t) * 100,
      critical: (data.health_distribution.critical / t) * 100,
      noScore: (data.health_distribution.no_score / t) * 100,
    }
  }, [data])

  const npsColor = (() => {
    if (!data?.nps.score) return undefined
    if (data.nps.score >= 50) return "success"
    if (data.nps.score < 0) return "danger"
    return undefined
  })()

  const criticalCount = data?.health_distribution.critical ?? 0

  return (
    <>
      {/* Row de KPIs CS — mesmo grid do dashboard layout */}
      <AnimatedItem>
        <KpiCardRow columns={4}>
          <KpiCard
            label="Carteira ativa"
            value={isLoading ? "—" : `${data?.total_stores ?? 0}`}
            loading={isLoading}
            tooltip="Numero de lojas com contrato ativo na carteira."
          />
          <KpiCard
            label="MRR total"
            value={isLoading ? "—" : fmtBRLCompact((data?.total_mrr_cents ?? 0) / 100)}
            loading={isLoading}
            tooltip="Receita recorrente mensal somada de todas as lojas ativas."
          />
          <KpiCard
            label="NPS"
            value={
              isLoading
                ? "—"
                : data?.nps.score != null
                  ? data.nps.score.toFixed(0)
                  : "—"
            }
            loading={isLoading}
            tooltip={
              data?.nps.count
                ? `${data.nps.count} respostas · ${data.nps.promoters} promotores, ${data.nps.detractors} detratores`
                : "Sem respostas de NPS na janela atual."
            }
          />
          <KpiCard
            label="Lojas em risco"
            value={isLoading ? "—" : `${criticalCount}`}
            loading={isLoading}
            tooltip={`Lojas com health score abaixo de 50. ${data?.health_distribution.warning ?? 0} em atencao.`}
          />
        </KpiCardRow>
      </AnimatedItem>

      {/* Row: Health distribution + At-risk table side-by-side em desktop */}
      <AnimatedItem>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Distribuicao de health (2 cols) */}
          <div
            className={
              "col-span-1 lg:col-span-2 rounded-[8px] border border-[rgba(0,0,0,0.08)] " +
              "dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-6"
            }
          >
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-[14px] font-semibold text-gray-900 dark:text-[#EAEDF3]">
                Distribuicao de Health
              </h3>
              <Heart className="h-4 w-4 text-gray-400" />
            </div>
            <p className="text-[12px] text-gray-500 dark:text-[#8B92A5] mb-4">
              Saude da carteira ativa
            </p>

            {isLoading ? (
              <Skeleton className="h-2 w-full rounded mb-4" />
            ) : data && data.total_stores > 0 ? (
              <>
                {/* Barra empilhada */}
                <div
                  className="flex h-2 w-full overflow-hidden rounded-[4px] bg-gray-100 dark:bg-[#242836] mb-4"
                  role="img"
                  aria-label="Distribuicao de health score"
                >
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{ width: `${distPct.healthy}%` }}
                    title={`Saudaveis: ${data.health_distribution.healthy}`}
                  />
                  <div
                    className="bg-amber-500 transition-all"
                    style={{ width: `${distPct.warning}%` }}
                    title={`Atencao: ${data.health_distribution.warning}`}
                  />
                  <div
                    className="bg-red-500 transition-all"
                    style={{ width: `${distPct.critical}%` }}
                    title={`Critico: ${data.health_distribution.critical}`}
                  />
                  <div
                    className="bg-gray-300 dark:bg-[#3A4054] transition-all"
                    style={{ width: `${distPct.noScore}%` }}
                    title={`Sem score: ${data.health_distribution.no_score}`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Legend
                    colorClass="bg-emerald-500"
                    label="Saudavel (≥70)"
                    count={data.health_distribution.healthy}
                    total={data.total_stores}
                  />
                  <Legend
                    colorClass="bg-amber-500"
                    label="Atencao (50-69)"
                    count={data.health_distribution.warning}
                    total={data.total_stores}
                  />
                  <Legend
                    colorClass="bg-red-500"
                    label="Critico (<50)"
                    count={data.health_distribution.critical}
                    total={data.total_stores}
                  />
                  <Legend
                    colorClass="bg-gray-300 dark:bg-[#3A4054]"
                    label="Sem score"
                    count={data.health_distribution.no_score}
                    total={data.total_stores}
                  />
                </div>
              </>
            ) : (
              <p className="text-[13px] text-gray-500 py-6 text-center">
                Nenhuma loja ativa para calcular.
              </p>
            )}

            {/* Pipelines CS abertos */}
            {data && data.by_pipeline.length > 0 && (
              <div className="mt-5 pt-4 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-3 font-medium">
                  Cards CS abertos
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {data.by_pipeline.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-[6px] bg-gray-50 dark:bg-[#242836] px-3 py-2"
                    >
                      <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] truncate">
                        {p.name}
                      </p>
                      <p className="text-[16px] font-semibold text-gray-900 dark:text-[#EAEDF3] tabular-nums mt-0.5">
                        {p.open_count}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Lojas em risco (3 cols) */}
          <div
            className={
              "col-span-1 lg:col-span-3 rounded-[8px] border border-[rgba(0,0,0,0.08)] " +
              "dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-6"
            }
          >
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-[14px] font-semibold text-gray-900 dark:text-[#EAEDF3]">
                Lojas em risco
              </h3>
              <AlertTriangle className="h-4 w-4 text-gray-400" />
            </div>
            <p className="text-[12px] text-gray-500 dark:text-[#8B92A5] mb-4">
              Health score abaixo de 50 — acao recomendada
            </p>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : data?.at_risk.length === 0 ? (
              <div className="py-12 text-center">
                <Heart className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-[13px] font-medium text-gray-900 dark:text-[#EAEDF3]">
                  Nenhuma loja em risco
                </p>
                <p className="text-[12px] text-gray-500 mt-0.5">
                  Toda a carteira esta saudavel.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[6px] border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-[#242836] text-gray-500 dark:text-[#8B92A5]">
                      <th className="text-left font-medium px-3 py-2">Loja</th>
                      <th className="text-left font-medium px-3 py-2 hidden md:table-cell">
                        Cliente
                      </th>
                      <th className="text-right font-medium px-3 py-2">Health</th>
                      <th className="text-right font-medium px-3 py-2 hidden md:table-cell">
                        NPS
                      </th>
                      <th className="text-right font-medium px-3 py-2">MRR</th>
                      <th className="w-8 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.at_risk ?? []).map((s) => (
                      <tr
                        key={s.store_id}
                        className="border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)] hover:bg-gray-50 dark:hover:bg-[#242836]"
                      >
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-[#EAEDF3] truncate max-w-[180px]">
                          {s.store_name}
                        </td>
                        <td className="px-3 py-2 text-gray-700 dark:text-[#C5CCD9] hidden md:table-cell truncate max-w-[140px]">
                          {s.client_name}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className="font-mono font-semibold tabular-nums text-red-600 dark:text-red-400"
                          >
                            {s.health_score ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-[#C5CCD9] hidden md:table-cell">
                          {s.nps ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-[#C5CCD9]">
                          {s.mrr_cents != null
                            ? fmtBRLCompact(s.mrr_cents / 100)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            href={ROUTES.ADMIN.STORES.DETAIL(s.store_id)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-white inline-flex"
                            title="Abrir loja"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* NPS detalhado se houver */}
            {data && data.nps.count > 0 && (
              <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)] grid grid-cols-3 gap-3">
                <NpsCell
                  label="Promotores"
                  count={data.nps.promoters}
                  total={data.nps.count}
                  color="text-emerald-600 dark:text-emerald-400"
                />
                <NpsCell
                  label="Passivos"
                  count={data.nps.passives}
                  total={data.nps.count}
                  color="text-amber-600 dark:text-amber-400"
                />
                <NpsCell
                  label="Detratores"
                  count={data.nps.detractors}
                  total={data.nps.count}
                  color="text-red-600 dark:text-red-400"
                />
              </div>
            )}
          </div>
        </div>
      </AnimatedItem>
    </>
  )
}

function Legend({
  colorClass,
  label,
  count,
  total,
}: {
  colorClass: string
  label: string
  count: number
  total: number
}) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`h-2 w-2 rounded-full shrink-0 ${colorClass}`} />
      <div className="min-w-0">
        <div className="text-[11px] text-gray-500 dark:text-[#8B92A5] truncate">
          {label}
        </div>
        <div className="text-[13px] font-semibold tabular-nums text-gray-900 dark:text-[#EAEDF3]">
          {count}{" "}
          <span className="text-[11px] font-normal text-gray-500">
            ({pct.toFixed(0)}%)
          </span>
        </div>
      </div>
    </div>
  )
}

function NpsCell({
  label,
  count,
  total,
  color,
}: {
  label: string
  count: number
  total: number
  color: string
}) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
        {label}
      </div>
      <div className={`text-[18px] font-bold tabular-nums mt-0.5 ${color}`}>
        {count}
      </div>
      <div className="text-[10px] text-gray-500 mt-0.5">{pct.toFixed(0)}%</div>
    </div>
  )
}
