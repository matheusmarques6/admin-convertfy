"use client"

/**
 * Tab: Visão Geral — mirror exato do prototype tab-visao.jsx.
 *
 * Grid 2-col: minmax(0,1fr) 360px.
 *
 * Left:
 *  - Section "Alertas" · "Ver todos" link · 3 Alert tones (warn/info/neut)
 *  - Section "Performance · últimos 30 dias" com RangePills · 4 Kpi
 *    (brand/default/pos/pos) + Trend SVG sparkline
 *  - Section "Atividade recente" · "Abrir Atividade →" + ActivityList compact
 *
 * Right:
 *  - Section "Saúde da loja" · HealthRing 56px + label + 5 HealthRow
 *  - Section "Próximos eventos" · NextEvent
 *  - Section "Integrações" · IntegRow (green tint quando connected)
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  Info, Bell, Package, Zap, Mail, Target, Link2, Phone,
  ChevronRight,
} from "lucide-react"
import { Section, Badge, C, ChannelIcon, TNUM } from "./_primitives"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Range = "7d" | "30d" | "90d" | "1A"

interface Activity {
  id: string
  kind: string
  title: string
  summary: string | null
  occurred_at: string
}

interface CsEvent {
  id: string
  kind: string
  title: string
  scheduled_at: string
  attendees?: string[] | null
}

interface IntegrationStatus { connected: boolean }

interface CampaignRow { id: string; sendTime: string | null; revenue: number; openRate: number }
interface FlowRow { id: string; revenue: number; openRate: number }

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
  components: { email?: number; revenue?: number; tickets?: number; nps?: number } | null
  created_at: string
}

const KIND_META: Record<string, { color: string; label: string; Icon: typeof Mail }> = {
  feedback: { color: C.brand, label: "Feedback", Icon: Mail },
  teste: { color: C.purple, label: "Teste A/B", Icon: Target },
  otim: { color: C.amber, label: "Otimização", Icon: Zap },
  entrega: { color: C.pos, label: "Entrega", Icon: Package },
  integracao: { color: C.g600, label: "Integração", Icon: Link2 },
  call: { color: C.brand, label: "Call", Icon: Phone },
  outro: { color: C.g500, label: "Outro", Icon: Bell },
}

const INTEGRATIONS = [
  { key: "shopify", name: "Shopify" },
  { key: "klaviyo", name: "Klaviyo" },
  { key: "omnisend", name: "Omnisend" },
  { key: "ga4", name: "Google Analytics (GA4)" },
  { key: "meta", name: "Meta Ads" },
  { key: "google_ads", name: "Google Ads" },
]

const BENCHMARKS = { openRate: 0.173, ctor: 0.041 }

function rangeDays(r: Range): number {
  return r === "7d" ? 7 : r === "30d" ? 30 : r === "90d" ? 90 : 365
}

function fmtCompact(value: number, currency = "BRL"): string {
  if (!isFinite(value) || value === 0) return "—"
  if (value >= 1_000_000) return `${currency === "BRL" ? "R$" : currency} ${(value / 1_000_000).toFixed(2).replace(".", ",")} mi`
  if (value >= 10_000) return `${currency === "BRL" ? "R$" : currency} ${(value / 1_000).toFixed(1).replace(".", ",")} mil`
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return `${currency} ${value.toLocaleString("pt-BR")}`
  }
}

export function TabVisao({ storeId }: { storeId: string }) {
  const [range, setRange] = useState<Range>("30d")

  const { data: credData } = useSWR(`/api/client-stores/credentials?store_id=${storeId}`, fetcher, { revalidateOnFocus: false })
  const status = useMemo(() => (credData?.status ?? {}) as Record<string, IntegrationStatus>, [credData])
  const emailPlatformConnected = !!status.klaviyo?.connected || !!status.omnisend?.connected
  const shopifyConnected = !!status.shopify?.connected

  const { data: briefingData } = useSWR(`/api/onboarding/store-briefing?store_id=${storeId}`, fetcher, { revalidateOnFocus: false })
  const hasBriefing = !!briefingData?.briefing

  const { data: storeRes } = useSWR<{ store?: StoreWithHealth }>(`/api/client-stores/${storeId}`, fetcher, { revalidateOnFocus: false })
  const store = useMemo(() => (storeRes?.store ?? {}) as StoreWithHealth, [storeRes])

  const { data: healthHist } = useSWR<{ history?: HealthHistoryRow[] }>(`/api/admin/stores/${storeId}/health-history?limit=2`, fetcher, { revalidateOnFocus: false })
  const latestHealth = healthHist?.history?.[0] ?? null
  const prevHealth = healthHist?.history?.[1] ?? null

  const { data: report } = useSWR<EmailReport>(
    emailPlatformConnected ? `/api/integrations/email-platform/report?store_id=${storeId}&period=${range}` : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  )
  const { data: campaignsRaw } = useSWR<{ campaigns: CampaignRow[] }>(
    emailPlatformConnected ? `/api/integrations/email-platform/campaigns?store_id=${storeId}&period=${range}` : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  )
  const { data: flowsRaw } = useSWR<{ flows: FlowRow[] }>(
    emailPlatformConnected ? `/api/integrations/email-platform/flows?store_id=${storeId}&period=${range}` : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  )

  const { data: activityRes } = useSWR<{ items?: Activity[] }>(`/api/admin/stores/${storeId}/activity?limit=5`, fetcher, { revalidateOnFocus: false })
  const activities = useMemo(() => (activityRes?.items ?? []) as Activity[], [activityRes])

  const { data: eventsRes } = useSWR<{ events?: CsEvent[] }>(`/api/admin/stores/${storeId}/events?upcoming=true`, fetcher, { revalidateOnFocus: false })
  const events = useMemo(() => (eventsRes?.events ?? []) as CsEvent[], [eventsRes])

  const currency = report?.account?.currency ?? "BRL"

  // ─── Alerts derivados ─────────────────────────────
  const alerts = useMemo(() => {
    const arr: Array<{
      tone: "warn" | "info" | "neut"
      Icon: typeof Bell
      title: string
      detail: string
      cta: string
      href: string
    }> = []
    const nextFb = events.find((e) => e.kind.startsWith("feedback"))
    if (nextFb) {
      const dt = new Date(nextFb.scheduled_at)
      arr.push({
        tone: "warn",
        Icon: Bell,
        title: "Feedback semanal — agendar",
        detail: `Próxima reunião em ${dt.toLocaleDateString("pt-BR")}. Confirme com antecedência.`,
        cta: "Agendar",
        href: `/admin/stores/${storeId}?tab=atividade`,
      })
    }
    if (!shopifyConnected) {
      arr.push({
        tone: "info",
        Icon: Zap,
        title: "Shopify não conectado",
        detail: emailPlatformConnected
          ? "A loja está em Omnisend/Klaviyo. Conecte o Shopify para destravar Receita atribuída completa."
          : "Sem Shopify a receita total da loja não é capturada. Conecte para destravar atribuição.",
        cta: "Conectar Shopify",
        href: `/admin/stores/${storeId}?tab=setup`,
      })
    }
    const lastDelivery = activities.find((a) => a.kind === "entrega")
    if (lastDelivery) {
      arr.push({
        tone: "neut",
        Icon: Package,
        title: lastDelivery.title,
        detail: lastDelivery.summary ?? "Entrega concluída.",
        cta: "Abrir Figma",
        href: `/admin/stores/${storeId}?tab=atividade`,
      })
    }
    if (!hasBriefing) {
      arr.push({
        tone: "info",
        Icon: Info,
        title: "Briefing não gerado",
        detail: "Preencha o formulário de onboarding para gerar o briefing automaticamente.",
        cta: "Abrir briefing",
        href: `/admin/stores/${storeId}?tab=contexto#briefing-completo`,
      })
    }
    return arr.slice(0, 4)
  }, [activities, events, emailPlatformConnected, shopifyConnected, hasBriefing, storeId])

  // ─── Performance KPIs ─────────────────────────────
  const perf = useMemo(() => {
    const rv = report?.revenue ?? {}
    const ep = report?.emailPerformance ?? {}
    const attributed = Number(rv.klaviyoAttributedRevenue ?? rv.totalRevenue ?? 0)
    const totalRevenue = Number(rv.storeRevenue ?? 0)
    const pct = totalRevenue > 0 ? attributed / totalRevenue : 0
    const orders = Number(rv.klaviyoAttributedOrders ?? 0)
    return {
      attributed,
      attributedPct: pct,
      attributedOrders: orders,
      openRate: Number(ep.openRate ?? 0),
      ctor: Number(ep.clickToOpenRate ?? 0),
    }
  }, [report])

  // ─── Daily revenue series ─────────────────────────
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
    const lastDay = buckets[buckets.length - 1].date.getTime() + 24 * 60 * 60 * 1000
    for (const c of campaignsRaw?.campaigns ?? []) {
      if (!c.sendTime || !c.revenue) continue
      const t = new Date(c.sendTime).getTime()
      if (!isFinite(t) || t < firstDay || t > lastDay) continue
      const idx = Math.floor((t - firstDay) / (24 * 60 * 60 * 1000))
      if (idx >= 0 && idx < buckets.length) buckets[idx].value += c.revenue
    }
    const flowTotal = (flowsRaw?.flows ?? []).reduce((s, f) => s + (f.revenue || 0), 0)
    const flowDaily = flowTotal / days
    for (const b of buckets) b.value += flowDaily
    return buckets
  }, [range, campaignsRaw, flowsRaw])

  // ─── Saúde dimensões ──────────────────────────────
  const healthScore = store?.health_score ?? latestHealth?.health_score ?? null
  const prevScore = prevHealth?.health_score ?? null
  const scoreDelta = healthScore != null && prevScore != null ? healthScore - prevScore : null
  const scoreLabel = healthScore == null ? "—" : healthScore >= 80 ? "Boa" : healthScore >= 60 ? "Atenção" : "Crítica"

  const dimensions = useMemo(() => {
    const c = latestHealth?.components ?? {}
    const totalLeads = Number(store.total_leads ?? 0)
    const engagedLeads = Number(store.engaged_leads ?? 0)
    const engEnvio = Number(c.email ?? 0)
    const cresList = totalLeads > 0 ? Math.round((engagedLeads / totalLeads) * 100) : 0
    const receitaMeta = Number(c.revenue ?? 0)
    const configured = INTEGRATIONS.filter((i) => status[i.key]?.connected).length
    const setupCompleto = Math.round((configured / INTEGRATIONS.length) * 100)
    const channelsActive = (status.klaviyo?.connected || status.omnisend?.connected ? 1 : 0)
    const channelAdoption = Math.round((channelsActive / 3) * 100)
    return [
      { label: "Engajamento de envio", pct: engEnvio, tone: engEnvio >= 75 ? "pos" : "warn" },
      { label: "Crescimento de lista", pct: cresList, tone: cresList >= 75 ? "pos" : "warn" },
      { label: "Receita vs meta", pct: receitaMeta, tone: receitaMeta >= 75 ? "pos" : "warn" },
      { label: "Adoção de canal", pct: channelAdoption, tone: channelAdoption >= 50 ? "pos" : "warn", detail: "SMS/Push não ativo" },
      { label: "Setup completo", pct: setupCompleto, tone: setupCompleto >= 75 ? "pos" : "warn", detail: `${configured} de ${INTEGRATIONS.length} integrações` },
    ] as const
  }, [latestHealth, store, status])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5">
      {/* LEFT */}
      <div>
        <Section
          title="Alertas"
          subtitle="Itens que merecem ação agora"
          right={
            <a
              href={`/admin/stores/${storeId}?tab=atividade`}
              className="text-[12px] hover:underline"
              style={{ color: C.brand }}
            >
              Ver todos
            </a>
          }
        >
          {alerts.length === 0 ? (
            <div className="py-4 text-center text-[12px] text-slate-400 italic">Sem alertas no momento</div>
          ) : (
            <div className="grid gap-2.5">
              {alerts.map((a, i) => (
                <Alert key={i} {...a} />
              ))}
            </div>
          )}
        </Section>

        <Section
          title={`Performance · ${range === "1A" ? "últimos 12 meses" : `últimos ${rangeDays(range)} dias`}`}
          right={<RangePills value={range} onChange={setRange} />}
        >
          {!emailPlatformConnected ? (
            <div className="py-6 text-center text-[12px] text-slate-400 italic">
              Conecte Klaviyo ou Omnisend em Setup para ver os KPIs.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <Kpi label="Receita Convertfy" value={fmtCompact(perf.attributed, currency)} sub={`${(perf.attributedPct * 100).toFixed(1).replace(".", ",")}% do faturamento`} tone="brand" />
                <Kpi label="Email + SMS" value={fmtCompact(perf.attributed, currency)} sub={`${perf.attributedOrders.toLocaleString("pt-BR")} pedidos`} tone="default" />
                <Kpi label="Open rate" value={`${(perf.openRate * 100).toFixed(1).replace(".", ",")}%`} sub={`vs ${(BENCHMARKS.openRate * 100).toFixed(1).replace(".", ",")}% benchmark`} tone={perf.openRate > BENCHMARKS.openRate ? "pos" : "default"} />
                <Kpi label="CTOR" value={`${(perf.ctor * 100).toFixed(2).replace(".", ",")}%`} sub={`vs ${(BENCHMARKS.ctor * 100).toFixed(1).replace(".", ",")}% benchmark`} tone={perf.ctor > BENCHMARKS.ctor ? "pos" : "default"} />
              </div>
              <Trend data={dailySeries} />
            </>
          )}
        </Section>

        <Section
          title="Atividade recente"
          subtitle="Últimos eventos relevantes da loja"
          right={
            <a
              href={`/admin/stores/${storeId}?tab=atividade`}
              className="text-[12px] hover:underline"
              style={{ color: C.brand }}
            >
              Abrir Atividade →
            </a>
          }
        >
          {activities.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-slate-400 italic">Nenhuma atividade registrada ainda</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {activities.map((a) => <ActivityItemCompact key={a.id} a={a} />)}
            </div>
          )}
        </Section>
      </div>

      {/* RIGHT */}
      <div>
        <Section title="Saúde da loja">
          {healthScore == null ? (
            <div className="py-3 text-center text-[12px] text-slate-400 italic">Saúde sendo calculada...</div>
          ) : (
            <>
              <div className="flex items-center gap-3.5 mb-2.5">
                <HealthDonut score={healthScore} />
                <div>
                  <div className="text-[24px] font-semibold text-slate-900 leading-none" style={TNUM}>
                    {healthScore} <span className="text-[14px] text-slate-400 font-normal">/ 100</span>
                  </div>
                  <div className="text-[12px] text-slate-500 mt-0.5">
                    {scoreLabel}
                    {scoreDelta != null && ` · ${scoreDelta >= 0 ? "+" : ""}${scoreDelta} vs mês passado`}
                  </div>
                </div>
              </div>
              <div className="grid gap-1.5 mt-1.5">
                {dimensions.map((d) => <HealthRow key={d.label} {...d} />)}
              </div>
            </>
          )}
        </Section>

        <Section title="Próximos eventos">
          {events.length === 0 ? (
            <div className="py-3 text-center text-[12px] text-slate-400 italic">Sem eventos agendados</div>
          ) : (
            <div className="flex flex-col gap-2">
              {events.slice(0, 3).map((e, i) => <NextEvent key={e.id} ev={e} tone={i === 0 ? "brand" : "neut"} />)}
            </div>
          )}
        </Section>

        <Section
          title="Integrações"
          subtitle={`${INTEGRATIONS.filter((i) => status[i.key]?.connected).length} de ${INTEGRATIONS.length} configuradas`}
          right={
            <a
              href={`/admin/stores/${storeId}?tab=setup`}
              className="text-[12px] hover:underline"
              style={{ color: C.brand }}
            >
              Setup →
            </a>
          }
        >
          <div className="grid gap-2">
            {INTEGRATIONS.map((i) => <IntegRow key={i.key} integ={{ key: i.key, name: i.name, connected: !!status[i.key]?.connected }} />)}
          </div>
        </Section>
      </div>
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────

