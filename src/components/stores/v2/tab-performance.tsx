"use client"

/**
 * Tab: Performance — mirror exato do prototype tab-performance.jsx.
 *
 * Layout:
 *  - Controls row: DateRangeChip (7d/30d/90d/1A/Custom) + "Comparando com
 *    Período anterior" Btn secondary + actions row (Abrir relatório /
 *    Exportar PDF / Enviar ao cliente primary)
 *  - 4 PerfKpi cards com icon, label, value, delta (R$ 1,45 mi +12,4%)
 *  - Section "Receita atribuída Convertfy" com:
 *    Right slot: badges Email pos / SMS neut / Push purple
 *    Grid 3-col [1fr 1fr 280px]:
 *     - Big value (38px) + brand pct + 3 SubKpi (Pedidos/Email/SMS)
 *     - ChannelBar Campanhas + Flows
 *     - Gauge 160×120 270° arc com % no centro
 *  - Section "Performance de email" — 5 EmailMetric cards
 *  - Grid 2-col: "Top campanhas por receita" + "Top flows por receita"
 *    PerfTable com header bg gray-50, Live badge em flows, receita brand
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import {
  DollarSign, Package, BarChart3, Users, Mail, Send, Target, Zap, X,
  Calendar, ExternalLink, Download, Loader2,
} from "lucide-react"
import { Section, Badge, Btn, C, TNUM } from "./_primitives"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Range = "7d" | "30d" | "90d" | "1A" | "custom"

interface IntegrationStatus { connected: boolean }

interface CampaignRow {
  id: string
  name: string
  status: string
  recipients: number
  delivered?: number
  opened: number
  openRate: number
  clicked: number
  clickRate: number
  revenue: number
  sendTime?: string | null
}

interface FlowRow {
  id: string
  name: string
  status: string
  recipients: number
  delivered?: number
  opened: number
  openRate: number
  clicked: number
  clickRate: number
  revenue: number
}

interface EmailReport {
  account?: { currency?: string }
  platform?: "klaviyo" | "omnisend"
  hasReportingAccess?: boolean
  error?: string
  rateLimited?: boolean
  revenue?: {
    storeRevenue?: number
    storeOrders?: number
    campaignRevenue?: number
    flowRevenue?: number
    klaviyoAttributedRevenue?: number
    totalRevenue?: number
    klaviyoAttributedOrders?: number
    averageOrderValue?: number
    recoveryRate?: number
  }
  emailPerformance?: {
    delivered?: number
    opened?: number
    clicked?: number
    openRate?: number
    clickRate?: number
    clickToOpenRate?: number
    bounceRate?: number
  }
  overview?: { campaignsInPeriod?: number; liveFlows?: number }
}

interface ShopifyReport {
  customers?: { newCustomersLast30Days?: number }
  orders?: { totalOrders?: number; totalRevenue?: number; averageOrderValue?: number }
}

interface CampaignsResponse { campaigns: CampaignRow[]; summary?: { totalRevenue?: number; sentCampaigns?: number }; currency?: string }
interface FlowsResponse { flows: FlowRow[]; summary?: { totalRevenue?: number; liveFlows?: number }; currency?: string }

function rangeDays(r: Range): number {
  return r === "7d" ? 7 : r === "30d" ? 30 : r === "90d" ? 90 : r === "1A" ? 365 : 30
}

function fmtCurrency(value: number, currency: string, compact = false): string {
  if (!isFinite(value) || value === 0) return currency === "BRL" ? "R$ 0" : `${currency} 0`
  if (compact) {
    if (value >= 1_000_000) return `${currency === "BRL" ? "R$" : currency} ${(value / 1_000_000).toFixed(2).replace(".", ",")} mi`
    if (value >= 10_000) return `${currency === "BRL" ? "R$" : currency} ${(value / 1_000).toFixed(1).replace(".", ",")} mil`
  }
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: compact ? 0 : 2 }).format(value)
  } catch {
    return `${currency} ${value.toLocaleString("pt-BR")}`
  }
}

function delta(curr: number, prev: number): number | null {
  if (!isFinite(curr) || !isFinite(prev) || prev === 0) return null
  return (curr - prev) / prev
}

function previousPeriodDates(r: Range) {
  if (r === "custom") return null
  const days = rangeDays(r)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const prevEnd = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const prevStart = new Date(prevEnd.getTime() - days * 24 * 60 * 60 * 1000)
  return { start: fmt(prevStart), end: fmt(prevEnd) }
}

export function TabPerformance({ storeId }: { storeId: string }) {
  const router = useRouter()
  const [range, setRange] = useState<Range>("30d")
  const [compareEnabled, setCompareEnabled] = useState(true)

  const { data: credData, isLoading: credLoading } = useSWR(`/api/client-stores/credentials?store_id=${storeId}`, fetcher, { revalidateOnFocus: false })
  const status = (credData?.status ?? {}) as Record<string, IntegrationStatus>
  const emailPlatformConnected = !!status.klaviyo?.connected || !!status.omnisend?.connected
  const shopifyConnected = !!status.shopify?.connected

  const periodParam = `period=${range}`

  const { data: report } = useSWR<EmailReport>(emailPlatformConnected ? `/api/integrations/email-platform/report?store_id=${storeId}&${periodParam}` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true })
  const { data: campaignsRaw } = useSWR<CampaignsResponse>(emailPlatformConnected ? `/api/integrations/email-platform/campaigns?store_id=${storeId}&${periodParam}` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true })
  const { data: flowsRaw } = useSWR<FlowsResponse>(emailPlatformConnected ? `/api/integrations/email-platform/flows?store_id=${storeId}&${periodParam}` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true })
  const { data: shopify } = useSWR<ShopifyReport>(shopifyConnected ? `/api/integrations/shopify/report?store_id=${storeId}&${periodParam}` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true })

  const prevDates = compareEnabled ? previousPeriodDates(range) : null
  const prevParam = prevDates ? `period=custom&start_date=${prevDates.start}&end_date=${prevDates.end}` : null
  const { data: reportPrev } = useSWR<EmailReport>(emailPlatformConnected && prevParam ? `/api/integrations/email-platform/report?store_id=${storeId}&${prevParam}` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true })
  const { data: shopifyPrev } = useSWR<ShopifyReport>(shopifyConnected && prevParam ? `/api/integrations/shopify/report?store_id=${storeId}&${prevParam}` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true })

  const currency = report?.account?.currency || campaignsRaw?.currency || flowsRaw?.currency || "BRL"

  const kpis = useMemo(() => {
    const sh = shopify?.orders ?? {}
    const shPrev = shopifyPrev?.orders ?? {}
    const cs = shopify?.customers ?? {}
    const csPrev = shopifyPrev?.customers ?? {}
    const rv = report?.revenue ?? {}
    const rvPrev = reportPrev?.revenue ?? {}

    const faturamento = Number(sh.totalRevenue ?? rv.storeRevenue ?? 0)
    const faturamentoPrev = Number(shPrev.totalRevenue ?? rvPrev.storeRevenue ?? 0)
    const pedidos = Number(sh.totalOrders ?? rv.storeOrders ?? 0)
    const pedidosPrev = Number(shPrev.totalOrders ?? rvPrev.storeOrders ?? 0)
    const ticket = Number(sh.averageOrderValue ?? rv.averageOrderValue ?? 0)
    const ticketPrev = Number(shPrev.averageOrderValue ?? rvPrev.averageOrderValue ?? 0)
    const novos = Number(cs.newCustomersLast30Days ?? 0)
    const novosPrev = Number(csPrev.newCustomersLast30Days ?? 0)

    return {
      faturamento,
      faturamentoDelta: delta(faturamento, faturamentoPrev),
      pedidos,
      pedidosDelta: delta(pedidos, pedidosPrev),
      ticket,
      ticketDeltaAbs: ticket - ticketPrev,
      ticketDeltaPct: delta(ticket, ticketPrev),
      novos,
      novosDelta: delta(novos, novosPrev),
    }
  }, [report, reportPrev, shopify, shopifyPrev])

  const attribution = useMemo(() => {
    const rv = report?.revenue ?? {}
    const totalRevenue = Number(rv.storeRevenue ?? 0)
    const attributed = Number(rv.klaviyoAttributedRevenue ?? rv.totalRevenue ?? 0)
    const campRev = Number(rv.campaignRevenue ?? campaignsRaw?.summary?.totalRevenue ?? 0)
    const flowRev = Number(rv.flowRevenue ?? flowsRaw?.summary?.totalRevenue ?? 0)
    const orders = Number(rv.klaviyoAttributedOrders ?? 0)
    const campOrders = (campaignsRaw?.campaigns ?? []).reduce((s, c) => s + (c.recipients > 0 ? Math.round(c.recipients * c.clickRate) : 0), 0)
    const flowOrders = Math.max(0, orders - campOrders)
    const sentCampaigns = Number(campaignsRaw?.summary?.sentCampaigns ?? campaignsRaw?.campaigns?.length ?? 0)
    const liveFlows = Number(flowsRaw?.summary?.liveFlows ?? flowsRaw?.flows?.filter((f) => f.status === "live").length ?? 0)
    const pct = totalRevenue > 0 ? attributed / totalRevenue : 0
    const sumBars = campRev + flowRev
    return {
      attributed,
      pct,
      campRev,
      flowRev,
      campPct: sumBars > 0 ? campRev / sumBars : 0,
      flowPct: sumBars > 0 ? flowRev / sumBars : 0,
      orders,
      campOrders,
      flowOrders,
      sentCampaigns,
      liveFlows,
    }
  }, [report, campaignsRaw, flowsRaw])

  const emailPerf = useMemo(() => {
    const ep = report?.emailPerformance ?? {}
    const epPrev = reportPrev?.emailPerformance ?? {}
    const delivered = Number(ep.delivered ?? 0)
    const deliveredPrev = Number(epPrev.delivered ?? 0)
    return {
      delivered,
      deliveredDelta: delta(delivered, deliveredPrev),
      openRate: Number(ep.openRate ?? 0),
      clickRate: Number(ep.clickRate ?? 0),
      ctor: Number(ep.clickToOpenRate ?? 0),
      bounceRate: Number(ep.bounceRate ?? 0),
    }
  }, [report, reportPrev])

  const topCampaigns = useMemo(
    () => [...(campaignsRaw?.campaigns ?? [])].filter((c) => c.revenue > 0 || c.recipients > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    [campaignsRaw],
  )
  const topFlows = useMemo(
    () => [...(flowsRaw?.flows ?? [])].filter((f) => f.revenue > 0 || f.recipients > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 6),
    [flowsRaw],
  )

  if (credLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!emailPlatformConnected) {
    return (
      <Section title="Sem plataforma de email conectada">
        <div className="py-4 text-center">
          <p className="text-[13px] text-slate-500 mb-3">Conecte Klaviyo ou Omnisend em <strong>Setup</strong> para ver os dados de performance.</p>
        </div>
      </Section>
    )
  }

  const showPermissionBanner = report?.hasReportingAccess === false
  const showRateLimitBanner = report?.rateLimited === true

  return (
    <div>
      {(showPermissionBanner || showRateLimitBanner) && (
        <div
          className="flex items-start gap-3 p-3 mb-4 rounded-[8px]"
          style={
            showRateLimitBanner
              ? { background: C.warnBg, border: `1px solid ${C.warnBorder}`, color: C.warn }
              : { background: C.negBg, border: `1px solid ${C.negBorder}`, color: C.neg }
          }
        >
          <Loader2 className={`h-4 w-4 mt-0.5 shrink-0 ${showRateLimitBanner ? "animate-spin" : ""}`} />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold leading-tight">
              {showRateLimitBanner ? "Rate limit atingido — usando cache" : "Permissão insuficiente na API key"}
            </div>
            <div className="text-[11.5px] mt-0.5 opacity-85">
              {showPermissionBanner ? "Reconecte a integração com os escopos completos." : "Tentaremos novamente em alguns segundos."}
            </div>
          </div>
          {showPermissionBanner && (
            <a href={`/admin/stores/${storeId}?tab=setup`} className="text-[11.5px] font-semibold underline shrink-0">Reconectar</a>
          )}
        </div>
      )}

      {/* Controls row */}
      <div className="flex items-center justify-between mb-[18px] gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangeChip value={range} onChange={setRange} />
          <span className="text-[12px]" style={{ color: C.g400 }}>Comparando com</span>
          <button
            onClick={() => setCompareEnabled((v) => !v)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-[12px] font-medium"
            style={{
              background: compareEnabled ? C.blue50 : C.white,
              color: compareEnabled ? C.brand : C.g700,
              border: `1px solid ${compareEnabled ? C.blue100 : C.border}`,
            }}
          >
            Período anterior
          </button>
        </div>
        <div className="flex gap-2">
          <Btn variant="secondary" size="sm" icon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => router.push(`/admin/stores/${storeId}?tab=relatorio`)}>
            Abrir relatório
          </Btn>
          <Btn variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => window.print()}>
            Exportar PDF
          </Btn>
          <Btn variant="primary" size="sm" icon={<Send className="h-3.5 w-3.5" />}
            onClick={() => {
              const link = `${window.location.origin}/cliente/${storeId}`
              window.prompt("Link do dashboard do cliente (copie):", link)
            }}>
            Enviar ao cliente
          </Btn>
        </div>
      </div>

      {/* 4 PerfKpi cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <PerfKpi Icon={DollarSign} label="Faturamento total" value={fmtCurrency(kpis.faturamento, currency, true)} delta={kpis.faturamentoDelta != null ? `${kpis.faturamentoDelta >= 0 ? "+" : ""}${(kpis.faturamentoDelta * 100).toFixed(1).replace(".", ",")}%` : "—"} tone={kpis.faturamentoDelta != null && kpis.faturamentoDelta >= 0 ? "pos" : "neg"} />
        <PerfKpi Icon={Package} label="Pedidos" value={kpis.pedidos.toLocaleString("pt-BR")} delta={kpis.pedidosDelta != null ? `${kpis.pedidosDelta >= 0 ? "+" : ""}${(kpis.pedidosDelta * 100).toFixed(1).replace(".", ",")}%` : "—"} tone={kpis.pedidosDelta != null && kpis.pedidosDelta >= 0 ? "pos" : "neg"} />
        <PerfKpi Icon={BarChart3} label="Ticket médio" value={fmtCurrency(kpis.ticket, currency)} delta={kpis.ticketDeltaAbs !== 0 ? `${kpis.ticketDeltaAbs >= 0 ? "+" : ""}${fmtCurrency(kpis.ticketDeltaAbs, currency)}` : "—"} tone={kpis.ticketDeltaAbs >= 0 ? "pos" : "neg"} />
        <PerfKpi Icon={Users} label="Novos clientes" value={kpis.novos.toLocaleString("pt-BR")} delta={kpis.novosDelta != null ? `${kpis.novosDelta >= 0 ? "+" : ""}${(kpis.novosDelta * 100).toFixed(1).replace(".", ",")}%` : "—"} tone={kpis.novosDelta != null && kpis.novosDelta >= 0 ? "pos" : "neg"} />
      </div>

      {/* Receita atribuída */}
      <Section
        title="Receita atribuída Convertfy"
        subtitle="Receita gerada por canais que gerenciamos"
        right={
          <div className="flex gap-1.5">
            <Badge tone="pos" dot>Email</Badge>
            <Badge tone="neut">SMS</Badge>
            <Badge tone="purple">Push</Badge>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_280px] gap-6 items-center">
          {/* Left: big value + sub kpis */}
          <div>
            <div className="text-[12px]" style={{ color: C.g500 }}>Total atribuído</div>
            <div className="text-[38px] font-semibold text-slate-900" style={{ letterSpacing: "-0.025em", ...TNUM }}>
              {fmtCurrency(attribution.attributed, currency, true)}
            </div>
            <div className="text-[13px] font-semibold mt-0.5" style={{ color: C.brand, ...TNUM }}>
              {(attribution.pct * 100).toFixed(1).replace(".", ",")}% do faturamento total
            </div>
            <div className="flex gap-3.5 mt-3.5">
              <SubKpi label="Pedidos" value={attribution.orders.toLocaleString("pt-BR")} />
              <SubKpi label="Email" value={fmtCurrency(attribution.attributed, currency, true)} sub={`${(attribution.pct * 100).toFixed(1).replace(".", ",")}%`} />
              <SubKpi label="SMS" value={`${currency === "BRL" ? "R$" : currency} 0`} sub="não ativo" mute />
            </div>
          </div>

          {/* Middle: channel bars */}
          <div>
            <ChannelBar label="Campanhas" value={attribution.campRev} pct={attribution.campPct} pedidos={attribution.sentCampaigns} pedidosSuffix="envios" currency={currency} />
            <ChannelBar label="Flows" value={attribution.flowRev} pct={attribution.flowPct} pedidos={attribution.liveFlows} pedidosSuffix="ativos" currency={currency} />
          </div>

          {/* Right: gauge */}
          <Gauge pct={attribution.pct * 100} />
        </div>
      </Section>

      {/* Email performance */}
      <Section title="Performance de email">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <EmailMetric Icon={Send} label="Entregues" value={emailPerf.delivered.toLocaleString("pt-BR")} delta={emailPerf.deliveredDelta != null ? `${emailPerf.deliveredDelta >= 0 ? "+" : ""}${(emailPerf.deliveredDelta * 100).toFixed(0)}% vs período` : "—"} />
          <EmailMetric Icon={Mail} label="Abertura" value={`${(emailPerf.openRate * 100).toFixed(2).replace(".", ",")}%`} delta="benchmark 17,3%" tone={emailPerf.openRate > 0.173 ? "pos" : "default"} />
          <EmailMetric Icon={Target} label="Clique" value={`${(emailPerf.clickRate * 100).toFixed(2).replace(".", ",")}%`} delta="benchmark 1,1%" tone={emailPerf.clickRate > 0.011 ? "pos" : "default"} />
          <EmailMetric Icon={Zap} label="CTOR" value={`${(emailPerf.ctor * 100).toFixed(2).replace(".", ",")}%`} delta="benchmark 4,1%" tone={emailPerf.ctor > 0.041 ? "pos" : "default"} />
          <EmailMetric Icon={X} label="Bounces" value={Math.round(emailPerf.delivered * emailPerf.bounceRate).toLocaleString("pt-BR")} delta={`${(emailPerf.bounceRate * 100).toFixed(2).replace(".", ",")}% taxa`} tone={emailPerf.bounceRate < 0.02 ? "pos" : "default"} />
        </div>
      </Section>

      {/* Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Section title="Top campanhas por receita" subtitle={`${attribution.sentCampaigns} envios · últimos ${rangeDays(range)} dias`}>
          <PerfTable rows={topCampaigns} currency={currency} />
        </Section>
        <Section title="Top flows por receita" subtitle={`${attribution.liveFlows} flows ativos`}>
          <PerfTable rows={topFlows} flows currency={currency} />
        </Section>
      </div>
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────

function DateRangeChip({ value, onChange }: { value: Range; onChange: (v: Range) => void }) {
  return (
    <div className="inline-flex p-[3px] rounded-[8px]" style={{ background: C.g50, border: `1px solid ${C.border}` }}>
      {(["7d", "30d", "90d", "1A", "custom"] as Range[]).map((r) => {
        const active = r === value
        return (
          <button
            key={r}
            onClick={() => onChange(r)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-[12.5px] font-medium rounded-[6px] transition-all"
            style={{
              color: active ? C.g900 : C.g500,
              background: active ? C.white : "transparent",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
            }}
          >
            {r === "custom" && <Calendar className="h-3 w-3" />}
            {r === "custom" ? "Custom" : r}
          </button>
        )
      })}
    </div>
  )
}

function PerfKpi({ Icon, label, value, delta, tone }: { Icon: typeof DollarSign; label: string; value: string; delta: string; tone: "pos" | "neg" }) {
  return (
    <div
      className="p-4 rounded-[12px]"
      style={{ background: C.white, border: `1px solid ${C.border}`, boxShadow: C.shadowSm }}
    >
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-[6px] inline-flex items-center justify-center shrink-0" style={{ background: C.blue50, color: C.brand }}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-[12px] font-medium" style={{ color: C.g500 }}>{label}</span>
      </div>
      <div className="text-[26px] font-semibold text-slate-900 mt-2.5" style={{ letterSpacing: "-0.02em", ...TNUM }}>{value}</div>
      <div className="text-[12px] font-medium mt-1" style={{ color: tone === "pos" ? C.pos : tone === "neg" ? C.neg : C.g500, ...TNUM }}>{delta}</div>
    </div>
  )
}

function SubKpi({ label, value, sub, mute }: { label: string; value: string; sub?: string; mute?: boolean }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: C.g500 }}>{label}</div>
      <div className="text-[14px] font-semibold mt-0.5" style={{ color: mute ? C.g400 : C.g900, ...TNUM }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: C.g500, ...TNUM }}>{sub}</div>}
    </div>
  )
}

function ChannelBar({ label, value, pct, pedidos, pedidosSuffix, currency }: { label: string; value: number; pct: number; pedidos: number; pedidosSuffix: string; currency: string }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-[12.5px] font-medium" style={{ color: C.g700 }}>{label}</span>
        <span className="text-[13px] font-semibold" style={{ color: C.g900, ...TNUM }}>
          {fmtCurrency(value, currency)}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: C.g100 }}>
        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: C.brand }} />
      </div>
      <div className="text-[10.5px] mt-1" style={{ color: C.g500, ...TNUM }}>{pedidos.toLocaleString("pt-BR")} {pedidosSuffix}</div>
    </div>
  )
}

function Gauge({ pct }: { pct: number }) {
  const r = 60
  const c = 2 * Math.PI * r
  const visible = (pct / 100) * c * 0.75
  return (
    <div className="flex items-center justify-center">
      <svg width="160" height="120" viewBox="0 0 160 120">
        <circle cx="80" cy="80" r={r} fill="none" stroke={C.g100} strokeWidth="12"
          strokeDasharray={`${c * 0.75} ${c}`} transform="rotate(135 80 80)" strokeLinecap="round" />
        <circle cx="80" cy="80" r={r} fill="none" stroke={C.brand} strokeWidth="12"
          strokeDasharray={`${visible} ${c}`} transform="rotate(135 80 80)" strokeLinecap="round" />
        <text x="80" y="78" textAnchor="middle" fontSize="22" fontWeight="700" fill={C.g900} style={TNUM}>
          {pct.toFixed(1).replace(".", ",")}%
        </text>
        <text x="80" y="96" textAnchor="middle" fontSize="9" fontWeight="600" fill={C.g400} letterSpacing="0.08em">
          PARTICIPAÇÃO
        </text>
      </svg>
    </div>
  )
}

function EmailMetric({ Icon, label, value, delta, tone }: { Icon: typeof Send; label: string; value: string; delta: string; tone?: "pos" | "default" }) {
  return (
    <div className="p-3.5 rounded-[8px]" style={{ background: C.white, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4" style={{ color: C.brand }} />
        <span className="text-[12px] font-medium" style={{ color: C.g500 }}>{label}</span>
      </div>
      <div className="text-[22px] font-semibold" style={{ color: tone === "pos" ? C.pos : C.g900, letterSpacing: "-0.02em", ...TNUM }}>{value}</div>
      <div className="text-[11px] mt-0.5" style={{ color: C.g500, ...TNUM }}>{delta}</div>
    </div>
  )
}

function PerfTable({ rows, flows, currency }: { rows: Array<CampaignRow | FlowRow>; flows?: boolean; currency: string }) {
  return (
    <div className="overflow-x-auto -mx-[18px]">
      <table className="w-full" style={{ borderCollapse: "collapse" as const }}>
        <thead>
          <tr style={{ background: C.g50 }}>
            {[flows ? "Flow" : "Campanha", "Envios", "Abertura", "Cliques", "Receita"].map((h, i) => (
              <th
                key={h}
                className="text-[10.5px] font-semibold uppercase tracking-[0.04em]"
                style={{
                  padding: "8px 10px",
                  textAlign: i === 0 ? "left" : "right",
                  color: C.g500,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-8 text-center text-[12px] text-slate-400 italic">Sem dados no período</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td className="text-[12.5px] font-medium truncate max-w-[220px] whitespace-nowrap" style={{ padding: "10px", color: C.g900 }}>
                  {flows && r.status === "live" && (
                    <span className="mr-1.5 inline-block align-middle">
                      <Badge tone="info" dot>Live</Badge>
                    </span>
                  )}
                  {r.name}
                </td>
                <td className="text-[12] text-right" style={{ padding: "10px", color: C.g600, ...TNUM }}>{(r.delivered ?? r.recipients).toLocaleString("pt-BR")}</td>
                <td className="text-[12] text-right" style={{ padding: "10px", color: C.g600, ...TNUM }}>{(r.openRate * 100).toFixed(2).replace(".", ",")}%</td>
                <td className="text-[12] text-right" style={{ padding: "10px", color: C.g600, ...TNUM }}>{(r.clickRate * 100).toFixed(2).replace(".", ",")}%</td>
                <td className="text-[13px] font-semibold text-right" style={{ padding: "10px", color: C.brand, ...TNUM }}>{fmtCurrency(r.revenue, currency)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
