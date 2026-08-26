"use client"

/**
 * Seções do Dashboard Operacional — Email, Saúde das Lojas, Flows,
 * Onboarding, CS, Alertas e Clientes. Cada uma busca a própria rota
 * (SWR) e mostra estado vazio explícito quando não há dado.
 */

import { useState } from "react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { Spark } from "./charts"
import { EmailAuditDialog } from "./ops-audit"
import {
  CollectingState,
  DeltaText,
  OpsCard,
  Td,
  Th,
  fmtBRLCompact,
  fmtBRLFull,
  fmtCompactInt,
  fmtPct,
} from "./primitives"

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(
      (body && typeof body.error === "string" && body.error) || `Erro ${res.status}`,
    ) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return body as T
}

const SWR_OPTS = {
  revalidateOnFocus: false,
  dedupingInterval: 30_000,
  // 401 = sessão expirada — re-tentar vira storm de requests (o retry
  // default do SWR martelava kpi-series/flows/email-perf a cada ~10s
  // numa aba esquecida aberta).
  shouldRetryOnError: (err: unknown) =>
    (err as { status?: number } | null)?.status !== 401,
}

// ── Shapes ──────────────────────────────────────────────────────────

export interface CsDashboardData {
  total_stores: number
  total_clients: number
  mrr_client_count: number
  total_mrr_cents: number
  health_distribution: { healthy: number; warning: number; critical: number; no_score: number }
  nps: { score: number | null; count: number } | null
  by_pipeline: Array<{ id: string; name: string; color: string | null; open_count: number }>
}

interface EmailPerfData {
  metrics: {
    openRate: number
    clickRate: number
    ctor: number
    placedOrderRate: number
    rpe: number
    deliveryRate: number
    unsubRate: number
  }
  totals: { recipients: number }
  audience: { totalLeads: number; engagedLeads: number }
}

interface StoreOverviewRow {
  id: string
  storeName: string
  clientName: string
  healthScore: number | null
  trend: "up" | "down" | null
  totalRevenueBRL: number
  attributedRevenueBRL: number
  recoveryRate: number
  campaigns: { openRate: number; clickRate: number; envios: number }
}

interface FlowsAggregateData {
  flows: Array<{
    title: string
    rate: number
    benchmark: number
    revenueBRL?: number
    revenue: string
    worstClients: Array<{ name: string; value: number }>
  }>
}

interface OnboardingSummaryData {
  in_progress: number
  avg_days: number | null
  overdue: number
  completed_30d: number
  phases: Array<{ id: string; name: string; color: string | null; count: number }>
  oldest: Array<{ id: string; store_name: string; phase: string; days_in_phase: number }>
}

interface AlertsData {
  alerts: Array<{
    id: string
    severity: "critical" | "warning" | "info"
    title: string
    message: string
    store_name?: string
  }>
}

// Cores default das fases (mesma paleta do kanban) quando a coluna não
// tem cor no banco.
const PHASE_FALLBACK_COLORS = [
  "#9CA3AF", "#4E62D8", "#7C3AED", "#A78BFA", "#D97706", "#2563EB", "#047857",
]

// ── Email performance ───────────────────────────────────────────────

