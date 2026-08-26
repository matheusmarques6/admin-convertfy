"use client"

/**
 * Dashboard Comercial v4 — design ago/2026 (Claude Design): KPIs com Δ
 * vs período anterior → Funil de aquisição no topo → Meta do mês em
 * destaque (faixa azul) → Tendência & esforço → Time & agenda →
 * Recortes. 100% dados reais:
 *
 *  - /api/crm/dashboard/sales?days=N — KPIs + deltas (janela anterior,
 *    snapshot de pipeline, cash collect via unified_invoices, ticket),
 *    atividades por tipo, composição recorrente×pontual, pipelines,
 *    fontes e últimos ganhos;
 *  - /api/crm/funnel?days=N — funil Leads→Vendas com investimento,
 *    ROAS, CPL/CPA (mesma fonte da página Funil);
 *  - /api/crm/performance — meta do mês, projeção, vendas por dia
 *    (mês atual vs anterior) e stats por responsável;
 *  - /api/crm/activities/agenda — agenda comercial (próximos 7 dias).
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  Activity,
  BarChart3,
  Calendar,
  Check,
  DollarSign,
  Filter,
  Settings,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  Td,
  Th,
  fmtBRLCompact,
  fmtBRLFull,
  fmtPct,
} from "@/components/dashboard/ops/primitives"

// ── Shapes ──────────────────────────────────────────────────────────

export interface DashboardData {
  window_days: number
  pipeline_value: number
  won_value: number
  open_count: number
  won_count: number
  lost_count: number
  win_rate: number
  avg_cycle_days: number
  by_pipeline: Array<{
    id: string
    name: string
    open_value: number
    open_count: number
    won_value: number
    won_count: number
  }>
  by_source: Array<{ source: string; won_count: number; won_value: number }>
  recent_wins: Array<{ id: string; title: string; value: number | null; won_at: string | null }>
  compare?: {
    won_value_prev: number
    won_count_prev: number
    pipeline_open_prev: number | null
    cash_prev: number
    ticket_prev: number | null
  }
  cash?: { value: number; pct: number | null }
  ticket?: number | null
  activities?: Array<{ type: string; current: number; previous: number }>
  composicao?: {
    recorrente: number
    pontual: number
    mrr_novo: number
    vendas_com_itens: number
    vendas_total: number
  }
}

interface FunnelData {
  funnel: { leads: number; mql: number; agendamento: number; reuniao: number; venda: number }
  rates: {
    leads_mql: number | null
    mql_agendamento: number | null
    agendamento_reuniao: number | null
    reuniao_venda: number | null
  }
  metrics: {
    investimento: number
    faturamento: number
    roas: number | null
    tx_conversao: number | null
    cpl: number | null
    custo_mql: number | null
    custo_reuniao: number | null
    cpa: number | null
  }
}

interface PerformanceData {
  period: { type: string; start: string; end: string }
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
  won_daily?: { current: number[]; previous: number[] }
  by_owner: Array<{
    owner_id: string
    name: string
    wonValue: number
    wonCount: number
    lostCount: number
    winRate: number | null
    avgCycleDays: number | null
  }>
  individual_goals?: Array<{ owner_id: string; goal_type: string; target_value: number }>
}

interface AgendaItem {
  id: string
  content: string | null
  due_at: string
  done: boolean
  deal_title: string | null
  owner_name: string | null
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error((body && body.error) || `Erro ${res.status}`)
  return body as T
}

const SWR_OPTS = { revalidateOnFocus: false, dedupingInterval: 30_000 }

const deltaPct = (cur: number, prev: number | null | undefined): number | null =>
  prev == null || prev <= 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

// Rótulos pt-BR das atividades (tipos reais de crm_deal_activities)
const ACTIVITY_LABELS: Record<string, string> = {
  call: "Ligações",
  email: "Emails",
  whatsapp: "WhatsApp",
  meeting: "Reuniões feitas",
  proposal: "Propostas enviadas",
  task: "Tarefas",
  note: "Notas",
  system: "Sistema",
}

// Cores fixas das etapas do funil (design)
const FUNNEL_STAGES: Array<[keyof FunnelData["funnel"], string, string]> = [
  ["leads", "Leads", "#475569"],
  ["mql", "MQLs", "#4E62D8"],
  ["agendamento", "Agendamentos", "#2563EB"],
  ["reuniao", "Reuniões", "#D97706"],
  ["venda", "Vendas", "#047857"],
]

// ── KPI com delta (DashKpi do design) ───────────────────────────────

function KpiDelta({
  label,
  value,
  delta,
  sub,
  accent,
}: {
  label: string
  value: string
  delta?: string | null
  sub?: string
  accent?: boolean
}) {
  const deltaNeg = delta?.startsWith("−") || delta?.startsWith("-")
  return (
    <div className="rounded-[10px] border bg-[var(--ops-card)] border-[var(--ops-border)] px-[18px] py-[17px]">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 text-[21px] font-semibold leading-none tabular-nums tracking-[-0.01em]",
          accent ? "text-[var(--ops-pos)]" : "text-[var(--ops-title)]",
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5 text-[11px] tabular-nums min-h-[14px]">
        {delta != null && (
          <span className={cn("font-bold", deltaNeg ? "text-[var(--ops-neg)]" : "text-[var(--ops-pos)]")}>
            {delta}
          </span>
        )}
        {sub && <span className="text-[var(--ops-mut)]">{sub}</span>}
      </div>
    </div>
  )
}

// ── TrendChart (acumulado do mês vs anterior + linha da meta) ───────

function TrendChart({ current, previous, meta }: { current: number[]; previous: number[]; meta: number | null }) {
  const cum = (arr: number[]) => {
    let s = 0
    return arr.map((v) => (s += v))
  }
  const atual = cum(current)
  const anterior = cum(previous)
  const maxV = Math.max(...atual, ...anterior, meta ?? 0, 1)
  const ymax = maxV * 1.12
  const W = 620
  const H = 200
  const pl = 40
  const pr = 10
  const pt = 12
  const pb = 24
  const days = Math.max(atual.length, anterior.length, 2)
  const x = (i: number, len: number) => pl + (i / Math.max(1, len - 1)) * (W - pl - pr) * (len / days)
  const xd = (i: number) => pl + (i / (days - 1)) * (W - pl - pr)
  const y = (v: number) => pt + (1 - v / ymax) * (H - pt - pb)
  const path = (arr: number[]) =>
    arr.map((v, i) => `${i ? "L" : "M"}${xd(i).toFixed(1)},${y(v).toFixed(1)}`).join("")
  void x
  const gridVals = [0, 0.33, 0.66, 1].map((f) => Math.round((ymax * f) / 1000) * 1000)
  const last = atual[atual.length - 1] ?? 0
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} aria-hidden>
      <defs>
        <linearGradient id="trFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ops-accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--ops-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridVals.map((v) => (
        <g key={v}>
          <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--ops-border)" strokeWidth="1" />
          <text x={pl - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--ops-mut)">
            {Math.round(v / 1000)}K
          </text>
        </g>
      ))}
      {meta != null && meta > 0 && (
        <>
          <line x1={pl} x2={W - pr} y1={y(meta)} y2={y(meta)} stroke="var(--ops-warn)" strokeWidth="1.4" strokeDasharray="6 4" />
          <text x={W - pr} y={y(meta) - 5} textAnchor="end" fontSize="9.5" fontWeight="700" fill="var(--ops-warn)">
            META {Math.round(meta / 1000)}K
          </text>
        </>
      )}
      {anterior.length >= 2 && (
        <path d={path(anterior)} fill="none" stroke="var(--ops-mut)" strokeWidth="1.6" strokeDasharray="4 4" opacity="0.7" />
      )}
      {atual.length >= 2 && (
        <>
          <path d={`${path(atual)}L${xd(atual.length - 1)},${y(0)}L${xd(0)},${y(0)}Z`} fill="url(#trFill)" stroke="none" />
          <path d={path(atual)} fill="none" stroke="var(--ops-accent)" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx={xd(atual.length - 1)} cy={y(last)} r="4" fill="var(--ops-accent)" stroke="var(--ops-card)" strokeWidth="2" />
        </>
      )}
      {[1, 10, 20, days].map((dia) => (
        <text key={dia} x={xd(Math.min(dia, days) - 1)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--ops-mut)">
          {dia}
        </text>
      ))}
    </svg>
  )
}

// ── Component ───────────────────────────────────────────────────────

export function SalesDashboardClient({ initialData }: { initialData: DashboardData | null }) {
  const [period, setPeriod] = useState<OpsPeriodValue>(defaultOpsPeriod)
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
  const { data: funnel } = useSWR<FunnelData>(`/api/crm/funnel?days=${days}`, fetchJson, SWR_OPTS)
  const { data: perf, mutate: mutatePerf } = useSWR<PerformanceData>(
    "/api/crm/performance?period_type=month",
    fetchJson,
    SWR_OPTS,
  )
  const agendaRange = useMemo(() => {
    const today = new Date()
    const to = new Date(today.getTime() + 7 * 86_400_000)
    return { from: ymd(today), to: ymd(to) }
  }, [])
  const { data: agenda } = useSWR<{ items: AgendaItem[] }>(
    `/api/crm/activities/agenda?from=${agendaRange.from}&to=${agendaRange.to}`,
    fetchJson,
    SWR_OPTS,
  )

  const hr = new Date().getHours()
  const saud = hr < 12 ? "Bom dia" : hr < 18 ? "Boa tarde" : "Boa noite"
  const gp = perf?.goal_progress ?? null
  const goalIsCount = perf?.goal?.goal_type === "deals_won"
  const cmp = period.compare ? sales?.compare : undefined

  // Deltas reais (habilitados pelo toggle "vs anterior" do DateControl)
  const dGanhos = cmp ? deltaPct(sales?.won_value ?? 0, cmp.won_value_prev) : null
  const dPipe = cmp ? deltaPct(sales?.pipeline_value ?? 0, cmp.pipeline_open_prev) : null
  const dCash = cmp ? deltaPct(sales?.cash?.value ?? 0, cmp.cash_prev) : null
  const dTicket =
    cmp && sales?.ticket != null && cmp.ticket_prev != null ? sales.ticket - cmp.ticket_prev : null
  const fmtDelta = (v: number | null, moneyDiff = false): string | null =>
    v == null
      ? null
      : moneyDiff
        ? `${v >= 0 ? "+" : "−"}R$ ${Math.abs(Math.round(v)).toLocaleString("pt-BR")}`
        : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1).replace(".", ",")}%`

  const maxFonte = Math.max(1, ...(sales?.by_source ?? []).map((f) => f.won_value))
  const fontes = (sales?.by_source ?? []).filter((f) => f.won_count > 0).slice(0, 5)
  const tempoPct = gp ? Math.round((gp.daysElapsed / gp.daysTotal) * 100) : 0
  const activities = (sales?.activities ?? [])
    .filter((a) => a.type !== "system" && a.type !== "note")
    .slice(0, 5)
  const comp = sales?.composicao
  const compTot = comp ? comp.recorrente + comp.pontual : 0

  // Funil: tiles esquerda/direita (mesma ordem/cores/ícones do design)
  const m = funnel?.metrics
  const fmtOrDash = (v: number | null | undefined, f: (n: number) => string) =>
    v == null ? "—" : f(v)
  const tilesEsq: Array<[string, string, string, LucideIcon]> = m
    ? [
        ["Investimento", fmtBRLCompact(m.investimento), "#4E62D8", DollarSign],
        ["Faturamento total", fmtBRLCompact(m.faturamento), "#047857", BarChart3],
        ["ROAS", m.roas == null ? "—" : `${m.roas.toFixed(1).replace(".", ",")}x`, "#7C3AED", Activity],
        ["Tx. conversão", fmtOrDash(m.tx_conversao, (n) => fmtPct(n)), "#D97706", Filter],
      ]
    : []
  const tilesDir: Array<[string, string, string, LucideIcon]> = m
    ? [
        ["Custo por lead", fmtOrDash(m.cpl, (n) => `R$ ${n.toFixed(2).replace(".", ",")}`), "#2563EB", Users],
        ["Custo por MQL", fmtOrDash(m.custo_mql, (n) => fmtBRLFull(n)), "#7C3AED", UserPlus],
        ["Custo por reunião", fmtOrDash(m.custo_reuniao, (n) => fmtBRLFull(n)), "#0EA5E9", Calendar],
        ["CPA", fmtOrDash(m.cpa, (n) => fmtBRLFull(n)), "#D97706", DollarSign],
      ]
    : []
  const convs = funnel
    ? [funnel.rates.leads_mql, funnel.rates.mql_agendamento, funnel.rates.agendamento_reuniao, funnel.rates.reuniao_venda]
    : []

  const agendaItems = (agenda?.items ?? []).filter((a) => !a.done).slice(0, 4)
  const todayStr = ymd(new Date())
  const agendaHoje = (agenda?.items ?? []).filter((a) => !a.done && a.due_at.slice(0, 10) === todayStr).length
  const agendaSemana = (agenda?.items ?? []).filter((a) => !a.done).length

  const individualByOwner = new Map((perf?.individual_goals ?? []).map((g) => [g.owner_id, g]))

  const secTitle = (t: string, hint: string) => (
    <div className="flex items-baseline gap-2 mt-1 -mb-1 px-0.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ops-sec)]">{t}</span>
      <span className="text-[11px] text-[var(--ops-mut)]">{hint}</span>
    </div>
  )

  return (
    <div className="ops-accent-comercial -m-4 md:-m-6 lg:-m-8 bg-[var(--ops-page)] min-h-[100dvh]">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-7 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-end gap-3.5 flex-wrap">
          <div>
            <h1 className="m-0 text-[22px] font-semibold tracking-[-0.015em] text-[var(--ops-title)]">
              Dashboard Comercial
            </h1>
            <div className="mt-0.5 text-[12.5px] text-[var(--ops-sec)]">
              {saud} — meta, funil e time num lugar só
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

        {/* 1 · KPIs com comparação */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiDelta
            label="Pipeline aberto"
            value={sales ? fmtBRLCompact(sales.pipeline_value) : "—"}
            delta={fmtDelta(dPipe)}
            sub={sales ? `${sales.open_count} negócios` : undefined}
          />
          <KpiDelta
            label="Ganhos"
            value={sales ? fmtBRLCompact(sales.won_value) : "—"}
            accent
            delta={fmtDelta(dGanhos)}
            sub={sales ? `${sales.won_count} vendas` : undefined}
          />
          <KpiDelta
            label="Cash collect"
            value={sales?.cash ? fmtBRLCompact(sales.cash.value) : "—"}
            delta={fmtDelta(dCash)}
            sub={sales?.cash?.pct != null ? `${sales.cash.pct.toFixed(1).replace(".", ",")}% do vendido` : undefined}
          />
          <KpiDelta
            label="Ticket médio"
            value={sales?.ticket != null ? fmtBRLCompact(sales.ticket) : "—"}
            delta={fmtDelta(dTicket, true)}
            sub="por venda"
          />
        </div>
        {period.compare && (
          <div className="-mt-3 text-[10.5px] text-[var(--ops-mut)]">
            Δ comparando com o período anterior do filtro — no filtro &quot;Hoje&quot;, compara com ontem.
          </div>
        )}

        {/* 2 · Funil no topo */}
        <OpsCard
          title="Funil de aquisição"
          hint={`CRM × investimento em tráfego · ${days} dias`}
          right={
            <a href="/admin/comercial/funil" className="text-[11.5px] font-medium text-[var(--ops-sec)] hover:text-[var(--ops-title)]">
              Abrir Funil completo
            </a>
          }
        >
          {!funnel ? (
            <CollectingState label="Carregando funil…" />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_460px_1fr] gap-5 items-center">
              <div className="flex flex-col gap-2 order-2 xl:order-1">
                {tilesEsq.map(([l, v, cor, icon]) => (
                  <FunnelTile key={l} label={l} value={v} color={cor} icon={icon} />
                ))}
              </div>
              <div className="relative w-full max-w-[430px] mx-auto py-1.5 order-1 xl:order-2">
                {FUNNEL_STAGES.map(([key, label, cor], i) => {
                  const t = i * 7
                  const b = (i + 1) * 7
                  return (
                    <div
                      key={key}
                      className="h-[58px] flex flex-col items-center justify-center text-white"
                      style={{
                        background: `linear-gradient(180deg, ${cor} 0%, ${cor}E6 100%)`,
                        clipPath: `polygon(${t}% 0, ${100 - t}% 0, ${100 - b}% 100%, ${b}% 100%)`,
                      }}
                    >
                      <span className="text-[23px] font-bold leading-none tabular-nums [text-shadow:0_1px_2px_rgba(0,0,0,0.18)]">
                        {funnel.funnel[key]}
                      </span>
                      <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] opacity-90">{label}</span>
                    </div>
                  )
                })}
                {convs.map((c, i) =>
                  c == null ? null : (
                    <span
                      key={i}
                      className="absolute rounded-full px-2.5 py-[3px] text-[10px] font-bold text-white tabular-nums bg-[#111827] dark:bg-[#0D0F14] border border-white/15 shadow-lg"
                      style={{ top: 6 + (i + 1) * 58 - 11, left: `calc(${100 - (i + 1) * 7}% + 2px)` }}
                    >
                      {c.toFixed(1).replace(".", ",")}%
                    </span>
                  ),
                )}
              </div>
              <div className="flex flex-col gap-2 order-3">
                {tilesDir.map(([l, v, cor, icon]) => (
                  <FunnelTile key={l} label={l} value={v} color={cor} icon={icon} />
                ))}
              </div>
            </div>
          )}
        </OpsCard>

        {/* 3 · Meta do mês — faixa azul em destaque */}
        <div className="relative rounded-[10px] border border-white/10 p-5 bg-[#2B49E0] dark:bg-[#2036B8]">
          <button
            onClick={() => setGoalOpen(true)}
            className="absolute top-3.5 right-3.5 flex items-center gap-1.5 px-[11px] py-[5px] rounded-[7px] border border-white/30 bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold transition-colors"
          >
            <Icon icon={Settings} customSize={12} /> Definir metas
          </button>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,1fr)_2fr] gap-7 items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex text-white/85">
                  <Icon icon={Filter} customSize={15} />
                </span>
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-white/75">
                  Meta do mês
                </span>
                {gp && (
                  <span className="text-[11px] font-bold text-white bg-white/15 border border-white/30 rounded-full px-2.5 py-0.5 tabular-nums">
                    {gp.percent.toFixed(0)}%
                  </span>
                )}
              </div>
              {gp ? (
                <>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-[27px] font-semibold text-white tracking-[-0.02em] tabular-nums">
                      {goalIsCount ? Math.round(gp.achieved) : fmtBRLFull(gp.achieved)}
                    </span>
                    <span className="text-[12.5px] text-white/70 tabular-nums">
                      de {goalIsCount ? `${Math.round(gp.target)} negócios` : fmtBRLFull(gp.target)}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-white/65 tabular-nums">
                    {perf?.achieved.count ?? 0} vendas · {gp.daysRemaining} dias restantes
                  </div>
                </>
              ) : (
                <p className="mt-2 text-[12.5px] text-white/80 max-w-[46ch]">
                  Nenhuma meta definida para este mês — clique em &quot;Definir metas&quot; pra acompanhar o
                  ritmo do time aqui.
                </p>
              )}
            </div>
            {gp && (
              <div>
                <div className="relative h-[10px] rounded-md bg-white/25 overflow-hidden">
                  <div className="h-full rounded-md bg-white" style={{ width: `${Math.min(100, gp.percent)}%` }} />
                  <div
                    title={`${tempoPct}% do mês decorrido`}
                    className="absolute top-0 bottom-0 w-0.5 bg-[rgba(2,6,23,0.55)]"
                    style={{ left: `${tempoPct}%` }}
                  />
                </div>
                <div className="mt-1.5 text-[10.5px] text-white/60 tabular-nums">
                  marca = {tempoPct}% do mês decorrido — barra atrás da marca é atraso
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  {(
                    [
                      ["Falta", goalIsCount ? `${Math.max(0, Math.round(gp.remaining))} negócios` : fmtBRLFull(Math.max(0, gp.remaining)), "text-white"],
                      [
                        `Ritmo p/ ${gp.daysRemaining}d`,
                        gp.paceNeeded == null
                          ? "—"
                          : goalIsCount
                            ? `${Math.ceil(gp.paceNeeded)}/dia`
                            : `${fmtBRLFull(gp.paceNeeded)}/dia`,
                        "text-white",
                      ],
                      [
                        "Projeção",
                        gp.projected == null ? "—" : goalIsCount ? String(Math.round(gp.projected)) : fmtBRLFull(gp.projected),
                        gp.projected != null && gp.projected >= gp.target ? "text-[#7EF0C3]" : "text-[#FFD98A]",
                      ],
                    ] as Array<[string, string, string]>
                  ).map(([l, v, c]) => (
                    <div key={l} className="rounded-lg border border-white/20 bg-white/10 px-3 py-2">
                      <div className="text-[9.5px] font-semibold uppercase tracking-[0.05em] text-white/60">{l}</div>
                      <div className={cn("mt-0.5 text-[14px] font-semibold tabular-nums", c)}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4 · Tendência & esforço */}
        {secTitle("Tendência & esforço", "acumulado do mês · atividades do time")}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <OpsCard className="xl:col-span-7" title="Vendas acumuladas no mês" hint="vs mês anterior (tracejado)">
            {perf?.won_daily && perf.won_daily.current.length >= 2 ? (
              <TrendChart
                current={perf.won_daily.current}
                previous={perf.won_daily.previous}
                meta={gp && !goalIsCount ? gp.target : null}
              />
            ) : (
              <CollectingState label="Carregando vendas do mês…" />
            )}
          </OpsCard>
          <div className="xl:col-span-5 flex flex-col gap-4">
            <OpsCard title="Atividades do time" hint="período filtrado · Δ vs anterior">
              {activities.length === 0 ? (
                <CollectingState label="Nenhuma atividade registrada no período." />
              ) : (
                <div className="flex flex-col gap-2">
                  {activities.map((a) => {
                    const diff = a.current - a.previous
                    const pct = a.previous > 0 ? Math.round((diff / a.previous) * 100) : null
                    return (
                      <div key={a.type} className="flex items-baseline gap-2.5">
                        <span className="flex-1 text-[12px] text-[var(--ops-text)]">
                          {ACTIVITY_LABELS[a.type] ?? a.type}
                        </span>
                        <span className="text-[14.5px] font-semibold text-[var(--ops-title)] tabular-nums">
                          {a.current}
                        </span>
                        <span
                          className={cn(
                            "w-12 text-right text-[11px] font-bold tabular-nums",
                            diff < 0 ? "text-[var(--ops-neg)]" : "text-[var(--ops-pos)]",
                          )}
                        >
                          {pct != null ? `${diff >= 0 ? "+" : "−"}${Math.abs(pct)}%` : `${diff >= 0 ? "+" : "−"}${Math.abs(diff)}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </OpsCard>
            <OpsCard title="Composição do ganho" hint="recorrente vs pontual">
              {!comp || compTot <= 0 ? (
                <CollectingState label="Sem vendas com valor no período." />
              ) : (
                <>
                  <div className="flex h-3 rounded-md overflow-hidden gap-0.5">
                    <div className="rounded-[3px] bg-[var(--ops-accent)]" style={{ width: `${(comp.recorrente / compTot) * 100}%` }} />
                    <div className="flex-1 rounded-[3px] bg-[var(--ops-track)]" />
                  </div>
                  <div className="flex gap-[18px] mt-2.5 flex-wrap">
                    <div>
                      <div className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">
                        <span className="w-2 h-2 rounded-sm bg-[var(--ops-accent)]" />Recorrente
                      </div>
                      <div className="mt-0.5 text-[14px] font-semibold text-[var(--ops-title)] tabular-nums">
                        {fmtBRLFull(comp.recorrente)} · {Math.round((comp.recorrente / compTot) * 100)}%
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">
                        <span className="w-2 h-2 rounded-sm bg-[var(--ops-track)] border border-[var(--ops-border)]" />Pontual
                      </div>
                      <div className="mt-0.5 text-[14px] font-semibold text-[var(--ops-title)] tabular-nums">
                        {fmtBRLFull(comp.pontual)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">MRR novo</div>
                      <div className="mt-0.5 text-[14px] font-semibold text-[var(--ops-pos)] tabular-nums">
                        +{fmtBRLFull(comp.mrr_novo)}/mês
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-[10.5px] text-[var(--ops-mut)] tabular-nums">
                    {comp.vendas_com_itens} de {comp.vendas_total} vendas com itens lançados — venda sem itens conta como pontual.
                  </div>
                </>
              )}
            </OpsCard>
          </div>
        </div>

        {/* 5 · Time & agenda */}
        {secTitle("Time & agenda", "quem entrega · próximas reuniões")}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <OpsCard
            className="xl:col-span-7"
            title="Por responsável"
            hint="meta individual quando definida"
            noPad
            right={
              <button onClick={() => setGoalOpen(true)} className="text-[11.5px] font-medium text-[var(--ops-sec)] hover:text-[var(--ops-title)]">
                Definir metas do time
              </button>
            }
          >
            {!perf ? (
              <CollectingState label="Carregando time…" />
            ) : perf.by_owner.length === 0 ? (
              <CollectingState label="Nenhum vendedor com atividade no mês." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <Th>Pessoa</Th>
                      <Th right>Ganho</Th>
                      <Th right>Win rate</Th>
                      <Th right>Ciclo</Th>
                      <Th right>Meta</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {perf.by_owner.map((r, i) => {
                      const last = i === perf.by_owner.length - 1
                      const goal = individualByOwner.get(r.owner_id)
                      const metaPct =
                        goal && goal.target_value > 0
                          ? Math.round(
                              ((goal.goal_type === "deals_won" ? r.wonCount : r.wonValue) / goal.target_value) * 100,
                            )
                          : null
                      return (
                        <tr key={r.owner_id}>
                          <Td last={last} className="font-semibold text-[var(--ops-title)]">
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={undefined} />
                                <AvatarFallback className="text-[9px] font-semibold">
                                  {r.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                {r.name}
                                {metaPct != null && (
                                  <div className="mt-1 w-[120px] h-1 rounded bg-[var(--ops-track)] overflow-hidden">
                                    <div
                                      className={cn("h-full rounded", metaPct >= 100 ? "bg-[var(--ops-pos)]" : "bg-[var(--ops-accent)]")}
                                      style={{ width: `${Math.min(100, metaPct)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </Td>
                          <Td right last={last} className="font-semibold text-[var(--ops-title)]">
                            {fmtBRLFull(r.wonValue)}
                            <div className="text-[10.5px] font-normal text-[var(--ops-mut)]">
                              {r.wonCount}W · {r.lostCount}L
                            </div>
                          </Td>
                          <Td right last={last}>{r.winRate == null ? "—" : `${Math.round(r.winRate)}%`}</Td>
                          <Td right last={last}>{r.avgCycleDays == null ? "—" : `${Math.round(r.avgCycleDays)}d`}</Td>
                          <Td
                            right
                            last={last}
                            className={cn(
                              "font-semibold",
                              metaPct == null
                                ? "text-[var(--ops-mut)]"
                                : metaPct >= 100
                                  ? "text-[var(--ops-pos)]"
                                  : metaPct >= 70
                                    ? "text-[var(--ops-text)]"
                                    : "text-[var(--ops-warn)]",
                            )}
                          >
                            {metaPct == null ? "—" : `${metaPct}%`}
                          </Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </OpsCard>
          <OpsCard
            className="xl:col-span-5"
            title="Agenda comercial"
            hint={agenda ? `${agendaHoje} hoje · ${agendaSemana} na semana` : undefined}
            right={
              <a href="/admin/meetings" className="text-[11.5px] font-medium text-[var(--ops-sec)] hover:text-[var(--ops-title)]">
                Abrir Reuniões
              </a>
            }
          >
            {!agenda ? (
              <CollectingState label="Carregando agenda…" />
            ) : agendaItems.length === 0 ? (
              <CollectingState label="Nenhuma atividade agendada nos próximos 7 dias." />
            ) : (
              <div className="flex flex-col">
                {agendaItems.map((a, i) => {
                  const d = new Date(a.due_at)
                  const isToday = a.due_at.slice(0, 10) === todayStr
                  const hh = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
                  const label = isToday ? hh : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} · ${hh}`
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        "flex items-center gap-[11px] px-1.5 py-2",
                        i < agendaItems.length - 1 && "border-b border-[var(--ops-border)]",
                      )}
                    >
                      <span className="min-w-[78px] text-center text-[10.5px] font-semibold text-[var(--ops-title)] border border-[var(--ops-border)] bg-[var(--ops-tile)] rounded-md px-[7px] py-[3px] tabular-nums">
                        {label}
                      </span>
                      <span className="flex-1 text-[12.5px] font-medium text-[var(--ops-title)] truncate">
                        {a.content || a.deal_title || "Atividade"}
                      </span>
                      {a.owner_name && (
                        <Avatar className="h-[22px] w-[22px]">
                          <AvatarFallback className="text-[8px] font-semibold">
                            {a.owner_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </OpsCard>
        </div>

        {/* 6 · Recortes */}
        {secTitle("Recortes", "pipeline · origem · fechamentos")}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 pb-2">
          <OpsCard className="xl:col-span-5" title="Por pipeline" hint={`${days} dias`} noPad>
            {!sales || sales.by_pipeline.length === 0 ? (
              <CollectingState label="Nenhum pipeline de vendas." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <Th>Pipeline</Th>
                      <Th right>Abertos</Th>
                      <Th right>Aberto R$</Th>
                      <Th right>Ganho R$</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.by_pipeline.map((p, i) => {
                      const last = i === sales.by_pipeline.length - 1
                      return (
                        <tr key={p.id}>
                          <Td last={last} className="font-semibold text-[var(--ops-title)]">{p.name}</Td>
                          <Td right last={last}>{p.open_count}</Td>
                          <Td right last={last}>{fmtBRLCompact(p.open_value)}</Td>
                          <Td right last={last} className="font-semibold text-[var(--ops-pos)]">{fmtBRLCompact(p.won_value)}</Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </OpsCard>
          <OpsCard className="xl:col-span-4" title="Por origem" hint="valor ganho">
            {fontes.length === 0 ? (
              <CollectingState label="Nenhum ganho com origem no período." />
            ) : (
              <div className="flex flex-col gap-[11px]">
                {fontes.map((f) => (
                  <div key={f.source}>
                    <div className="flex justify-between text-[12px] mb-1 gap-2">
                      <span className="font-medium text-[var(--ops-text)] truncate">{sourceLabel(f.source)}</span>
                      <span className="font-semibold text-[var(--ops-pos)] tabular-nums shrink-0">{fmtBRLFull(f.won_value)}</span>
                    </div>
                    <div className="h-[7px] rounded overflow-hidden bg-[var(--ops-track)]">
                      <div className="h-full rounded bg-[var(--ops-accent)] opacity-85" style={{ width: `${(f.won_value / maxFonte) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </OpsCard>
          <OpsCard className="xl:col-span-3" title="Últimos ganhos" noPad>
            {!sales || sales.recent_wins.length === 0 ? (
              <CollectingState label="Nenhum ganho no período." />
            ) : (
              <div className="px-2 py-1.5 flex flex-col">
                {sales.recent_wins.slice(0, 4).map((w, i) => (
                  <a
                    key={w.id}
                    href={`/admin/comercial/deals/${w.id}/detail`}
                    className={cn(
                      "flex items-center gap-2 px-2 py-[7px] rounded-md hover:bg-[var(--ops-hover)]",
                      i < Math.min(3, sales.recent_wins.length - 1) && "border-b border-[var(--ops-border)]",
                    )}
                  >
                    <span className="w-[22px] h-[22px] rounded-md bg-[var(--ops-pos)]/10 text-[var(--ops-pos)] inline-flex items-center justify-center shrink-0">
                      <Icon icon={Check} customSize={11} />
                    </span>
                    <span className="flex-1 text-[11.5px] font-medium text-[var(--ops-title)] truncate">{w.title}</span>
                    <span className="text-[11.5px] font-semibold text-[var(--ops-pos)] tabular-nums">
                      {w.value != null ? fmtBRLCompact(w.value) : "—"}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </OpsCard>
        </div>
      </div>

      {/* Meta editável — GoalDialog do painel antigo (metas do time incluídas) */}
      {perf && (
        <GoalDialog
          open={goalOpen}
          onOpenChange={setGoalOpen}
          periodStart={perf.period.start}
          periodType="month"
          currentTarget={perf.goal?.target_value ?? null}
          currentType={(perf.goal?.goal_type as GoalType) ?? "revenue_won"}
          owners={perf.by_owner.map((o) => ({ id: o.owner_id, name: o.name }))}
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

function FunnelTile({
  label,
  value,
  color,
  icon,
}: {
  label: string
  value: string
  color: string
  icon: LucideIcon
}) {
  return (
    <div className="flex items-center gap-[11px] px-[13px] py-[11px] rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-tile)]">
      <span
        className="w-[30px] h-[30px] rounded-lg inline-flex items-center justify-center shrink-0 text-white"
        style={{ background: color }}
      >
        <Icon icon={icon} customSize={14} />
      </span>
      <span className="min-w-0">
        <span className="block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--ops-sec)]">{label}</span>
        <span className="block mt-px text-[15.5px] font-semibold text-[var(--ops-title)] tabular-nums">{value}</span>
      </span>
    </div>
  )
}
