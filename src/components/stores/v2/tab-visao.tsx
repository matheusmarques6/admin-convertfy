"use client"

/**
 * Aba Visão Geral — redesign 2026-05 matching prototype.
 *
 * Layout: grid main + sidebar 320px.
 *
 * Main:
 *  - Alertas (derivados de estado real: integracoes, briefing, eventos)
 *  - Performance · últimos 30 dias · KPIs compactos + mini chart de
 *    receita atribuída diária (agregada de campanhas + flows)
 *  - Atividade recente (5 últimos eventos via store_activity)
 *
 * Sidebar:
 *  - Saúde da loja · score 0-100 + dimensões reais (email/revenue/
 *    tickets/nps + setup completo + adoção de canal derivados)
 *  - Próximos eventos (CS calendar)
 *  - Integrações · cards com monograma + status real
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  AlertTriangle, Info, ArrowRight, Bell, Zap, Package,
  Calendar, Mail, Target, CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Range = "7d" | "30d" | "90d" | "1A"

interface Activity {
  id: string
  kind: string
  title: string
  summary: string | null
  occurred_at: string
  author?: { name: string } | null
}

interface CsEvent {
  id: string
  kind: string
  title: string
  scheduled_at: string
  attendees?: string[] | null
  notes?: string | null
}

interface IntegrationStatus {
  connected: boolean
  status?: string
}

interface CampaignRow {
  id: string
  name: string
  status: string
  sendTime: string | null
  recipients: number
  delivered?: number
  opened: number
  openRate: number
  clicked: number
  clickRate: number
  revenue: number
}

interface FlowRow {
  id: string
  name: string
  status: string
  recipients: number
  delivered?: number
  opened: number
  openRate: number
  clickRate: number
  revenue: number
}

interface EmailReport {
  account?: { currency?: string }
  platform?: "klaviyo" | "omnisend"
  revenue?: {
    storeRevenue?: number
    storeOrders?: number
    campaignRevenue?: number
    flowRevenue?: number
    klaviyoAttributedRevenue?: number
    totalRevenue?: number
    klaviyoAttributedOrders?: number
  }
  emailPerformance?: {
    delivered?: number
    openRate?: number
    clickRate?: number
    clickToOpenRate?: number
  }
}

interface StoreWithHealth {
  health_score?: number | null
  total_leads?: number | null
  engaged_leads?: number | null
}

interface HealthHistoryRow {
  health_score: number
  components: {
    email?: number
    revenue?: number
    tickets?: number
    nps?: number
  } | null
  created_at: string
}

const KIND_LABELS: Record<string, { label: string; color: string; Icon: typeof Mail }> = {
  feedback: { label: "Feedback", color: "#4E62D8", Icon: Mail },
  teste: { label: "Teste A/B", color: "#A855F7", Icon: Target },
  otim: { label: "Otimização", color: "#F59E0B", Icon: Zap },
  entrega: { label: "Entrega", color: "#10B981", Icon: Package },
  integracao: { label: "Integração", color: "#6B7280", Icon: CheckCircle2 },
  call: { label: "Call", color: "#3B82F6", Icon: Calendar },
  outro: { label: "Outro", color: "#9CA3AF", Icon: Bell },
}

const MONTH_ABBR = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]

const INTEGRATIONS: Array<{
  key: string
  name: string
  monogram: string
  color: string
}> = [
  { key: "shopify", name: "Shopify", monogram: "S", color: "#10B981" },
  { key: "klaviyo", name: "Klaviyo", monogram: "K", color: "#1F1F1F" },
  { key: "omnisend", name: "Omnisend", monogram: "O", color: "#1F1F1F" },
  { key: "ga4", name: "Google Analytics (GA4)", monogram: "G", color: "#F59E0B" },
  { key: "meta", name: "Meta Ads", monogram: "M", color: "#3B82F6" },
  { key: "google_ads", name: "Google Ads", monogram: "G", color: "#EA4335" },
]

const BENCHMARKS = { openRate: 0.173, ctor: 0.041 }

function rangeDays(r: Range): number {
  return r === "7d" ? 7 : r === "30d" ? 30 : r === "90d" ? 90 : 365
}

function fmtCurrency(value: number, currency: string, opts?: { compact?: boolean }): string {
  if (!isFinite(value) || value === 0) return currency === "BRL" ? "R$ 0" : `${currency} 0`
  if (opts?.compact) {
    if (value >= 1_000_000) {
      return `${currency === "BRL" ? "R$" : currency} ${(value / 1_000_000).toFixed(2).replace(".", ",")} mi`
    }
    if (value >= 10_000) {
      return `${currency === "BRL" ? "R$" : currency} ${(value / 1_000).toFixed(1).replace(".", ",")} mil`
    }
  }
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return `${currency} ${value.toLocaleString("pt-BR")}`
  }
}

function fmtDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0")
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  return `${day}/${mo}`
}

// ─── Component ──────────────────────────────────────────

export function TabVisao({ storeId }: { storeId: string }) {
  const [range, setRange] = useState<Range>("30d")

  // Integrações reais
  const { data: credData } = useSWR(
    `/api/client-stores/credentials?store_id=${storeId}`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const status = useMemo(
    () => (credData?.status ?? {}) as Record<string, IntegrationStatus>,
    [credData],
  )
  const emailPlatformConnected = !!status.klaviyo?.connected || !!status.omnisend?.connected
  const shopifyConnected = !!status.shopify?.connected

  // Briefing
  const { data: briefingData } = useSWR(
    `/api/onboarding/store-briefing?store_id=${storeId}`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const hasBriefing = !!briefingData?.briefing

  // Store data (com health_score, total_leads, engaged_leads)
  const { data: storeRes } = useSWR<{ store?: StoreWithHealth }>(
    `/api/client-stores/${storeId}`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const store = useMemo(() => (storeRes?.store ?? {}) as StoreWithHealth, [storeRes])

  // Health history (mais recente pra componentes)
  const { data: healthHist } = useSWR<{ history?: HealthHistoryRow[] }>(
    `/api/admin/stores/${storeId}/health-history?limit=2`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const latestHealth = healthHist?.history?.[0] ?? null
  const prevHealth = healthHist?.history?.[1] ?? null

  // Email platform report (KPIs + receita atribuída)
  const { data: report } = useSWR<EmailReport>(
    emailPlatformConnected ? `/api/integrations/email-platform/report?store_id=${storeId}&period=${range}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: campaignsRaw } = useSWR<{ campaigns: CampaignRow[]; currency?: string }>(
    emailPlatformConnected ? `/api/integrations/email-platform/campaigns?store_id=${storeId}&period=${range}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: flowsRaw } = useSWR<{ flows: FlowRow[]; currency?: string }>(
    emailPlatformConnected ? `/api/integrations/email-platform/flows?store_id=${storeId}&period=${range}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  // Atividade recente
  const { data: activityRes } = useSWR<{ items?: Activity[] }>(
    `/api/admin/stores/${storeId}/activity?limit=5`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const activities = useMemo(() => (activityRes?.items ?? []) as Activity[], [activityRes])

  // Eventos
  const { data: eventsRes } = useSWR<{ events?: CsEvent[] }>(
    `/api/admin/stores/${storeId}/events?upcoming=true`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const events = useMemo(() => (eventsRes?.events ?? []) as CsEvent[], [eventsRes])

  const currency = report?.account?.currency ?? "BRL"

  // ─── Alertas derivados ───
  const alerts = useMemo(() => {
    const arr: Array<{
      kind: "warn" | "info" | "pos"
      title: string
      detail: string
      ctaLabel: string
      href?: string
      Icon: typeof Bell
    }> = []

    // Feedback agendado mais próximo
    const nextFeedback = events.find((e) => e.kind.startsWith("feedback"))
    if (nextFeedback) {
      const dt = new Date(nextFeedback.scheduled_at)
      arr.push({
        kind: "warn",
        title: "Feedback semanal — agendar",
        detail: `Próxima reunião em ${dt.toLocaleDateString("pt-BR")}. Confirme com antecedência.`,
        ctaLabel: "Agendar",
        href: `/admin/stores/${storeId}?tab=atividade`,
        Icon: Bell,
      })
    }

    if (!shopifyConnected) {
      arr.push({
        kind: "info",
        title: "Shopify não conectado",
        detail: "Sem Shopify a receita total da loja não é capturada. Conecte para destravar atribuição completa.",
        ctaLabel: "Conectar Shopify",
        href: `/admin/stores/${storeId}?tab=setup`,
        Icon: Info,
      })
    }
    if (!emailPlatformConnected) {
      arr.push({
        kind: "warn",
        title: "Sem plataforma de email",
        detail: "Conecte Klaviyo ou Omnisend para Performance e Relatório funcionarem.",
        ctaLabel: "Conectar email",
        href: `/admin/stores/${storeId}?tab=setup`,
        Icon: AlertTriangle,
      })
    }
    if (!hasBriefing) {
      arr.push({
        kind: "info",
        title: "Briefing não gerado",
        detail: "Preencha o formulário de onboarding para gerar o briefing automaticamente.",
        ctaLabel: "Abrir briefing",
        href: `/admin/stores/${storeId}?tab=contexto#briefing-completo`,
        Icon: Info,
      })
    }

    // Última entrega como vitória
    const lastDelivery = activities.find((a) => a.kind === "entrega")
    if (lastDelivery) {
      arr.push({
        kind: "pos",
        title: lastDelivery.title,
        detail: lastDelivery.summary ?? "Entrega concluída.",
        ctaLabel: "Ver entrega",
        href: `/admin/stores/${storeId}?tab=atividade`,
        Icon: Package,
      })
    }

    return arr.slice(0, 4)
  }, [activities, events, emailPlatformConnected, shopifyConnected, hasBriefing, storeId])

  // ─── Performance KPIs ───
  const perf = useMemo(() => {
    const rv = report?.revenue ?? {}
    const ep = report?.emailPerformance ?? {}
    const attributed = Number(rv.klaviyoAttributedRevenue ?? rv.totalRevenue ?? 0)
    const totalRevenue = Number(rv.storeRevenue ?? 0)
    const pct = totalRevenue > 0 ? attributed / totalRevenue : 0
    const emailSmsTotal = attributed
    const orders = Number(rv.klaviyoAttributedOrders ?? 0)
    return {
      attributed,
      attributedPct: pct,
      emailSmsTotal,
      attributedOrders: orders,
      openRate: Number(ep.openRate ?? 0),
      ctor: Number(ep.clickToOpenRate ?? 0),
    }
  }, [report])

  // ─── Daily revenue series ───
  // Bin campanhas pelo sendTime. Flows nao tem sendTime (sao continuos),
  // entao distribuimos uniformemente no periodo.
  const dailySeries = useMemo(() => {
    const days = rangeDays(range)
    const buckets: Array<{ date: Date; value: number }> = []
    const now = new Date()
    now.setHours(23, 59, 59, 999)
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      d.setHours(0, 0, 0, 0)
      buckets.push({ date: d, value: 0 })
    }
    const firstDay = buckets[0].date.getTime()
    const lastDay = buckets[buckets.length - 1].date.getTime()

    // Bin campanhas
    for (const c of (campaignsRaw?.campaigns ?? [])) {
      if (!c.sendTime || !c.revenue) continue
      const t = new Date(c.sendTime).getTime()
      if (!isFinite(t) || t < firstDay || t > lastDay + 24 * 60 * 60 * 1000) continue
      const idx = Math.floor((t - firstDay) / (24 * 60 * 60 * 1000))
      if (idx >= 0 && idx < buckets.length) {
        buckets[idx].value += c.revenue
      }
    }

    // Distribui flow revenue uniforme
    const flowTotal = (flowsRaw?.flows ?? []).reduce((s, f) => s + (f.revenue || 0), 0)
    const flowDaily = flowTotal / days
    for (const b of buckets) b.value += flowDaily

    return buckets
  }, [range, campaignsRaw, flowsRaw])

  // ─── Saúde dimensões ───
  const healthScore = store?.health_score ?? latestHealth?.health_score ?? null
  const prevScore = prevHealth?.health_score ?? null
  const scoreDelta = healthScore != null && prevScore != null ? healthScore - prevScore : null
  const scoreLabel =
    healthScore == null ? "—" : healthScore >= 80 ? "Boa" : healthScore >= 60 ? "Atenção" : "Crítica"

  const healthDimensions = useMemo(() => {
    const c = latestHealth?.components ?? {}
    const totalLeads = Number(store.total_leads ?? 0)
    const engagedLeads = Number(store.engaged_leads ?? 0)

    // Engajamento de envio = component email do health snapshot
    const engEnvio = Number(c.email ?? 0)
    // Crescimento de lista = engaged_leads / total_leads (proxy)
    const cresList = totalLeads > 0 ? Math.round((engagedLeads / totalLeads) * 100) : 0
    // Receita vs meta = component revenue
    const receitaMeta = Number(c.revenue ?? 0)
    // Adoção de canal = email + sms ativos / 3 possíveis (email, sms, push)
    const channelsActive =
      (emailPlatformConnected ? 1 : 0) +
      (status.klaviyo?.connected || status.omnisend?.connected ? 0 : 0) // SMS detection seria avancado
    // simplificacao: se so email entao 1 de 3 = 33%
    const channelAdoption = Math.round((channelsActive / 3) * 100)
    // Setup completo = integracoes conectadas / 6
    const totalIntegrations = INTEGRATIONS.length
    const configured = INTEGRATIONS.filter((i) => status[i.key]?.connected).length
    const setupCompleto = Math.round((configured / totalIntegrations) * 100)

    return [
      { label: "Engajamento de envio", value: engEnvio, sub: null as string | null },
      { label: "Crescimento de lista", value: cresList, sub: null },
      { label: "Receita vs meta", value: receitaMeta, sub: null },
      { label: "Adoção de canal", value: channelAdoption, sub: status.klaviyo?.connected || status.omnisend?.connected ? "SMS/Push não ativo" : null },
      { label: "Setup completo", value: setupCompleto, sub: `${configured} de ${totalIntegrations} integrações` },
    ]
  }, [latestHealth, store, status, emailPlatformConnected])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      {/* ───── MAIN ───── */}
      <div className="flex flex-col gap-4">
        {/* Alertas */}
        <Card
          title="Alertas"
          subtitle="Itens que merecem ação agora"
          linkLabel="Ver todos"
          linkHref={`/admin/stores/${storeId}?tab=atividade`}
        >
          {alerts.length === 0 ? (
            <div className="py-4 text-center text-[12px] text-slate-400 italic">
              Sem alertas no momento
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {alerts.map((a, i) => (
                <AlertRow key={i} {...a} />
              ))}
            </div>
          )}
        </Card>

        {/* Performance · últimos 30 dias */}
        <Card
          title={`Performance · ${range === "1A" ? "últimos 12 meses" : `últimos ${rangeDays(range)} dias`}`}
          meta={
            <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md">
              {(["7d", "30d", "90d", "1A"] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    "px-2.5 py-1 rounded text-[11.5px] font-semibold transition-colors",
                    range === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          }
        >
          {!emailPlatformConnected ? (
            <div className="py-6 text-center text-[12px] text-slate-400 italic">
              Conecte Klaviyo ou Omnisend em Setup para ver os KPIs.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <PerfKpi
                  label="Receita Convertfy"
                  value={fmtCurrency(perf.attributed, currency, { compact: true })}
                  sub={`${(perf.attributedPct * 100).toFixed(1).replace(".", ",")}% do faturamento`}
                  highlight
                />
                <PerfKpi
                  label="Email + SMS"
                  value={fmtCurrency(perf.emailSmsTotal, currency, { compact: true })}
                  sub={`${perf.attributedOrders.toLocaleString("pt-BR")} pedidos`}
                />
                <PerfKpi
                  label="Open rate"
                  value={`${(perf.openRate * 100).toFixed(1).replace(".", ",")}%`}
                  sub={`vs ${(BENCHMARKS.openRate * 100).toFixed(1).replace(".", ",")}% benchmark`}
                  tone={perf.openRate > BENCHMARKS.openRate ? "pos" : "neutral"}
                />
                <PerfKpi
                  label="CTOR"
                  value={`${(perf.ctor * 100).toFixed(2).replace(".", ",")}%`}
                  sub={`vs ${(BENCHMARKS.ctor * 100).toFixed(1).replace(".", ",")}% benchmark`}
                  tone={perf.ctor > BENCHMARKS.ctor ? "pos" : "neutral"}
                />
              </div>
              {/* Mini chart */}
              <div className="bg-slate-50 rounded-md p-3 border" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-[10.5px] font-semibold text-slate-500">Receita atribuída diária</span>
                  <span className="text-[10.5px] text-slate-400 font-mono">
                    {fmtDate(dailySeries[0]?.date ?? new Date())} — {fmtDate(dailySeries[dailySeries.length - 1]?.date ?? new Date())}
                  </span>
                </div>
                <RevenueChart data={dailySeries} />
              </div>
            </>
          )}
        </Card>

        {/* Atividade recente */}
        <Card
          title="Atividade recente"
          subtitle="Últimos eventos relevantes da loja"
          linkLabel="Abrir Atividade →"
          linkHref={`/admin/stores/${storeId}?tab=atividade`}
        >
          {activities.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-slate-400 italic">
              Nenhuma atividade registrada ainda
            </div>
          ) : (
            <div className="flex flex-col">
              {activities.map((a) => {
                const cfg = KIND_LABELS[a.kind] ?? KIND_LABELS.outro
                const Icon = cfg.Icon
                return (
                  <div
                    key={a.id}
                    className="grid grid-cols-[36px_1fr_auto] gap-2 py-3 border-b last:border-b-0 items-start"
                    style={{ borderColor: "rgba(0,0,0,0.04)" }}
                  >
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: `${cfg.color}1A` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-slate-900 leading-tight">
                        {a.title}
                      </div>
                      {a.summary && (
                        <div className="text-[11.5px] text-slate-500 mt-1 leading-snug line-clamp-2">
                          {a.summary}
                        </div>
                      )}
                    </div>
                    <div className="text-[10.5px] text-slate-400 font-mono shrink-0 pt-1">
                      {new Date(a.occurred_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ───── SIDEBAR ───── */}
      <div className="flex flex-col gap-4">
        {/* Saúde da loja */}
        <Card title="Saúde da loja">
          {healthScore == null ? (
            <div className="py-4 text-center text-[12px] text-slate-400 italic">
              Saúde sendo calculada...
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3.5">
                <HealthDonut score={healthScore} />
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">SAÚDE</div>
                  <div className="text-[14px] font-bold text-slate-900 leading-tight">{scoreLabel}</div>
                  <div className="text-[16px] font-bold text-slate-900 tabular-nums leading-none mt-1">
                    {healthScore}<span className="text-[12px] text-slate-400 font-medium"> / 100</span>
                  </div>
                  {scoreDelta != null && (
                    <div className={cn("text-[10.5px] font-medium mt-0.5", scoreDelta >= 0 ? "text-emerald-600" : "text-red-600")}>
                      {scoreLabel} · {scoreDelta >= 0 ? "+" : ""}{scoreDelta} vs mês passado
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                {healthDimensions.map((d) => (
                  <DimensionBar key={d.label} {...d} />
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Próximos eventos */}
        <Card title="Próximos eventos">
          {events.length === 0 ? (
            <div className="py-3 text-center text-[12px] text-slate-400 italic">
              Sem eventos agendados
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {events.slice(0, 3).map((e) => {
                const d = new Date(e.scheduled_at)
                return (
                  <div key={e.id} className="flex items-start gap-2.5">
                    <div className="flex flex-col items-center bg-brand-50 text-brand-700 rounded-md px-2 py-1.5 min-w-[44px] shrink-0">
                      <span className="text-[9px] font-bold uppercase tracking-wider">
                        {MONTH_ABBR[d.getMonth()]}
                      </span>
                      <span className="text-[15px] font-bold leading-none tabular-nums">
                        {d.getDate()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-slate-900 leading-tight">
                        {e.title}
                      </div>
                      <div className="text-[10.5px] text-slate-500 font-mono">
                        {d.toLocaleDateString("pt-BR")} · {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      {e.attendees && e.attendees.length > 0 && (
                        <div className="text-[10.5px] text-slate-500 mt-0.5 truncate">
                          {e.attendees.join(" · ")}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Integrações */}
        <IntegracoesCard storeId={storeId} status={status} />
      </div>
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────────

function Card({
  title, subtitle, children, linkLabel, linkHref, meta,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  linkLabel?: string
  linkHref?: string
  meta?: React.ReactNode
}) {
  return (
    <div className="bg-white border rounded-[10px] p-4" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold text-slate-900 m-0 leading-tight">{title}</h3>
          {subtitle && (
            <p className="text-[11.5px] text-slate-500 mt-0.5 m-0">{subtitle}</p>
          )}
        </div>
        {meta || (linkLabel && linkHref && (
          <a href={linkHref} className="text-[11.5px] font-medium text-brand-600 hover:underline inline-flex items-center gap-0.5 shrink-0">
            {linkLabel}
          </a>
        ))}
      </div>
      {children}
    </div>
  )
}

function AlertRow({
  kind, title, detail, ctaLabel, href, Icon,
}: {
  kind: "warn" | "info" | "pos"
  title: string
  detail: string
  ctaLabel?: string
  href?: string
  Icon: typeof Bell
}) {
  const cfg =
    kind === "warn"
      ? { bg: "#FFFBEB", border: "#FDE68A", color: "#92400E", iconBg: "#FEF3C7" }
      : kind === "info"
        ? { bg: "#EFF6FF", border: "#BFDBFE", color: "#1D4ED8", iconBg: "#DBEAFE" }
        : { bg: "#F0FDF4", border: "#A7F3D0", color: "#065F46", iconBg: "#D1FAE5" }
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-md border"
      style={{ background: cfg.bg, borderColor: cfg.border }}
    >
      <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0" style={{ background: cfg.iconBg }}>
        <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold leading-tight" style={{ color: cfg.color }}>
          {title}
        </div>
        <div className="text-[11.5px] mt-0.5 leading-snug" style={{ color: cfg.color, opacity: 0.85 }}>
          {detail}
        </div>
      </div>
      {ctaLabel && href && (
        <a
          href={href}
          className="text-[11.5px] font-semibold whitespace-nowrap inline-flex items-center gap-1 shrink-0"
          style={{ color: cfg.color }}
        >
          {ctaLabel} <ArrowRight className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}

function PerfKpi({
  label, value, sub, tone, highlight,
}: {
  label: string
  value: string
  sub?: string
  tone?: "pos" | "neg" | "neutral"
  highlight?: boolean
}) {
  const valueColor = highlight
    ? "text-brand-600"
    : tone === "pos"
      ? "text-emerald-600"
      : tone === "neg"
        ? "text-red-600"
        : "text-slate-900"
  return (
    <div>
      <div className="text-[10.5px] font-semibold text-slate-500 mb-1">{label}</div>
      <div className={cn("text-[22px] font-bold tabular-nums leading-none mb-1", valueColor)}>{value}</div>
      {sub && <div className="text-[10.5px] text-slate-500">{sub}</div>}
    </div>
  )
}

function RevenueChart({ data }: { data: Array<{ date: Date; value: number }> }) {
  const W = 600
  const H = 90
  const PAD_X = 4
  const PAD_Y = 8
  const max = Math.max(...data.map((d) => d.value), 1)
  const stepX = data.length > 1 ? (W - 2 * PAD_X) / (data.length - 1) : 0
  const points = data.map((d, i) => {
    const x = PAD_X + i * stepX
    const y = H - PAD_Y - (d.value / max) * (H - 2 * PAD_Y)
    return { x, y, value: d.value }
  })

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
  const areaPath = `${linePath} L${points[points.length - 1]?.x.toFixed(1) ?? 0},${(H - PAD_Y).toFixed(1)} L${points[0]?.x.toFixed(1) ?? 0},${(H - PAD_Y).toFixed(1)} Z`

  if (max === 1) {
    return (
      <div className="h-[90px] flex items-center justify-center text-[11px] text-slate-400 italic">
        Sem receita atribuída no período
      </div>
    )
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: 90 }}>
      <defs>
        <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4E62D8" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#4E62D8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#rev-fill)" />
      <path d={linePath} stroke="#4E62D8" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function HealthDonut({ score }: { score: number }) {
  const SIZE = 56
  const RADIUS = 22
  const STROKE = 6
  const circumference = 2 * Math.PI * RADIUS
  const filled = (score / 100) * circumference
  const color = score >= 80 ? "#10B981" : score >= 60 ? "#F59E0B" : "#DC2626"
  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[14px] font-bold tabular-nums" style={{ color }}>
          {score}
        </span>
      </div>
    </div>
  )
}

function DimensionBar({ label, value, sub }: { label: string; value: number; sub?: string | null }) {
  const isLow = value < 60
  const color = value >= 75 ? "#10B981" : value >= 50 ? "#F59E0B" : "#DC2626"
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[11px] text-slate-600">{label}</span>
        <span className={cn("text-[11px] font-bold tabular-nums", isLow ? "text-amber-600" : "text-emerald-600")}>
          {value}%
        </span>
      </div>
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
        />
      </div>
      {sub && <div className="text-[9.5px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}

function IntegracoesCard({ storeId, status }: { storeId: string; status: Record<string, IntegrationStatus> }) {
  const configured = INTEGRATIONS.filter((i) => status[i.key]?.connected).length
  return (
    <Card
      title="Integrações"
      subtitle={`${configured} de ${INTEGRATIONS.length} configuradas`}
      linkLabel="Setup →"
      linkHref={`/admin/stores/${storeId}?tab=setup`}
    >
      <div className="flex flex-col gap-1.5">
        {INTEGRATIONS.map((i) => {
          const isConnected = !!status[i.key]?.connected
          return (
            <div
              key={i.key}
              className={cn(
                "flex items-center justify-between gap-2 px-2 py-1.5 rounded-md transition-colors",
                isConnected ? "bg-emerald-50/60" : "hover:bg-slate-50",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="h-6 w-6 rounded-md flex items-center justify-center text-white font-bold text-[11px] shrink-0"
                  style={{ background: i.color }}
                >
                  {i.monogram}
                </div>
                <span className="text-[12px] text-slate-700 truncate">{i.name}</span>
              </div>
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider shrink-0 inline-flex items-center gap-1",
                  isConnected ? "text-emerald-600" : "text-slate-400",
                )}
              >
                {isConnected && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                {isConnected ? "Conectado" : "Não configurado"}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