export function EmailPerfCard({
  q,
  seriesDeltas,
  openRateSpark,
}: {
  q: string
  seriesDeltas?: Record<string, number | null>
  /** Open rate por dia da janela (ops-series, com fallback por campanhas). */
  openRateSpark?: number[]
}) {
  const { data } = useSWR<EmailPerfData>(`/api/dashboard/email-performance?${q}`, fetchJson, SWR_OPTS)
  const [auditOpen, setAuditOpen] = useState(false)

  const tiles: Array<[string, string, number | null | undefined, boolean]> = data
    ? [
        ["Open Rate", fmtPct(data.metrics.openRate), seriesDeltas?.openRate, false],
        ["Click Rate", fmtPct(data.metrics.clickRate, 2), seriesDeltas?.clickRate, false],
        ["CTOR", fmtPct(data.metrics.ctor), seriesDeltas?.ctor, false],
        ["Placed Order", fmtPct(data.metrics.placedOrderRate, 2), seriesDeltas?.placedOrderRate, false],
        ["RPE", `R$ ${data.metrics.rpe.toFixed(2).replace(".", ",")}`, seriesDeltas?.rpe, false],
        ["Deliverability", fmtPct(data.metrics.deliveryRate), seriesDeltas?.deliveryRate, false],
      ]
    : []

  const foot: Array<[string, string]> = data
    ? [
        ["Volume de envios", fmtCompactInt(data.totals.recipients)],
        ["Perfis ativos", fmtCompactInt(data.audience.totalLeads)],
        ["Engajados (90d)", fmtCompactInt(data.audience.engagedLeads)],
        ["Unsub rate", fmtPct(data.metrics.unsubRate, 2)],
      ]
    : []

  return (
    <OpsCard
      title="Performance do Email"
      hint={data ? `${fmtCompactInt(data.totals.recipients)} envios no período` : undefined}
      right={
        <button
          onClick={() => setAuditOpen(true)}
          className="text-[11.5px] font-medium text-[var(--ops-sec)] hover:text-[var(--ops-title)]"
        >
          Auditar
        </button>
      }
    >
      {auditOpen && (
        <EmailAuditDialog
          q={q}
          cardOpenRate={data?.metrics.openRate ?? null}
          onClose={() => setAuditOpen(false)}
        />
      )}
      {!data ? (
        <CollectingState label="Carregando métricas de email…" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {tiles.map(([label, value, delta]) => (
              <div
                key={label}
                className="rounded-lg border border-[var(--ops-border)] bg-[var(--ops-tile)] px-[13px] py-3"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--ops-sec)]">
                  {label}
                </div>
                <div className="mt-0.5 text-[17px] font-semibold text-[var(--ops-title)] tabular-nums">
                  {value}
                </div>
                <div className="min-h-[15px]">
                  <DeltaText
                    value={delta}
                    suffix={label === "RPE" ? "%" : " pp"}
                    invert={false}
                    label={delta != null ? "vs anterior" : undefined}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="text-[10.5px] text-[var(--ops-mut)] mb-1.5">Open rate por dia · período</div>
            {openRateSpark && openRateSpark.length >= 2 ? (
              <span className="block text-[var(--ops-accent)]">
                <Spark data={openRateSpark} w={470} h={44} className="w-full" />
              </span>
            ) : (
              <div className="text-[11.5px] text-[var(--ops-mut)]">coletando série diária…</div>
            )}
          </div>
          <div className="flex mt-4 pt-3.5 border-t border-[var(--ops-border)]">
            {foot.map(([label, value]) => (
              <div key={label} className="flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--ops-sec)]">
                  {label}
                </div>
                <div className="mt-0.5 text-[13.5px] font-semibold text-[var(--ops-title)] tabular-nums">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </OpsCard>
  )
}

// ── Saúde das Lojas (tabela) ────────────────────────────────────────

function scoreTone(score: number): string {
  if (score >= 70) return "text-[var(--ops-pos)] bg-[var(--ops-pos)]/10"
  if (score >= 50) return "text-[var(--ops-warn)] bg-[var(--ops-warn-bg)]"
  return "text-[var(--ops-neg)] bg-[var(--ops-neg)]/10"
}

export function StoresHealthTable({ q }: { q: string }) {
  const { data } = useSWR<{ stores: StoreOverviewRow[] }>(
    `/api/dashboard/stores-overview?${q}`,
    fetchJson,
    SWR_OPTS,
  )
  const stores = (data?.stores ?? []).slice(0, 7)
  const critical = (data?.stores ?? []).filter((s) => s.healthScore != null && s.healthScore < 50).length

  return (
    <OpsCard
      title="Saúde das Lojas"
      hint={data ? `${critical} precisa${critical === 1 ? "" : "m"} de atenção · ${stores.length} de ${data.stores.length}` : undefined}
      right={
        <a href="/admin/health" className="text-[11.5px] font-medium text-[var(--ops-sec)] hover:text-[var(--ops-title)]">
          Ver todas
        </a>
      }
      noPad
    >
      {!data ? (
        <CollectingState label="Carregando lojas…" />
      ) : stores.length === 0 ? (
        <CollectingState label="Nenhuma loja ativa com receita no período." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Loja</Th>
                <Th right>Fat. loja</Th>
                <Th right>Fat. atrib.</Th>
                <Th right>% receita</Th>
                <Th right>Score</Th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s, i) => {
                const last = i === stores.length - 1
                return (
                  <tr key={s.id}>
                    <Td last={last} className="font-semibold text-[var(--ops-title)]">
                      {s.healthScore != null && s.healthScore < 50 && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--ops-neg)] mr-1.5 align-middle" />
                      )}
                      {s.storeName}
                    </Td>
                    <Td right last={last}>{fmtBRLCompact(s.totalRevenueBRL)}</Td>
                    <Td right last={last}>
                      {s.attributedRevenueBRL > 0 ? fmtBRLCompact(s.attributedRevenueBRL) : "—"}
                    </Td>
                    <Td
                      right
                      last={last}
                      className={cn(
                        "font-semibold",
                        s.recoveryRate < 15 ? "text-[var(--ops-neg)]" : "text-[var(--ops-pos)]",
                      )}
                    >
                      {fmtPct(s.recoveryRate)}
                    </Td>
                    <Td right last={last}>
                      {s.healthScore == null ? (
                        <span className="text-[var(--ops-mut)]">—</span>
                      ) : (
                        <span
                          className={cn(
                            "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums",
                            scoreTone(s.healthScore),
                          )}
                        >
                          {s.healthScore}
                        </span>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </OpsCard>
  )
}

// ── Flows ───────────────────────────────────────────────────────────

export function FlowsRow({ q }: { q: string }) {
  const { data } = useSWR<FlowsAggregateData>(`/api/dashboard/flows-aggregate?${q}`, fetchJson, SWR_OPTS)
  const flows = data?.flows ?? []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2 px-0.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ops-sec)]">
          Performance dos Flows
        </span>
        <span className="text-[11px] text-[var(--ops-mut)]">conversão vs benchmark · receita no período</span>
      </div>
      {!data ? (
        <OpsCard><CollectingState label="Carregando flows…" /></OpsCard>
      ) : flows.length === 0 ? (
        <OpsCard><CollectingState label="Nenhum flow ativo com dados no período." /></OpsCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {flows.map((f) => {
            const abaixo = f.rate < f.benchmark
            const worst = f.worstClients[0]
            return (
              <div
                key={f.title}
                className="rounded-[10px] border bg-[var(--ops-card)] border-[var(--ops-border)] p-[18px]"
              >
                <div className="text-[12px] font-semibold text-[var(--ops-title)]">{f.title}</div>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span
                    className={cn(
                      "text-[21px] font-semibold tabular-nums",
                      abaixo ? "text-[var(--ops-neg)]" : "text-[var(--ops-pos)]",
                    )}
                  >
                    {fmtPct(f.rate)}
                  </span>
                  <span className="text-[10.5px] text-[var(--ops-mut)] tabular-nums">
                    bench {f.benchmark}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded overflow-hidden bg-[var(--ops-track)]">
                  <div
                    className={cn("h-full rounded", abaixo ? "bg-[var(--ops-neg)]" : "bg-[var(--ops-pos)]")}
                    style={{ width: `${Math.min(100, (f.rate / f.benchmark) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[11px]">
                  <span className="text-[var(--ops-sec)] tabular-nums">
                    {f.revenueBRL != null ? fmtBRLCompact(f.revenueBRL) : f.revenue}
                  </span>
                  {worst && (
                    <span className="text-[var(--ops-mut)] truncate ml-2">
                      pior:{" "}
                      <span className="text-[var(--ops-neg)] font-medium">
                        {worst.name} · {fmtPct(worst.value)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Onboarding ──────────────────────────────────────────────────────

export function OnboardingCard({ className }: { className?: string }) {
  const { data } = useSWR<OnboardingSummaryData>("/api/dashboard/onboarding-summary", fetchJson, SWR_OPTS)

  return (
    <OpsCard
      className={className}
      title="Onboarding"
      hint={data ? `${data.in_progress} em andamento` : undefined}
      right={
        <a href="/admin/onboarding" className="text-[11.5px] font-medium text-[var(--ops-sec)] hover:text-[var(--ops-title)]">
          Ver board
        </a>
      }
    >
      {!data ? (
        <CollectingState label="Carregando onboarding…" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                ["Em andamento", String(data.in_progress), false],
                ["Tempo médio", data.avg_days != null ? `${data.avg_days}d` : "—", false],
                ["Concluídos (30d)", String(data.completed_30d), false],
                ["Atrasados (SLA)", String(data.overdue), true],
              ] as Array<[string, string, boolean]>
            ).map(([label, value, neg]) => (
              <div key={label}>
                <div
                  className={cn(
                    "text-[18px] font-semibold tabular-nums",
                    neg && data.overdue > 0 ? "text-[var(--ops-neg)]" : "text-[var(--ops-title)]",
                  )}
                >
                  {value}
                </div>
                <div className="text-[10.5px] text-[var(--ops-sec)]">{label}</div>
              </div>
            ))}
          </div>
          {data.in_progress > 0 && (
            <>
              <div className="flex h-[9px] rounded-[5px] overflow-hidden gap-px mt-3">
                {data.phases
                  .filter((p) => p.count > 0)
                  .map((p, i) => (
                    <div
                      key={p.id}
                      title={`${p.name}: ${p.count}`}
                      style={{
                        width: `${(p.count / data.in_progress) * 100}%`,
                        background: p.color || PHASE_FALLBACK_COLORS[i % PHASE_FALLBACK_COLORS.length],
                      }}
                    />
                  ))}
              </div>
              <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-2">
                {data.phases.map((p, i) => (
                  <span key={p.id} className="flex items-center gap-1.5 text-[10.5px] text-[var(--ops-sec)]">
                    <span
                      className="w-[7px] h-[7px] rounded-sm"
                      style={{ background: p.color || PHASE_FALLBACK_COLORS[i % PHASE_FALLBACK_COLORS.length] }}
                    />
                    {p.name} <strong className="text-[var(--ops-title)] tabular-nums">{p.count}</strong>
                  </span>
                ))}
              </div>
            </>
          )}
          {data.oldest.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-[var(--ops-border)]">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)] mb-1.5">
                Mais antigos na fase
              </div>
              {data.oldest.map((o, i) => (
                <div
                  key={o.id}
                  className={cn(
                    "flex items-center gap-2.5 py-1.5",
                    i < data.oldest.length - 1 && "border-b border-[var(--ops-border)]",
                  )}
                >
                  <span className="flex-1 text-[12.5px] font-medium text-[var(--ops-title)] truncate">
                    {o.store_name}
                  </span>
                  <span className="text-[11.5px] text-[var(--ops-sec)]">{o.phase}</span>
                  <span className="w-10 text-right text-[11.5px] font-semibold text-[var(--ops-neg)] tabular-nums">
                    {o.days_in_phase}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </OpsCard>
  )
}

// ── Saúde da carteira (barra 4 faixas) ──────────────────────────────

export function PortfolioHealthCard({ cs }: { cs?: CsDashboardData }) {
  const dist = cs?.health_distribution
  const total = dist ? dist.healthy + dist.warning + dist.critical + dist.no_score : 0
  const bands = dist
    ? ([
        ["Saudável (≥70)", dist.healthy, "var(--ops-pos)"],
        ["Atenção (50–69)", dist.warning, "var(--ops-warn)"],
        ["Crítico (<50)", dist.critical, "var(--ops-neg)"],
        ["Sem score", dist.no_score, "var(--ops-mut)"],
      ] as Array<[string, number, string]>)
    : []

  return (
    <OpsCard title="Saúde da carteira" hint={cs ? `${total} lojas ativas` : undefined}>
      {!dist ? (
        <CollectingState label="Carregando distribuição…" />
      ) : total === 0 ? (
        <CollectingState label="Nenhuma loja ativa." />
      ) : (
        <>
          <div className="flex h-[11px] rounded-md overflow-hidden gap-0.5">
            {bands
              .filter(([, n]) => n > 0)
              .map(([k, n, c]) => (
                <div
                  key={k}
                  title={`${k}: ${n}`}
                  className="rounded-[3px]"
                  style={{ width: `${(n / total) * 100}%`, background: c }}
                />
              ))}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2.5">
            {bands.map(([k, n, c]) => (
              <span key={k} className="flex items-center gap-1.5 text-[11.5px] text-[var(--ops-sec)]">
                <span className="w-2 h-2 rounded-sm" style={{ background: c }} />
                {k} <strong className="text-[var(--ops-title)] tabular-nums">{n}</strong>
              </span>
            ))}
          </div>
        </>
      )}
    </OpsCard>
  )
}

// ── Cards CS abertos ────────────────────────────────────────────────

export function CsCardsCard({ cs }: { cs?: CsDashboardData }) {
  const pipelines = cs?.by_pipeline ?? []
  return (
    <OpsCard title="Cards CS abertos" hint="por pipeline de cadência">
      {!cs ? (
        <CollectingState label="Carregando pipelines de CS…" />
      ) : pipelines.length === 0 ? (
        <CollectingState label="Nenhum pipeline de CS configurado." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {pipelines.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-[7px] border border-[var(--ops-border)] bg-[var(--ops-tile)] px-3 py-2"
            >
              <span className="text-[11px] text-[var(--ops-text)] truncate">{p.name}</span>
              <span className="text-[13px] font-semibold text-[var(--ops-title)] tabular-nums ml-2">
                {p.open_count}
              </span>
            </div>
          ))}
        </div>
      )}
    </OpsCard>
  )
}

// ── Alertas ─────────────────────────────────────────────────────────

const SEV_META = {
  critical: { label: "crítico", cls: "text-[var(--ops-neg)] bg-[var(--ops-neg)]/10" },
  warning: { label: "atenção", cls: "text-[var(--ops-warn)] bg-[var(--ops-warn-bg)]" },
  info: { label: "aviso", cls: "text-[var(--ops-sec)] bg-[var(--ops-tile)]" },
} as const

export function AlertsCard({ className }: { className?: string }) {
  const { data } = useSWR<AlertsData>("/api/stores/alerts?status=active&limit=8", fetchJson, SWR_OPTS)
  const alerts = data?.alerts ?? []
  const criticalCount = alerts.filter((a) => a.severity === "critical").length

  return (
    <OpsCard
      className={className}
      title="Alertas"
      hint={data ? (criticalCount > 0 ? `${criticalCount} crítico${criticalCount > 1 ? "s" : ""}` : "nenhum crítico") : undefined}
      noPad
    >
      {!data ? (
        <CollectingState label="Carregando alertas…" />
      ) : alerts.length === 0 ? (
        <CollectingState label="Nenhum alerta ativo — carteira tranquila." />
      ) : (
        <div className="px-2.5 py-1.5">
          {alerts.map((a, i) => {
            const sev = SEV_META[a.severity] ?? SEV_META.info
            return (
              <div
                key={a.id}
                className={cn(
                  "flex gap-2.5 px-2.5 py-2",
                  i < alerts.length - 1 && "border-b border-[var(--ops-border)]",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 h-fit mt-px rounded-[5px] px-[7px] py-0.5 text-[9.5px] font-bold uppercase tracking-[0.03em]",
                    sev.cls,
                  )}
                >
                  {sev.label}
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-[var(--ops-title)]">{a.title}</div>
                  <div className="text-[11.5px] text-[var(--ops-sec)] leading-[1.45] mt-px">
                    {a.store_name ? `${a.store_name} — ` : ""}
                    {a.message}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </OpsCard>
  )
}

// ── Clientes por Receita ────────────────────────────────────────────

interface ClientAgg {
  name: string
  revenue: number
  delivered: number
  openW: number
  clickW: number
  bestScore: number | null
  trend: "up" | "down" | null
}

function statusFromScore(score: number | null): { label: string; cls: string } {
  if (score == null) return { label: "Sem score", cls: "text-[var(--ops-mut)] border-[var(--ops-border)]" }
  if (score >= 70) return { label: "● Ativo", cls: "text-[var(--ops-pos)] border-[var(--ops-pos)]/30 bg-[var(--ops-pos)]/10" }
  if (score >= 50) return { label: "● Atenção", cls: "text-[var(--ops-warn)] border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)]" }
  return { label: "● Crítico", cls: "text-[var(--ops-neg)] border-[var(--ops-neg)]/30 bg-[var(--ops-neg)]/10" }
}

export function ClientsRevenueTable({ className, q }: { className?: string; q: string }) {
  const { data } = useSWR<{ stores: StoreOverviewRow[] }>(
    `/api/dashboard/stores-overview?${q}`,
    fetchJson,
    SWR_OPTS,
  )

  // Agrega por CLIENTE (multi-loja consolida): receita soma, taxas
  // ponderadas por envios, trend/score da loja de maior receita.
  const clients: ClientAgg[] = (() => {
    if (!data) return []
    const byClient = new Map<string, ClientAgg & { topRevenue: number }>()
    for (const s of data.stores) {
      const key = s.clientName || s.storeName
      const cur = byClient.get(key) ?? {
        name: key,
        revenue: 0,
        delivered: 0,
        openW: 0,
        clickW: 0,
        bestScore: null,
        trend: null,
        topRevenue: -1,
      }
      cur.revenue += s.totalRevenueBRL
      cur.delivered += s.campaigns.envios
      cur.openW += s.campaigns.openRate * s.campaigns.envios
      cur.clickW += s.campaigns.clickRate * s.campaigns.envios
      if (s.healthScore != null && (cur.bestScore == null || s.healthScore > cur.bestScore)) {
        cur.bestScore = s.healthScore
      }
      if (s.totalRevenueBRL > cur.topRevenue) {
        cur.topRevenue = s.totalRevenueBRL
        cur.trend = s.trend
      }
      byClient.set(key, cur)
    }
    return [...byClient.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  })()

  const totalClients = data ? new Set(data.stores.map((s) => s.clientName || s.storeName)).size : 0

  return (
    <OpsCard
      className={className}
      title="Clientes por Receita"
      hint={data ? `1–${clients.length} de ${totalClients}` : undefined}
      right={
        <a href="/admin/clients" className="text-[11.5px] font-medium text-[var(--ops-sec)] hover:text-[var(--ops-title)]">
          Ver todos
        </a>
      }
      noPad
    >
      {!data ? (
        <CollectingState label="Carregando clientes…" />
      ) : clients.length === 0 ? (
        <CollectingState label="Nenhum cliente com receita no período." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th right>Receita</Th>
                <Th right>Open rate</Th>
                <Th right>Click rate</Th>
                <Th right>Trend</Th>
                <Th right>Status</Th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c, i) => {
                const last = i === clients.length - 1
                const open = c.delivered > 0 ? c.openW / c.delivered : 0
                const click = c.delivered > 0 ? c.clickW / c.delivered : 0
                const status = statusFromScore(c.bestScore)
                return (
                  <tr key={c.name}>
                    <Td last={last} className="font-semibold text-[var(--ops-title)]">{c.name}</Td>
                    <Td right last={last}>{fmtBRLFull(c.revenue)}</Td>
                    <Td
                      right
                      last={last}
                      className={cn(open > 0 && open < 10 && "text-[var(--ops-neg)]")}
                    >
                      {c.delivered > 0 ? fmtPct(open) : "—"}
                    </Td>
                    <Td right last={last}>{c.delivered > 0 ? fmtPct(click) : "—"}</Td>
                    <Td right last={last}>
                      {c.trend === "up" ? (
                        <span className="text-[var(--ops-pos)] text-[14px]">↗</span>
                      ) : c.trend === "down" ? (
                        <span className="text-[var(--ops-neg)] text-[14px]">↘</span>
                      ) : (
                        <span className="text-[var(--ops-mut)]">—</span>
                      )}
                    </Td>
                    <Td right last={last}>
                      <span
                        className={cn(
                          "inline-block rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold",
                          status.cls,
                        )}
                      >
                        {status.label}
                      </span>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </OpsCard>
  )
}
