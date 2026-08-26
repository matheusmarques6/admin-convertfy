"use client"

/**
 * Dashboard Comercial — design ago/2026 (Claude Design): Meta do mês +
 * Previsão + Gargalo → KPIs → Por pipeline + Por fonte → Últimos
 * ganhos. Visual único de vendas (funde o dashboard antigo com a visão
 * resumida do funil), 100% dados reais:
 *
 *  - /api/crm/dashboard/sales?days=N — KPIs, por pipeline, por fonte e
 *    últimos ganhos (o RSC pré-carrega como initialData);
 *  - /api/crm/performance — meta do mês (crm_sales_goals), progresso,
 *    forecast ponderado e tempos por etapa (gargalo).
 *
 * Tokens --ops-* com o acento AZUL do workspace (classe
 * .ops-accent-comercial em globals.css). Meta editável pelo GoalDialog
 * existente — nada da funcionalidade antiga se perdeu.
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Check, Target } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { sourceLabel } from "@/lib/services/crm-sources"
import { GoalDialog } from "@/components/crm/goal-dialog"
import type { GoalType } from "@/lib/services/crm-performance"
import {
  DateControl,
  defaultOpsPeriod,
  type OpsPeriodValue,
} from "@/components/dashboard/ops/date-control"
import {
  CollectingState,
  OpsCard,
  OpsKpi,
  Td,
  Th,
  fmtBRLFull,
  fmtPct,
} from "@/components/dashboard/ops/primitives"

// ── Shapes ──────────────────────────────────────────────────────────

export interface DashboardData {
  window_days: number
  pipeline_value: number
  won_value: number
  lost_value: number
  open_count: number
  won_count: number
  lost_count: number
  win_rate: number
  avg_cycle_days: number
  by_pipeline: Array<{
    id: string
    name: string
    color: string | null
    open_value: number
    open_count: number
    won_value: number
    won_count: number
  }>
  by_source: Array<{ source: string; open_count: number; won_count: number; won_value: number }>
  recent_wins: Array<{ id: string; title: string; value: number | null; won_at: string | null }>
}

interface PerformanceData {
  period: { type: string; start: string; end: string }
  goal: { id: string; goal_type: string; target_value: number } | null
  goal_progress: {
    target: number
    achieved: number
    percent: number
    daysTotal: number
    daysElapsed: number
    daysRemaining: number
    paceNeeded: number | null
    projected: number | null
    onTrack: boolean
  } | null
  achieved: { revenue: number; count: number }
  forecast: { buckets: Array<{ month: string; count: number; value: number; weighted: number }> }
  by_owner: Array<{ owner_id: string; owner_name: string }>
  individual_goals?: Array<{ owner_id: string; goal_type: string; target_value: number }>
  stage_durations: Array<{
    stage_id: string
    stage_name: string
    avgDays: number
    medianDays: number
    samples: number
  }>
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error((body && body.error) || `Erro ${res.status}`)
  return body as T
}

const SWR_OPTS = { revalidateOnFocus: false, dedupingInterval: 30_000 }

const fmtQuando = (iso: string | null): string => {
  if (!iso) return "—"
  const d = new Date(iso)
  const today = new Date()
  const oneDay = 86_400_000
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((dayStart(today) - dayStart(d)) / oneDay)
  if (diffDays === 0)
    return `hoje, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  if (diffDays === 1) return "ontem"
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

// ── Component ───────────────────────────────────────────────────────

export function SalesDashboardClient({ initialData }: { initialData: DashboardData | null }) {
  // DateControl idêntico ao do Operacional (design). A rota de vendas é
  // "últimos N dias a partir de hoje" — o N vem do INÍCIO do range.
  const [period, setPeriod] = useState<OpsPeriodValue>(() => ({
    ...defaultOpsPeriod(),
    compare: false,
  }))
  const [goalOpen, setGoalOpen] = useState(false)

  const days = useMemo(() => {
    const diff = Math.round((Date.now() - period.start.getTime()) / 86_400_000) + 1
    return Math.min(365, Math.max(1, diff))
  }, [period.start])

  const { data: sales, error: salesError } = useSWR<DashboardData>(
    `/api/crm/dashboard/sales?days=${days}`,
    fetchJson,
    { ...SWR_OPTS, fallbackData: days === 30 ? (initialData ?? undefined) : undefined },
  )
  const { data: perf, mutate: mutatePerf } = useSWR<PerformanceData>(
    "/api/crm/performance?period_type=month",
    fetchJson,
    SWR_OPTS,
  )

  const gp = perf?.goal_progress ?? null

  // Previsão do mês = ritmo atual (projeção linear do realizado) +
  // pipeline PONDERADO com fechamento previsto no mês corrente.
  const previsao = useMemo(() => {
    if (!perf) return null
    const ritmo =
      gp?.projected ??
      (() => {
        // Sem meta ainda dá pra projetar: realizado ÷ dias decorridos × dias totais.
        const start = new Date(`${perf.period.start}T00:00:00`)
        const end = new Date(`${perf.period.end}T00:00:00`)
        const now = new Date()
        const total = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
        const elapsed = Math.min(
          total,
          Math.max(1, Math.round((now.getTime() - start.getTime()) / 86_400_000) + 1),
        )
        return (perf.achieved.revenue / elapsed) * total
      })()
    const mesAtual = new Date().toISOString().slice(0, 7)
    const ponderado = perf.forecast.buckets.find((b) => b.month === mesAtual)?.weighted ?? 0
    return { ritmo, ponderado, total: ritmo + ponderado }
  }, [perf, gp])

  // Gargalo = etapa com a maior MEDIANA de permanência (mín. 2 passagens).
  const gargalo = useMemo(() => {
    const candidates = (perf?.stage_durations ?? []).filter((s) => s.samples >= 2)
    if (candidates.length === 0) return null
    return candidates.reduce((a, b) => (b.medianDays > a.medianDays ? b : a))
  }, [perf])

  const goalIsCount = perf?.goal?.goal_type === "deals_won"
  const fmtGoal = (v: number) => (goalIsCount ? `${Math.round(v)} negócios` : fmtBRLFull(v))
  const maxFonte = Math.max(1, ...(sales?.by_source ?? []).map((f) => f.won_value))
  const fontes = (sales?.by_source ?? []).filter((f) => f.won_count > 0).slice(0, 6)

  return (
    <div className="ops-accent-comercial -m-4 md:-m-6 lg:-m-8 bg-[var(--ops-page)] min-h-[100dvh]">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-7 flex flex-col gap-4">
        {/* Header (DashHead do design: dot + label, título + chip, sub) */}
        <div className="flex items-start gap-3.5 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-[7px] text-[11.5px] text-[var(--ops-mut)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--ops-accent)]" />
              Comercial
            </div>
            <div className="mt-1 flex items-center gap-2.5 flex-wrap">
              <h1 className="m-0 text-[22px] font-semibold tracking-[-0.015em] text-[var(--ops-title)]">
                Dashboard Comercial
              </h1>
              <span className="text-[10.5px] font-medium text-[var(--ops-warn)] bg-[var(--ops-warn-bg)] border border-[var(--ops-warn-br)] rounded-full px-2.5 py-[3px]">
                funde Dashboard Comercial + visão do Funil
              </span>
            </div>
            <div className="mt-[3px] text-[12.5px] text-[var(--ops-sec)]">
              Meta, pipeline e fechamentos — visão única de vendas
            </div>
          </div>
          <div className="flex-1" />
          <DateControl value={period} onChange={setPeriod} />
        </div>

        {salesError && (
          <div className="rounded-[10px] border border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] px-4 py-3 text-[12.5px] text-[var(--ops-warn)]">
            Não consegui carregar os KPIs: {String(salesError.message || salesError)}
          </div>
        )}

        {/* ── Meta + Previsão + Gargalo ── */}
        <OpsCard>
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1.4fr] gap-7 items-center">
            {/* Meta do mês */}
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">
                  Meta do mês
                </span>
                {gp ? (
                  <button
                    onClick={() => setGoalOpen(true)}
                    className="text-[11.5px] text-[var(--ops-sec)] hover:text-[var(--ops-title)] tabular-nums"
                    title="Editar meta"
                  >
                    {fmtGoal(gp.achieved)} de {fmtGoal(gp.target)}
                  </button>
                ) : (
                  <button
                    onClick={() => setGoalOpen(true)}
                    className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--ops-accent)]"
                  >
                    <Icon icon={Target} customSize={13} /> Definir meta
                  </button>
                )}
              </div>
              {gp ? (
                <>
                  <div className="mt-2 h-[10px] rounded-md bg-[var(--ops-track)] overflow-hidden">
                    <div
                      className="h-full rounded-md bg-[var(--ops-accent)]"
                      style={{ width: `${Math.min(100, gp.percent)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 text-[12px] font-semibold text-[var(--ops-text)] tabular-nums">
                    {gp.percent.toFixed(0)}% atingido
                  </div>
                </>
              ) : (
                <p className="mt-2 text-[12.5px] text-[var(--ops-mut)]">
                  Nenhuma meta definida para este mês — defina pra acompanhar o ritmo do time aqui.
                </p>
              )}
            </div>
            {/* Previsão */}
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">
                Previsão do mês
              </div>
              <div className="mt-1 text-[19px] font-semibold text-[var(--ops-title)] tabular-nums">
                {previsao ? fmtBRLFull(previsao.total) : "—"}
              </div>
              <div className="text-[11px] text-[var(--ops-pos)] font-medium">
                ritmo atual + pipeline ponderado
              </div>
            </div>
            {/* Gargalo */}
            <div className="rounded-lg border border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] px-[13px] py-2.5">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-warn)]">
                Gargalo
              </div>
              <div className="mt-0.5 text-[12px] leading-[1.45] text-[var(--ops-warn)]">
                {gargalo
                  ? `${gargalo.stage_name}: deals param ${Math.round(gargalo.medianDays)}d em média`
                  : "Sem gargalo medido — histórico de etapas ainda curto na janela de 180d."}
              </div>
            </div>
          </div>
        </OpsCard>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <OpsKpi
            label="Pipeline aberto"
            value={sales ? fmtBRLFull(sales.pipeline_value) : "—"}
            sub={sales ? `${sales.open_count} deals abertos` : undefined}
          />
          <OpsKpi
            label="Ganhos"
            value={sales ? fmtBRLFull(sales.won_value) : "—"}
            sub={sales ? `${sales.won_count} deals em ${sales.window_days}d` : undefined}
            tone="pos"
          />
          <OpsKpi
            label="Win rate"
            value={sales ? fmtPct(sales.win_rate) : "—"}
            sub={sales ? `${sales.won_count}W · ${sales.lost_count}L` : undefined}
          />
          <OpsKpi
            label="Ciclo médio"
            value={sales ? `${Math.round(sales.avg_cycle_days)}d` : "—"}
            sub="criação → ganho"
          />
        </div>

        {/* ── Por pipeline + Por fonte ── */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <OpsCard className="xl:col-span-7" title="Por pipeline" hint={`${days} dias`} noPad>
            {!sales ? (
              <CollectingState label="Carregando pipelines…" />
            ) : sales.by_pipeline.length === 0 ? (
              <CollectingState label="Nenhum pipeline de vendas configurado." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <Th>Pipeline</Th>
                      <Th right>Abertos</Th>
                      <Th right>Valor aberto</Th>
                      <Th right>Ganhos</Th>
                      <Th right>Valor ganho</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.by_pipeline.map((p, i) => {
                      const last = i === sales.by_pipeline.length - 1
                      return (
                        <tr key={p.id}>
                          <Td last={last} className="font-semibold text-[var(--ops-title)]">
                            {p.name}
                          </Td>
                          <Td right last={last}>{p.open_count}</Td>
                          <Td right last={last}>{fmtBRLFull(p.open_value)}</Td>
                          <Td right last={last}>{p.won_count}</Td>
                          <Td right last={last} className="font-semibold text-[var(--ops-pos)]">
                            {fmtBRLFull(p.won_value)}
                          </Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </OpsCard>

          <OpsCard className="xl:col-span-5" title="Por fonte" hint={`valor ganho · ${days} dias`}>
            {!sales ? (
              <CollectingState label="Carregando fontes…" />
            ) : fontes.length === 0 ? (
              <CollectingState label="Nenhum ganho com fonte registrada no período." />
            ) : (
              <div className="flex flex-col gap-[11px]">
                {fontes.map((f) => (
                  <div key={f.source}>
                    <div className="flex justify-between text-[12px] mb-1 gap-2">
                      <span className="font-medium text-[var(--ops-text)] truncate">
                        {sourceLabel(f.source)}
                      </span>
                      <span className="text-[var(--ops-sec)] tabular-nums shrink-0">
                        {f.won_count} {f.won_count === 1 ? "ganho" : "ganhos"} ·{" "}
                        <span className="font-semibold text-[var(--ops-pos)]">
                          {fmtBRLFull(f.won_value)}
                        </span>
                      </span>
                    </div>
                    <div className="h-[7px] rounded overflow-hidden bg-[var(--ops-track)]">
                      <div
                        className="h-full rounded bg-[var(--ops-accent)] opacity-85"
                        style={{ width: `${(f.won_value / maxFonte) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </OpsCard>
        </div>

        {/* ── Últimos ganhos ── */}
        <OpsCard title="Últimos ganhos" noPad className="mb-2">
          {!sales ? (
            <CollectingState label="Carregando…" />
          ) : sales.recent_wins.length === 0 ? (
            <CollectingState label="Nenhum negócio ganho no período." />
          ) : (
            <div className="px-2.5 py-1.5">
              {sales.recent_wins.map((w, i) => (
                <a
                  key={w.id}
                  href={`/admin/comercial/deals/${w.id}/detail`}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-[9px] rounded-[7px] hover:bg-[var(--ops-hover)]",
                    i < sales.recent_wins.length - 1 && "border-b border-[var(--ops-border)]",
                  )}
                >
                  <span className="w-[26px] h-[26px] rounded-[7px] bg-[var(--ops-pos)]/10 text-[var(--ops-pos)] inline-flex items-center justify-center shrink-0">
                    <Icon icon={Check} customSize={13} />
                  </span>
                  <span className="flex-1 text-[12.5px] font-medium text-[var(--ops-title)] truncate">
                    {w.title}
                  </span>
                  <span className="text-[12.5px] font-semibold text-[var(--ops-pos)] tabular-nums">
                    {w.value != null ? fmtBRLFull(w.value) : "—"}
                  </span>
                  <span className="w-[76px] text-right text-[11px] text-[var(--ops-mut)] tabular-nums">
                    {fmtQuando(w.won_at)}
                  </span>
                </a>
              ))}
            </div>
          )}
        </OpsCard>
      </div>

      {/* Meta editável — mesmo GoalDialog do painel antigo (zero regressão) */}
      {perf && (
        <GoalDialog
          open={goalOpen}
          onOpenChange={setGoalOpen}
          periodStart={perf.period.start}
          periodType="month"
          currentTarget={perf.goal?.target_value ?? null}
          currentType={(perf.goal?.goal_type as GoalType) ?? "revenue_won"}
          owners={perf.by_owner.map((o) => ({ id: o.owner_id, name: o.owner_name }))}
          individualGoals={perf.individual_goals}
          onSaved={() => {
            setGoalOpen(false)
            void mutatePerf()
          }}
        />
      )}
    </div>
  )
}