function Kpi({ label, value, sub, tone = "default" }: {
  label: string
  value: string
  sub?: string
  tone?: "brand" | "default" | "pos"
}) {
  const valueColor = tone === "brand" ? C.brand : tone === "pos" ? C.pos : C.g900
  return (
    <div className="py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: C.g500 }}>
        {label}
      </div>
      <div className="text-[22px] font-semibold mt-1" style={{ color: valueColor, letterSpacing: "-0.02em", ...TNUM }}>
        {value}
      </div>
      {sub && <div className="text-[11.5px] text-slate-500 mt-0.5" style={TNUM}>{sub}</div>}
    </div>
  )
}

function Alert({ tone, Icon, title, detail, cta, href }: {
  tone: "warn" | "info" | "neut"
  Icon: typeof Bell
  title: string
  detail: string
  cta: string
  href: string
}) {
  const toneMap = {
    warn: { bg: C.warnBg, border: C.warnBorder, ic: C.warn },
    info: { bg: C.infoBg, border: C.infoBorder, ic: C.info },
    neut: { bg: C.g50, border: C.border, ic: C.g600 },
  }
  const t = toneMap[tone]
  return (
    <div
      className="flex items-start gap-3 px-3.5 py-3 rounded-[8px]"
      style={{ background: t.bg, border: `1px solid ${t.border}` }}
    >
      <span style={{ color: t.ic, marginTop: 1 }}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-slate-900 leading-tight">{title}</div>
        <div className="text-[12.5px] text-slate-600 mt-0.5">{detail}</div>
      </div>
      <a
        href={href}
        className="inline-flex items-center gap-1 text-[12px] font-semibold whitespace-nowrap shrink-0"
        style={{ color: C.brand }}
      >
        {cta} <ChevronRight className="h-3 w-3" />
      </a>
    </div>
  )
}

