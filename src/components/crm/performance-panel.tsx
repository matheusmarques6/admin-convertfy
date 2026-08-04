"use client"

/**
 * Painel de performance do dashboard comercial.
 *
 * Responde na ordem em que o gestor pergunta:
 *   1. Vamos bater a meta?  → barra de progresso com ritmo e projeção
 *   2. O que vem pela frente? → forecast ponderado por mês
 *   3. Como está o time?      → ranking por responsável
 *   4. Onde trava?            → tempo médio por etapa
 *
 * Cada bloco some quando não há dado — painel vazio não ensina nada.
 * O de meta é a exceção: sem meta cadastrada ele vira o convite para
 * cadastrar, porque é a informação que falta.
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Pencil,
  Target,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { GoalDialog } from "./goal-dialog"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface PerformanceData {
  period: { type: "month" | "quarter" | "year"; start: string; end: string }
  goal: { id: string; goal_type: string; target_value: number } | null
  goal_progress: {
    target: number
    achieved: number
    percent: number
    remaining: number
    daysTotal: number
    daysElapsed: number
    daysRemaining: number
    paceNeeded: number | null
    projected: number | null
    onTrack: boolean
  } | null
  achieved: { revenue: number; count: number }
  forecast: {
    buckets: Array<{ month: string; count: number; value: number; weighted: number }>
    withoutDate: number
    withoutDateValue: number
  }
  individual_goals?: Array<{
    owner_id: string
    goal_type: string
    target_value: number
  }>
  by_owner: Array<{
    owner_id: string
    name: string
    avatar_url: string | null
    wonValue: number
    wonCount: number
    lostCount: number
    openValue: number
    openCount: number
    winRate: number | null
    avgTicket: number | null
    avgCycleDays: number | null
  }>
  stage_durations: Array<{
    stage_id: string
    stage_name: string
    stage_color: string | null
    avgDays: number
    medianDays: number
    samples: number
  }>
  schema_missing?: string[]
}

const fmtBRL0 = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

const fmtInt = (v: number) => v.toLocaleString("pt-BR")

const MONTH_LABEL = (ym: string) => {
  const [y, m] = ym.split("-").map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1))
    .toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })
    .replace(".", "")
}

const CARD =
  "rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]"

export function PerformancePanel({ periodType = "month" }: { periodType?: "month" | "quarter" | "year" }) {
  const [goalOpen, setGoalOpen] = useState(false)

  const { data, isLoading, mutate } = useSWR<PerformanceData>(
    `/api/crm/performance?period_type=${periodType}&forecast_months=3`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  )

  const isRevenueGoal = data?.goal?.goal_type !== "deals_won"
  const fmtGoal = (v: number) => (isRevenueGoal ? fmtBRL0(v) : `${fmtInt(Math.round(v))} vendas`)

  if (isLoading && !data) {
    return (
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className={cn(CARD, "h-[168px] animate-pulse")} />
        <div className={cn(CARD, "h-[168px] animate-pulse")} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <GoalCard
          data={data}
          fmtGoal={fmtGoal}
          onConfigure={() => setGoalOpen(true)}
        />
        <ForecastCard data={data} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <OwnerRanking data={data} />
        <StageDurations data={data} />
      </div>

      <GoalDialog
        open={goalOpen}
        onOpenChange={setGoalOpen}
        periodStart={data?.period.start ?? ""}
        periodType={data?.period.type ?? "month"}
        currentTarget={data?.goal?.target_value ?? null}
        currentType={(data?.goal?.goal_type as "revenue_won" | "deals_won") ?? "revenue_won"}
        owners={(data?.by_owner ?? []).map((o) => ({ id: o.owner_id, name: o.name }))}
        individualGoals={data?.individual_goals ?? []}
        onSaved={() => mutate()}
      />
    </div>
  )
}

// ─── 1. Meta ─────────────────────────────────────────────────────

function GoalCard({
  data,
  fmtGoal,
  onConfigure,
}: {
  data?: PerformanceData
  fmtGoal: (v: number) => string
  onConfigure: () => void
}) {
  const p = data?.goal_progress
  const periodLabel =
    data?.period.type === "year"
      ? "do ano"
      : data?.period.type === "quarter"
        ? "do trimestre"
        : "do mês"

  // Sem meta o card não fica vazio: vira o convite para cadastrar.
  if (!p) {
    return (
      <div className={cn(CARD, "flex flex-col justify-between p-5")}>
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 dark:text-[#8B92A5]">
            <Icon icon={Target} size={16} className="text-[#4E62D8] dark:text-[#7B8CEA]" />
            Meta {periodLabel}
          </div>
          <p className="mt-2 max-w-[420px] text-[13px] leading-relaxed text-gray-600 dark:text-[#8B92A5]">
            Defina a meta do período para acompanhar atingimento, ritmo necessário e
            projeção de fechamento.
          </p>
          {data && (
            <p className="mt-2 text-[12.5px] text-gray-500 dark:text-[#5C6378]">
              Já fechado no período:{" "}
              <span className="font-semibold text-gray-900 tabular-nums dark:text-white">
                {fmtBRL0(data.achieved.revenue)}
              </span>{" "}
              ({fmtInt(data.achieved.count)}{" "}
              {data.achieved.count === 1 ? "venda" : "vendas"})
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onConfigure}
          className="mt-4 inline-flex h-8 w-fit items-center gap-1.5 rounded-[6px] bg-[#4E62D8] px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#2137B6]"
        >
          <Icon icon={Target} size={16} />
          Definir meta
        </button>
      </div>
    )
  }

  const pct = Math.max(0, p.percent)
  const barPct = Math.min(100, pct)
  const projectedPct = p.projected != null && p.target > 0 ? (p.projected / p.target) * 100 : null

  return (
    <div className={cn(CARD, "p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 dark:text-[#8B92A5]">
            <Icon icon={Target} size={16} className="text-[#4E62D8] dark:text-[#7B8CEA]" />
            Meta {periodLabel}
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            <span className="text-[28px] font-semibold leading-none tracking-[-0.02em] text-gray-900 tabular-nums dark:text-white">
              {fmtGoal(p.achieved)}
            </span>
            <span className="text-[13px] text-gray-500 dark:text-[#8B92A5]">
              de {fmtGoal(p.target)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums",
              p.onTrack
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
            )}
          >
            <Icon icon={p.onTrack ? CheckCircle2 : AlertTriangle} customSize={12} />
            {pct.toFixed(0)}%
          </span>
          <button
            type="button"
            onClick={onConfigure}
            aria-label="Editar meta"
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-[#5C6378] dark:hover:bg-white/10 dark:hover:text-white"
          >
            <Icon icon={Pencil} size={16} />
          </button>
        </div>
      </div>

      {/* Barra: preenchimento = realizado; marca = onde o período está.
          Ver a marca à frente da barra é o sinal de atraso. */}
      <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            p.onTrack ? "bg-emerald-500" : "bg-[#4E62D8] dark:bg-[#7B8CEA]",
          )}
          style={{ width: `${barPct}%` }}
        />
        {p.daysTotal > 0 && (
          <div
            className="absolute top-0 h-full w-px bg-gray-900/40 dark:bg-white/50"
            style={{ left: `${Math.min(100, (p.daysElapsed / p.daysTotal) * 100)}%` }}
            title="Onde o período está"
          />
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Metric
          label="Falta"
          value={p.remaining > 0 ? fmtGoal(p.remaining) : "Meta batida"}
          tone={p.remaining > 0 ? "neutral" : "pos"}
        />
        <Metric
          label={p.daysRemaining > 0 ? `Ritmo p/ ${p.daysRemaining}d` : "Período encerrado"}
          value={
            p.paceNeeded == null
              ? "—"
              : p.paceNeeded === 0
                ? "—"
                : `${fmtGoal(p.paceNeeded)}/dia`
          }
        />
        <Metric
          label="Projeção"
          value={p.projected != null ? fmtGoal(p.projected) : "—"}
          tone={projectedPct != null && projectedPct >= 100 ? "pos" : "warn"}
        />
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: "neutral" | "pos" | "warn"
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10.5px] font-medium uppercase tracking-[0.05em] text-gray-400 dark:text-[#5C6378]">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 truncate text-[13.5px] font-semibold tabular-nums",
          tone === "pos"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "warn"
              ? "text-amber-600 dark:text-amber-400"
              : "text-gray-900 dark:text-white",
        )}
      >
        {value}
      </div>
    </div>
  )
}

