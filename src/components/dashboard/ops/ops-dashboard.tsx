"use client"

/**
 * Dashboard Operacional — design ago/2026 (Claude Design), 100% dados
 * reais: Receita → Carteira → Séries → Email/Lojas → Flows →
 * Onboarding/CS → Alertas → Clientes.
 *
 * Todas as rotas recebem `?period=&start=&end=` (o range custom viaja
 * de verdade — antes period=custom sem datas virava 30d em silêncio).
 * Métrica sem fonte mostra estado vazio explícito, nunca número
 * inventado.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import { cn } from "@/lib/utils"
import { useRealtimeRevenue } from "@/hooks/use-realtime-revenue"
import {
  DateControl,
  defaultOpsPeriod,
  periodQuery,
  type OpsPeriodValue,
} from "./date-control"
import { Spark, AreaCompareChart, WeekLines } from "./charts"
import {
  CollectingState,
  DeltaText,
  OpsCard,
  OpsKpi,
  fmtBRLCompact,
  fmtPct,
} from "./primitives"
import {
  AlertsCard,
  ClientsRevenueTable,
  EmailPerfCard,
  FlowsRow,
  OnboardingCard,
  CsCardsCard,
  PortfolioHealthCard,
  StoresHealthTable,
  type CsDashboardData,
} from "./ops-sections"
import { AuditDialog, type AuditMode } from "./ops-audit"

// ── Fetch ───────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(
      (body && typeof body.error === "string" && body.error) || `Erro ${res.status}`,
    )
  }
  return body as T
}

const SWR_OPTS = { revalidateOnFocus: false, dedupingInterval: 30_000 }

// ── Shapes das rotas (unwrap direto: successResponse espalha no topo) ──

interface TotalRevenueData {
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  storesCount: number
  storesWithRevenue: number
  /** "ready" | "stale" | "empty" | "syncing" — postura do cache do período. */
  dataStatus?: string
  isStale?: boolean
  isRefreshing?: boolean
  lastFetchedAt?: string | null
  /** Lojas cujo último sync FALHOU (chave inválida etc.) — antes só no log da Vercel. */
  syncIssues?: {
    count: number
    stores: Array<{ storeId: string; storeName: string; clientName: string; error: string }>
  }
}

/**
 * Traduz o erro cru do sync (gravado em store_revenue_summary.sync_error)
 * pra uma frase acionável — "Invalid key: 401 authentication_failed"
 * não diz ao operador O QUE fazer; "atualize a API key da loja" diz.
 */
function friendlySyncError(raw: string): string {
  const msg = raw.replace(/^\[INVALID_KEY\]\s*/i, "")
  if (/invalid key|authentication_failed|API key (is )?invalid|401/i.test(msg))
    return "Chave Klaviyo inválida — atualize a API key no cadastro da loja"
  if (/no api key|no omnisend api key/i.test(msg)) return "Sem API key cadastrada"
  if (/permission denied|missing scopes/i.test(msg))
    return "API key sem permissão (scopes de relatório faltando)"
  if (/rate limit/i.test(msg)) return "Rate limit da plataforma — resincroniza sozinho depois"
  if (/no placed order/i.test(msg)) return "Métrica Placed Order não encontrada na conta"
  if (/retroativo/i.test(msg)) return msg
  return msg.length > 120 ? `${msg.slice(0, 117)}…` : msg
}

interface KpiSeriesData {
  rate: number
  deltas?: Record<string, { value: number | null; label: string }>
}

interface OpsSeriesData {
  atual: Array<{ date: string; revenue: number; openRate: number }>
  anterior: Array<{ date: string; revenue: number }>
  totals: { revenue: number; recipients: number }
  deltas: Record<string, number | null>
  collecting: boolean
  window: { from: string; to: string; days: number }
  source?: "daily" | "campaign_fallback"
  debug?: { daily_points: number; fallback_campaign_rows: number }
}

interface PortfolioExtrasData {
  churn_30d: { clients: number; mrr_cents: number; window_days: number }
  no_send_14d: { count: number; store_names: string[]; window_days: number }
}

interface WeeklyPerfData {
  weeks: Array<{ week: string; open: number; click: number; conv: number }>
  totalsZero: boolean
}