function RangePills({ value, onChange }: { value: Range; onChange: (v: Range) => void }) {
  return (
    <div className="inline-flex p-[3px] rounded-[6px]" style={{ background: C.g50, border: `1px solid ${C.border}` }}>
      {(["7d", "30d", "90d", "1A"] as Range[]).map((r) => {
        const active = r === value
        return (
          <button
            key={r}
            onClick={() => onChange(r)}
            className="px-2.5 py-1 text-[12px] font-medium rounded-[4px] transition-all"
            style={{
              color: active ? C.g900 : C.g500,
              background: active ? C.white : "transparent",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
            }}
          >
            {r}
          </button>
        )
      })}
    </div>
  )
}

function Trend({ data }: { data: Array<{ date: Date; value: number }> }) {
  if (!data.length) return null
  const W = 100, H = 40
  const values = data.map((d) => d.value)
  const max = Math.max(...values, 1)
  const min = 0
  const pts = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * W
      const y = H - ((d.value - min) / (max - min || 1)) * H
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
  const start = data[0]?.date
  const end = data[data.length - 1]?.date
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`

  if (max <= 0) {
    return (
      <div className="py-2 px-1">
        <div className="flex justify-between text-[12px]" style={{ color: C.g500 }}>
          <span>Receita atribuída diária</span>
          <span style={TNUM}>{fmt(start)} — {fmt(end)}</span>
        </div>
        <div className="h-[80px] flex items-center justify-center text-[11px] italic text-slate-400">
          Sem receita atribuída no período
        </div>
      </div>
    )
  }

  return (
    <div className="px-1">
      <div className="flex justify-between mb-1.5 text-[12px]" style={{ color: C.g500 }}>
        <span>Receita atribuída diária</span>
        <span style={TNUM}>{fmt(start)} — {fmt(end)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 80 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={C.brand} stopOpacity="0.25" />
            <stop offset="100%" stopColor={C.brand} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#trendFill)" />
        <polyline points={pts} fill="none" stroke={C.brand} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

function HealthDonut({ score }: { score: number }) {
  const r = 22, c = 2 * Math.PI * r
  const off = c * (1 - score / 100)
  const tone = score >= 80 ? C.pos : score >= 60 ? C.amber : C.neg
  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={r} stroke={C.g200} strokeWidth="6" fill="none" />
      <circle cx="28" cy="28" r={r} stroke={tone} strokeWidth="6" fill="none"
        strokeDasharray={c} strokeDashoffset={off}
        strokeLinecap="round" transform="rotate(-90 28 28)" />
    </svg>
  )
}

function HealthRow({ label, pct, tone, detail }: { label: string; pct: number; tone: "pos" | "warn" | "neg" | "brand"; detail?: string }) {
  const color = tone === "pos" ? C.pos : tone === "warn" ? C.amber : tone === "neg" ? C.neg : C.brand
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[12px]" style={{ color: C.g700 }}>{label}</span>
        <span className="text-[12px] font-semibold" style={{ color, ...TNUM }}>{pct}%</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: C.g100 }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
      </div>
      {detail && <div className="text-[10.5px] mt-0.5" style={{ color: C.g400 }}>{detail}</div>}
    </div>
  )
}

const MONTH_ABBR = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]

function NextEvent({ ev, tone }: { ev: CsEvent; tone: "brand" | "neut" }) {
  const d = new Date(ev.scheduled_at)
  const dateStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
  const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  return (
    <div className="flex items-start gap-3 py-1">
      <div
        className="w-[42px] py-1.5 rounded-[6px] text-center shrink-0"
        style={{
          background: tone === "brand" ? C.blue50 : C.g50,
          border: `1px solid ${tone === "brand" ? C.blue100 : C.border}`,
        }}
      >
        <div className="text-[9px] font-semibold uppercase tracking-[0.05em]" style={{ color: tone === "brand" ? C.brand : C.g500 }}>
          {MONTH_ABBR[d.getMonth()]}
        </div>
        <div className="text-[16px] font-bold leading-none" style={{ color: tone === "brand" ? C.brand : C.g900, ...TNUM }}>
          {d.getDate()}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-slate-900 leading-tight">{ev.title}</div>
        <div className="text-[11.5px] text-slate-500 mt-0.5" style={TNUM}>{dateStr} · {timeStr}</div>
        {ev.attendees && ev.attendees.length > 0 && (
          <div className="text-[11.5px] text-slate-500 mt-0.5 truncate">{ev.attendees.join(" · ")}</div>
        )}
      </div>
    </div>
  )
}

function IntegRow({ integ }: { integ: { key: string; name: string; connected: boolean } }) {
  const isConn = integ.connected
  return (
    <div
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-[6px]"
      style={{
        border: `1px solid ${isConn ? C.posBorder : C.border}`,
        background: isConn ? "#F0FDF4" : C.white,
      }}
    >
      <ChannelIcon name={integ.key} size={22} />
      <span className="flex-1 text-[13px] font-medium text-slate-900">{integ.name}</span>
      {isConn ? (
        <Badge tone="pos" dot>Conectado</Badge>
      ) : (
        <span className="text-[11px]" style={{ color: C.g400 }}>Não configurado</span>
      )}
    </div>
  )
}

function ActivityItemCompact({ a }: { a: Activity }) {
  const m = KIND_META[a.kind] ?? KIND_META.outro
  const Icon = m.Icon
  return (
    <div className="flex items-start gap-3 py-2">
      <div
        className="w-[30px] h-[30px] rounded-[8px] inline-flex items-center justify-center shrink-0"
        style={{ background: m.color + "15", color: m.color }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-slate-900 truncate">{a.title}</span>
          <span className="text-[11px] ml-auto shrink-0" style={{ color: C.g400, ...TNUM }}>
            {new Date(a.occurred_at).toLocaleDateString("pt-BR")}
          </span>
        </div>
        {a.summary && (
          <div
            className="text-[12px] text-slate-500 mt-0.5 overflow-hidden"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 1,
              WebkitBoxOrient: "vertical" as const,
            }}
          >
            {a.summary}
          </div>
        )}
      </div>
    </div>
  )
}