// ─── 2. Forecast ─────────────────────────────────────────────────

function ForecastCard({ data }: { data?: PerformanceData }) {
  const buckets = data?.forecast.buckets ?? []
  const max = Math.max(...buckets.map((b) => b.value), 1)
  const totalWeighted = buckets.reduce((s, b) => s + b.weighted, 0)

  return (
    <div className={cn(CARD, "p-5")}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 dark:text-[#8B92A5]">
          <Icon icon={TrendingUp} size={16} className="text-[#4E62D8] dark:text-[#7B8CEA]" />
          Previsão · 3 meses
        </div>
        <span className="text-[13px] font-semibold text-gray-900 tabular-nums dark:text-white">
          {fmtBRL0(totalWeighted)}
        </span>
      </div>

      {buckets.every((b) => b.count === 0) ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-gray-500 dark:text-[#8B92A5]">
          Nenhum negócio aberto com data prevista de fechamento nos próximos meses.
          Informe a data no negócio para ele entrar na previsão.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {buckets.map((b) => (
            <div key={b.month} className="flex items-center gap-2.5">
              <span className="w-14 shrink-0 text-[11.5px] font-medium capitalize text-gray-500 dark:text-[#8B92A5]">
                {MONTH_LABEL(b.month)}
              </span>
              <div className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-[4px] bg-gray-100 dark:bg-white/[0.06]">
                {/* Barra clara = valor total; escura = ponderado pela
                    probabilidade. A diferença é o risco. */}
                <div
                  className="absolute inset-y-0 left-0 bg-[#C7CDEF] dark:bg-[#4E62D8]/30"
                  style={{ width: `${(b.value / max) * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-[#4E62D8] dark:bg-[#7B8CEA]"
                  style={{ width: `${(b.weighted / max) * 100}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-[12px] font-medium text-gray-900 tabular-nums dark:text-white">
                {fmtBRL0(b.weighted)}
              </span>
              <span className="w-8 shrink-0 text-right text-[11px] text-gray-400 tabular-nums dark:text-[#5C6378]">
                {b.count}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[10.5px] leading-relaxed text-gray-400 dark:text-[#5C6378]">
        Barra escura = valor ponderado pela probabilidade.
        {(data?.forecast.withoutDate ?? 0) > 0 && (
          <>
            {" "}
            {fmtInt(data!.forecast.withoutDate)}{" "}
            {data!.forecast.withoutDate === 1 ? "negócio" : "negócios"} (
            {fmtBRL0(data!.forecast.withoutDateValue)}) sem data prevista, fora da conta.
          </>
        )}
      </p>
    </div>
  )
}

// ─── 3. Ranking por responsável ──────────────────────────────────

function OwnerRanking({ data }: { data?: PerformanceData }) {
  const rows = data?.by_owner ?? []
  const max = Math.max(...rows.map((r) => r.wonValue), 1)
  // Meta individual do período por vendedor (quando definida no dialog)
  const goalByOwner = new Map(
    (data?.individual_goals ?? []).map((g) => [g.owner_id, g]),
  )

  if (rows.length === 0) {
    return (
      <div className={cn(CARD, "p-5")}>
        <SectionTitle>Por responsável</SectionTitle>
        <p className="mt-3 text-[12.5px] text-gray-500 dark:text-[#8B92A5]">
          Nenhum negócio atribuído no período.
        </p>
      </div>
    )
  }

  return (
    <div className={cn(CARD, "p-5")}>
      <SectionTitle>Por responsável</SectionTitle>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] text-[12.5px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.06em] text-gray-400 dark:text-[#5C6378]">
              <th className="pb-1.5 pr-3 font-semibold">Pessoa</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">Ganho</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">Win rate</th>
              <th className="pb-1.5 text-right font-semibold">Ciclo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const goal = goalByOwner.get(r.owner_id)
              const goalAchieved = goal
                ? goal.goal_type === "deals_won"
                  ? r.wonCount
                  : r.wonValue
                : null
              const goalPct =
                goal && goalAchieved != null && goal.target_value > 0
                  ? (goalAchieved / goal.target_value) * 100
                  : null
              return (
              <tr key={r.owner_id} className="border-t border-black/[0.04] dark:border-white/[0.04]">
                <td className="max-w-[160px] py-1.5 pr-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="truncate font-medium text-gray-900 dark:text-white">
                      {r.name}
                    </span>
                    {goalPct != null && (
                      <span
                        className={cn(
                          "shrink-0 text-[10px] font-semibold tabular-nums",
                          goalPct >= 100
                            ? "text-emerald-600 dark:text-emerald-400"
                            : goalPct >= 70
                              ? "text-gray-500 dark:text-[#8B92A5]"
                              : "text-amber-600 dark:text-amber-400",
                        )}
                        title={`Meta individual: ${goal!.goal_type === "deals_won" ? `${fmtInt(goal!.target_value)} vendas` : fmtBRL0(goal!.target_value)}`}
                      >
                        {goalPct.toFixed(0)}% da meta
                      </span>
                    )}
                  </div>
                  {/* Barra sob o nome: meta individual quando existe, senão
                      comparação com o melhor vendedor */}
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        goalPct != null && goalPct >= 100
                          ? "bg-emerald-500"
                          : "bg-[#4E62D8] dark:bg-[#7B8CEA]",
                      )}
                      style={{
                        width: `${Math.min(100, goalPct ?? (r.wonValue / max) * 100)}%`,
                      }}
                    />
                  </div>
                </td>
                <td className="py-1.5 pr-3 text-right font-semibold text-gray-900 tabular-nums dark:text-white">
                  {fmtBRL0(r.wonValue)}
                  <div className="text-[10.5px] font-normal text-gray-400 dark:text-[#5C6378]">
                    {fmtInt(r.wonCount)}W · {fmtInt(r.lostCount)}L
                  </div>
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-gray-700 dark:text-[#C9CEDA]">
                  {r.winRate != null ? `${r.winRate.toFixed(0)}%` : "—"}
                </td>
                <td className="py-1.5 text-right tabular-nums text-gray-700 dark:text-[#C9CEDA]">
                  {r.avgCycleDays != null ? `${r.avgCycleDays.toFixed(0)}d` : "—"}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── 4. Tempo por etapa ──────────────────────────────────────────

function StageDurations({ data }: { data?: PerformanceData }) {
  const rows = useMemo(
    () => (data?.stage_durations ?? []).slice(0, 8),
    [data],
  )
  const max = Math.max(...rows.map((r) => r.avgDays), 1)

  return (
    <div className={cn(CARD, "p-5")}>
      <SectionTitle>Onde o funil trava</SectionTitle>
      {rows.length === 0 ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-gray-500 dark:text-[#8B92A5]">
          Ainda não há movimentações suficientes para medir o tempo por etapa. A conta
          usa negócios que já saíram de cada etapa nos últimos 180 dias.
        </p>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            {rows.map((r) => (
              <div key={r.stage_id} className="flex items-center gap-2.5">
                <span
                  className="w-28 shrink-0 truncate text-[11.5px] text-gray-600 dark:text-[#8B92A5]"
                  title={r.stage_name}
                >
                  {r.stage_name}
                </span>
                <div className="h-4 min-w-0 flex-1 overflow-hidden rounded-[4px] bg-gray-100 dark:bg-white/[0.06]">
                  <div
                    className="h-full rounded-[4px]"
                    style={{
                      width: `${(r.avgDays / max) * 100}%`,
                      background: r.stage_color ?? "#4E62D8",
                    }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-[12px] font-medium text-gray-900 tabular-nums dark:text-white">
                  {r.avgDays.toFixed(1)}d
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-gray-400 dark:text-[#5C6378]">
            Tempo médio até sair da etapa. A permanência na etapa atual não entra — ela
            ainda não terminou.
          </p>
        </>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 dark:text-[#8B92A5]">
      <Icon icon={Clock} size={16} className="text-[#4E62D8] dark:text-[#7B8CEA]" />
      {children}
    </div>
  )
}