const MESES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function xLabelsFromWindow(win?: { from: string; to: string; days: number }): string[] {
  if (!win) return []
  const start = new Date(`${win.from}T00:00:00.000Z`).getTime()
  const idxs = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((win.days - 1) * f))
  return [...new Set(idxs)].map((i) => {
    const d = new Date(start + i * 86_400_000)
    return `${String(d.getUTCDate()).padStart(2, "0")} ${MESES3[d.getUTCMonth()]}`
  })
}

// ── Root ────────────────────────────────────────────────────────────

const KPI_SERIES_PERIODS = new Set(["7d", "15d", "30d", "90d"])

export function OpsDashboard({ userName }: { userName: string }) {
  const [period, setPeriod] = useState<OpsPeriodValue>(defaultOpsPeriod)
  const [audit, setAudit] = useState<AuditMode | null>(null)
  const q = periodQuery(period)

  const { data: revenue, error: revenueError } = useSWR<TotalRevenueData>(
    `/api/dashboard/total-revenue?${q}`,
    fetchJson,
    SWR_OPTS,
  )

  // ── Auto-sincronização do período (incidente 7d zerado) ──────────
  // total-revenue é CACHE-ONLY (store_revenue_summary) e o cron prioriza
  // 30d — trocar pra 7d/90d podia cair num rótulo vazio/velho e a tela
  // mostrava R$ 0 sem explicação. Quando o cache do período está
  // stale/empty, dispara POST /api/dashboard/refresh-revenue (com lock
  // server-side) UMA vez por período e o realtime/polling revalida os
  // cards conforme as lojas sincronizam.
  const { mutate: globalMutate } = useSWRConfig()
  const revalidateDashboards = useCallback(() => {
    void globalMutate(
      (key) => typeof key === "string" && key.startsWith("/api/dashboard/"),
      undefined,
      { revalidate: true },
    )
  }, [globalMutate])
  const isoDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  const { isRefreshing, triggerRefresh } = useRealtimeRevenue({
    period: period.period,
    start: isoDate(period.start),
    end: isoDate(period.end),
    onDataUpdate: revalidateDashboards,
  })
  // Uma tentativa por SELEÇÃO (período+datas): range custom novo dispara
  // de novo; o lock server-side segura duplicatas concorrentes.
  const selectionKey = `${period.period}:${isoDate(period.start)}:${isoDate(period.end)}`
  const autoRefreshedFor = useRef<string | null>(null)
  const needsSync =
    revenue != null &&
    (revenue.dataStatus === "empty" || revenue.dataStatus === "stale" || revenue.isStale === true)
  useEffect(() => {
    if (!needsSync) return
    if (autoRefreshedFor.current === selectionKey) return
    autoRefreshedFor.current = selectionKey
    void triggerRefresh()
  }, [needsSync, selectionKey, triggerRefresh])
  const { data: kpi } = useSWR<KpiSeriesData>(
    KPI_SERIES_PERIODS.has(period.period) ? `/api/dashboard/kpi-series?period=${period.period}` : null,
    fetchJson,
    SWR_OPTS,
  )
  const { data: series, error: seriesError } = useSWR<OpsSeriesData>(
    `/api/dashboard/ops-series?${q}`,
    fetchJson,
    SWR_OPTS,
  )
  const { data: cs } = useSWR<CsDashboardData>("/api/crm/dashboard/cs", fetchJson, SWR_OPTS)
  const { data: extras } = useSWR<PortfolioExtrasData>(
    "/api/dashboard/portfolio-extras",
    fetchJson,
    SWR_OPTS,
  )
  const { data: weekly, error: weeklyError } = useSWR<WeeklyPerfData>(
    "/api/dashboard/weekly-perf?weeks=4",
    fetchJson,
    SWR_OPTS,
  )
  // Mesma chave das tabelas de Lojas/Clientes — SWR dedupe, 1 request só.
  const { data: overview } = useSWR<{
    stores: Array<{ clientName: string; storeName: string; totalRevenueBRL: number }>
  }>(`/api/dashboard/stores-overview?${q}`, fetchJson, SWR_OPTS)

  const hr = new Date().getHours()
  const saud = hr < 12 ? "Bom dia" : hr < 18 ? "Boa tarde" : "Boa noite"

  const atribuida = revenue ? revenue.campaignRevenue + revenue.flowRevenue : null
  const campanhasSpark = series?.atual?.map((p) => p.revenue) ?? []

  // Faturamento das LOJAS (Shopify/Statistics) agregado por cliente —
  // soma da carteira ativa no período + média por cliente ativo.
  const faturamento = (() => {
    if (!overview) return null
    const total = overview.stores.reduce((s, r) => s + (r.totalRevenueBRL || 0), 0)
    const clientes = new Set(overview.stores.map((r) => r.clientName || r.storeName)).size
    return { total, clientes, media: clientes > 0 ? total / clientes : 0 }
  })()

  return (
    // Sangra o padding do shell (-m-*) pra página controlar o próprio
    // respiro (32/40px do design) — mesmo padrão das páginas full-bleed.
    <div className="-m-4 md:-m-6 lg:-m-8 bg-[var(--ops-page)] min-h-[100dvh]">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-7 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-end gap-3.5 flex-wrap">
          <div>
            <h1 className="m-0 text-[22px] font-semibold tracking-[-0.015em] text-[var(--ops-title)]">
              Dashboard
            </h1>
            <div className="mt-0.5 text-[12.5px] text-[var(--ops-sec)]">
              {saud}, {userName}
            </div>
          </div>
          <div className="flex-1" />
          <SyncStatusChip
            syncing={isRefreshing || revenue?.isRefreshing === true || revenue?.dataStatus === "syncing"}
            stale={needsSync}
            lastFetchedAt={revenue?.lastFetchedAt ?? null}
            storesWithRevenue={revenue?.storesWithRevenue}
            storesCount={revenue?.storesCount}
            issues={revenue?.syncIssues?.count ?? 0}
            onSync={() => void triggerRefresh()}
          />
          <DateControl value={period} onChange={setPeriod} />
        </div>

        {revenueError && (
          <div className="rounded-[10px] border border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] px-4 py-3 text-[12.5px] text-[var(--ops-warn)]">
            Não consegui carregar a receita: {String(revenueError.message || revenueError)}
          </div>
        )}

        {/* Cache do período incompleto → sincronização em andamento */}
        {(isRefreshing || needsSync) && (
          <div className="flex items-center gap-3 rounded-[10px] border border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] px-4 py-2.5 text-[12.5px] text-[var(--ops-warn)]">
            {isRefreshing ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" />
                <span>
                  Sincronizando <strong>{period.presetLabel ?? "o período"}</strong> com Klaviyo/Omnisend
                  {revenue ? ` — ${revenue.storesWithRevenue} de ${revenue.storesCount} lojas com dado até agora` : ""}.
                  Os números completam sozinhos conforme as lojas terminam.
                </span>
              </>
            ) : (
              <>
                <span className="flex-1">
                  O cache deste período está incompleto/desatualizado
                  {revenue ? ` (${revenue.storesWithRevenue} de ${revenue.storesCount} lojas com receita)` : ""} —
                  os cards podem mostrar menos do que o real.
                </span>
                <button
                  onClick={() => void triggerRefresh()}
                  className="shrink-0 h-7 px-3 rounded-md border border-[var(--ops-warn-br)] font-semibold hover:bg-[var(--ops-warn)]/10"
                >
                  Sincronizar agora
                </button>
              </>
            )}
          </div>
        )}

        {/* Lojas que FALHAM no sync — o motivo ficava só no log da Vercel */}
        {revenue?.syncIssues != null && revenue.syncIssues.count > 0 && (
          <details className="rounded-[10px] border border-[var(--ops-neg)]/30 bg-[var(--ops-neg)]/[0.06] px-4 py-2.5 text-[12.5px]">
            <summary className="cursor-pointer select-none text-[var(--ops-neg)] font-medium list-none flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-current shrink-0" />
              <span className="flex-1">
                {revenue.syncIssues.count === 1
                  ? "1 loja não sincroniza"
                  : `${revenue.syncIssues.count} lojas não sincronizam`}{" "}
                — os números delas não entram nos cards. Clique para ver o motivo de cada uma.
              </span>
              <span className="text-[10.5px] uppercase tracking-[0.05em] opacity-70">detalhes</span>
            </summary>
            <ul className="mt-2.5 grid gap-1 sm:grid-cols-2 text-[var(--ops-sec)]">
              {revenue.syncIssues.stores.map((s) => (
                <li key={s.storeId} className="flex gap-1.5 min-w-0">
                  <span className="font-medium text-[var(--ops-text)] shrink-0">{s.storeName}:</span>
                  <span className="truncate" title={s.error}>{friendlySyncError(s.error)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 text-[11px] text-[var(--ops-mut)]">
              Corrija a credencial em Lojas → editar loja. Depois de salvar, clique em
              &ldquo;Sincronizar agora&rdquo; que a loja volta a contar.
            </div>
          </details>
        )}

        {/* ── Receita (cards clicáveis → auditoria loja a loja) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <RevenueCard
            label="Receita Atribuída"
            value={atribuida}
            delta={kpi?.deltas?.total}
            onClick={() => setAudit("atribuida")}
          />
          <RevenueCard
            label="Receita Campanhas"
            value={revenue?.campaignRevenue ?? null}
            delta={kpi?.deltas?.campaign}
            spark={campanhasSpark.length >= 2 ? campanhasSpark : undefined}
            onClick={() => setAudit("campanhas")}
          />
          <RevenueCard
            label="Receita Automações"
            value={revenue?.flowRevenue ?? null}
            delta={kpi?.deltas?.flow}
            onClick={() => setAudit("automacoes")}
          />
          {/* Hero — Taxa média Convertfy (gradient brand) */}
          <div
            onClick={() => setAudit("taxa")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setAudit("taxa")}
            title="Clique para auditar loja a loja"
            className="rounded-[10px] p-[17px_18px] flex flex-col bg-gradient-to-br from-[#4E62D8] to-[#2137B6] dark:from-[#2137B6] dark:to-[#4E62D8] cursor-pointer">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-white/75">
              Taxa média Convertfy
            </div>
            <div className="mt-2 text-[22px] font-semibold text-white tabular-nums tracking-[-0.01em]">
              {kpi ? fmtPct(kpi.rate) : "—"}
            </div>
            <div className="mt-0.5 text-[10.5px] text-white/70">
              % da receita das lojas via email
              {kpi?.deltas?.rate?.value != null && (
                <span className="ml-1.5 tabular-nums">
                  · {kpi.deltas.rate.value >= 0 ? "+" : ""}
                  {String(kpi.deltas.rate.value).replace(".", ",")} pp {kpi.deltas.rate.label}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Carteira ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          <OpsKpi
            label="Carteira ativa"
            value={cs ? cs.total_stores : "—"}
            sub={cs ? `${cs.total_clients} clientes` : undefined}
          />
          <OpsKpi
            label="MRR"
            value={cs ? fmtBRLCompact(cs.total_mrr_cents / 100) : "—"}
            sub={cs ? `${cs.mrr_client_count} de ${cs.total_clients} clientes mapeados` : undefined}
          />
          <OpsKpi
            label="Faturamento total"
            value={faturamento ? fmtBRLCompact(faturamento.total) : "—"}
            sub="soma das lojas ativas no período"
            onClick={() => setAudit("faturamento")}
          />
          <OpsKpi
            label="Média por cliente"
            value={faturamento ? fmtBRLCompact(faturamento.media) : "—"}
            sub={faturamento ? `${faturamento.clientes} clientes ativos` : undefined}
            onClick={() => setAudit("media")}
          />
          <OpsKpi
            label="Lojas em risco"
            value={cs ? cs.health_distribution.critical : "—"}
            sub="health < 50"
            tone="neg"
          />
          <OpsKpi
            label="Churn (30d)"
            value={extras ? extras.churn_30d.clients : "—"}
            sub={
              extras && extras.churn_30d.mrr_cents > 0
                ? `−${fmtBRLCompact(extras.churn_30d.mrr_cents / 100)} MRR`
                : "assinaturas canceladas"
            }
            tone="neg"
          />
        </div>

        {/* ── Séries ── */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <OpsCard
            className="xl:col-span-7"
            title="Receita atribuída"
            hint="campanhas · diário · atual vs anterior"
            right={
              <div className="hidden sm:flex gap-3 text-[11px] text-[var(--ops-sec)]">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-[2.5px] rounded-sm bg-[var(--ops-accent)]" />
                  atual
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 border-t-2 border-dashed border-[var(--ops-mut)]" />
                  anterior
                </span>
              </div>
            }
          >
            {seriesError ? (
              <CollectingState
                label={`Erro ao carregar a série: ${String(seriesError.message || seriesError)}`}
              />
            ) : !series ? (
              <CollectingState label="Carregando série diária…" />
            ) : series.collecting || series.atual.length < 2 ? (
              <CollectingState
                label={`Sem pontos na janela (diária: ${series.debug?.daily_points ?? 0} · campanhas com send_time: ${series.debug?.fallback_campaign_rows ?? 0}) — se ambos são 0, o sync de campanhas não grava send_time.`}
              />
            ) : (
              <>
                <AreaCompareChart
                  atual={series.atual.map((p) => p.revenue)}
                  anterior={period.compare ? series.anterior.map((p) => p.revenue) : []}
                  xLabels={xLabelsFromWindow(series.window)}
                />
                <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--ops-mut)] tabular-nums">
                  <span>
                    total {fmtBRLCompact(series.totals.revenue)}
                  </span>
                  {period.compare && (
                    <DeltaText value={series.deltas.revenue} label="vs anterior" />
                  )}
                </div>
              </>
            )}
          </OpsCard>
          <OpsCard
            className="xl:col-span-5"
            title="Performance por semana"
            hint="campanhas · 4 semanas"
          >
            {weeklyError ? (
              <CollectingState label={`Erro ao carregar: ${String(weeklyError.message || weeklyError)}`} />
            ) : !weekly ? (
              <CollectingState label="Carregando performance semanal…" />
            ) : weekly.totalsZero || weekly.weeks.length === 0 ? (
              <CollectingState label="Sem campanha com send_time na janela de 90d — cheque a sincronização de campanhas." />
            ) : (
              <WeekLines
                labels={weekly.weeks.map((w) => w.week)}
                series={[
                  { label: "Open %", color: "var(--ops-accent)", values: weekly.weeks.map((w) => w.open) },
                  { label: "Click %", color: "#7C3AED", values: weekly.weeks.map((w) => w.click) },
                  { label: "Conv %", color: "#D97706", values: weekly.weeks.map((w) => w.conv) },
                ]}
              />
            )}
          </OpsCard>
        </div>

        {/* ── Email + Saúde das lojas ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <EmailPerfCard
            q={q}
            seriesDeltas={period.compare ? series?.deltas : undefined}
            openRateSpark={series?.atual?.map((p) => p.openRate)}
          />
          <StoresHealthTable q={q} />
        </div>

        {/* ── Flows ── */}
        <FlowsRow q={q} />

        {/* ── Onboarding + carteira/CS ── */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <OnboardingCard className="xl:col-span-7" />
          <div className="xl:col-span-5 flex flex-col gap-4">
            <PortfolioHealthCard cs={cs} />
            <CsCardsCard cs={cs} />
          </div>
        </div>

        {/* ── Alertas + Clientes ── */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 pb-6">
          <AlertsCard className="xl:col-span-5" />
          <ClientsRevenueTable className="xl:col-span-7" q={q} />
        </div>
      </div>

      {/* Auditoria loja a loja (aberta pelo clique nos cards de receita) */}
      <AuditDialog
        mode={audit}
        q={q}
        cardValue={
          audit === "atribuida"
            ? atribuida
            : audit === "campanhas"
              ? revenue?.campaignRevenue ?? null
              : audit === "automacoes"
                ? revenue?.flowRevenue ?? null
                : audit === "taxa"
                  ? kpi?.rate ?? null
                  : audit === "faturamento"
                    ? faturamento?.total ?? null
                    : audit === "media"
                      ? faturamento?.media ?? null
                      : null
        }
        onClose={() => setAudit(null)}
      />
    </div>
  )
}

// ── Chip de status da sincronização ─────────────────────────────────
// Sempre visível ao lado do seletor de data — o banner detalhado só
// aparece durante o refresh; o chip responde "e agora, tá atualizado?"
// o tempo todo. Estados: sincronizando (âmbar girando) → desatualizado
// (âmbar clicável) → atualizado (verde, idade do dado no rótulo).

function timeAgoPtBR(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return "agora"
  const min = Math.floor(ms / 60_000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return d === 1 ? "há 1 dia" : `há ${d} dias`
}

function SyncStatusChip({
  syncing,
  stale,
  lastFetchedAt,
  storesWithRevenue,
  storesCount,
  issues = 0,
  onSync,
}: {
  syncing: boolean
  stale: boolean
  lastFetchedAt: string | null
  storesWithRevenue?: number
  storesCount?: number
  /** Lojas com erro de sync — vira sufixo "· N com erro" no estado verde. */
  issues?: number
  onSync: () => void
}) {
  // Relógio de 30s pra "há X min" não congelar na aba aberta.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const progresso =
    storesWithRevenue != null && storesCount != null && storesCount > 0
      ? `${storesWithRevenue}/${storesCount} lojas`
      : null

  const base =
    "inline-flex items-center gap-2 h-8 px-3 rounded-full border text-[11.5px] font-medium whitespace-nowrap transition-colors"

  if (syncing) {
    return (
      <span
        className={cn(base, "border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] text-[var(--ops-warn)]")}
        title={progresso ? `Sincronizando com Klaviyo/Omnisend — ${progresso} com dado até agora` : "Sincronizando com Klaviyo/Omnisend"}
        aria-live="polite"
      >
        <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" />
        Sincronizando…{progresso ? ` ${progresso}` : ""}
      </span>
    )
  }

  if (stale) {
    return (
      <button
        onClick={onSync}
        className={cn(
          base,
          "border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] text-[var(--ops-warn)] cursor-pointer hover:brightness-95 dark:hover:brightness-110",
        )}
        title="O cache deste período está incompleto ou velho — clique para sincronizar agora"
      >
        <span className="w-2 h-2 rounded-full bg-current shrink-0" />
        Desatualizado — sincronizar
      </button>
    )
  }

  return (
    <button
      onClick={onSync}
      className={cn(
        base,
        "border-[var(--ops-border)] bg-[var(--ops-card)] text-[var(--ops-sec)] cursor-pointer hover:border-[var(--ops-accent)]",
      )}
      title={`Dados do cache${progresso ? ` — ${progresso} com receita` : ""}${issues > 0 ? `. ${issues} loja(s) com erro de sync — veja o aviso vermelho.` : ""}. Clique para sincronizar de novo.`}
    >
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          issues > 0 ? "bg-[var(--ops-warn)]" : "bg-[var(--ops-pos)]",
        )}
      />
      {lastFetchedAt ? `Atualizado ${timeAgoPtBR(lastFetchedAt, now)}` : "Atualizado"}
      {issues > 0 && (
        <span className="text-[var(--ops-neg)] font-semibold">· {issues} com erro</span>
      )}
    </button>
  )
}

// ── Card de receita (com delta real e spark opcional) ───────────────

function RevenueCard({
  label,
  value,
  delta,
  spark,
  onClick,
}: {
  label: string
  value: number | null
  delta?: { value: number | null; label: string }
  spark?: number[]
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
      title={onClick ? "Clique para auditar loja a loja" : undefined}
      className={cn(
        "rounded-[10px] border bg-[var(--ops-card)] border-[var(--ops-border)] px-[18px] py-[17px] flex flex-col",
        onClick &&
          "cursor-pointer transition-colors hover:border-[var(--ops-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ops-accent)]",
      )}
    >
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">
        {label}
      </div>
      <div className="flex items-end gap-2.5 mt-2">
        <div className="flex-1 min-w-0">
          <div className="text-[22px] font-semibold text-[var(--ops-title)] tabular-nums tracking-[-0.01em]">
            {value == null ? "—" : fmtBRLCompact(value)}
          </div>
          <div className="mt-0.5 min-h-[16px]">
            {delta && delta.value != null ? (
              <DeltaText value={delta.value} label={delta.label} />
            ) : (
              <span className="text-[10.5px] text-[var(--ops-mut)]">
                {delta?.label ?? ""}
              </span>
            )}
          </div>
        </div>
        {spark && (
          <span className="text-[var(--ops-accent)]">
            <Spark data={spark} w={92} h={30} />
          </span>
        )}
      </div>
    </div>
  )
}
