"use client"

/**
 * Aba Performance — redesign 2026-05 matching prototype.
 *
 * Layout:
 *  1. Header: range selector (7d/30d/90d/1A/Custom) + comparar + ações
 *  2. 4 KPI cards com delta vs período anterior
 *  3. "Receita atribuída Convertfy" — split por canal (Email/SMS/Push) +
 *     breakdown Campanhas vs Flows + donut de participação
 *  4. "Performance de email" — 5 métricas com benchmark
 *  5. Top campanhas + Top flows lado a lado
 *
 * Dados: dispatcher email-platform (Klaviyo OR Omnisend) + Shopify report
 * pra novos clientes e ticket médio. Sem dados mockados.
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import {
  TrendingUp, ShoppingCart, Mail, MessageSquare, BellRing,
  ExternalLink, Download, Send, Loader2, RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Range = "7d" | "30d" | "90d" | "1A" | "custom"

interface IntegrationStatus {
  connected: boolean
}

interface CampaignRow {
  id: string
  name: string
  status: string
  channel?: string
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
  clicked: number
  clickRate: number
  revenue: number
  triggerType?: string
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
  customers?: { newCustomersLast30Days?: number; totalCustomers?: number }
  orders?: { totalOrders?: number; totalRevenue?: number; averageOrderValue?: number }
}

interface CampaignsResponse {
  campaigns: CampaignRow[]
  summary?: { totalRevenue?: number; totalDelivered?: number; avgOpenRate?: number; avgClickRate?: number; sentCampaigns?: number }
  currency?: string
}

interface FlowsResponse {
  flows: FlowRow[]
  summary?: { totalRevenue?: number; totalDelivered?: number; avgOpenRate?: number; avgClickRate?: number; liveFlows?: number }
  currency?: string
}

// ─── Helpers ────────────────────────────────────────────

const BENCHMARKS = {
  openRate: 0.173,
  clickRate: 0.011,
  ctor: 0.041,
}

function rangeDays(r: Range): number {
  return r === "7d" ? 7 : r === "30d" ? 30 : r === "90d" ? 90 : r === "1A" ? 365 : 30
}

function previousPeriodDates(r: Range): { start: string; end: string } | null {
  if (r === "custom") return null
  const days = rangeDays(r)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const prevEnd = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const prevStart = new Date(prevEnd.getTime() - days * 24 * 60 * 60 * 1000)
  return { start: fmt(prevStart), end: fmt(prevEnd) }
}

function fmtCurrency(value: number, currency: string): string {
  if (!isFinite(value) || value === 0) {
    return currency === "BRL" ? "R$ 0" : `${currency} 0`
  }
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return `${currency} ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
  }
}

function fmtPct(value: number, frac = 2): string {
  if (!isFinite(value)) return "—"
  return `${(value * 100).toFixed(frac).replace(".", ",")}%`
}

function delta(curr: number, prev: number): number | null {
  if (!isFinite(curr) || !isFinite(prev) || prev === 0) return null
  return (curr - prev) / prev
}

// ─── Component ──────────────────────────────────────────

export function TabPerformance({ storeId }: { storeId: string }) {
  const router = useRouter()
  const [range, setRange] = useState<Range>("30d")
  const [channel, setChannel] = useState<"email" | "sms" | "push">("email")
  const [compareEnabled, setCompareEnabled] = useState(true)

  // Conexão email-platform
  const { data: credData, isLoading: credLoading } = useSWR(
    `/api/client-stores/credentials?store_id=${storeId}`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const credStatus = (credData?.status ?? {}) as Record<string, IntegrationStatus>
  const klaviyoConnected = !!credStatus.klaviyo?.connected
  const omnisendConnected = !!credStatus.omnisend?.connected
  const shopifyConnected = !!credStatus.shopify?.connected
  const emailPlatformConnected = klaviyoConnected || omnisendConnected

  const periodParam = `period=${range}`

  // Current period
  const { data: report, isLoading: reportLoading, mutate: refreshReport } = useSWR<EmailReport>(
    emailPlatformConnected ? `/api/integrations/email-platform/report?store_id=${storeId}&${periodParam}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: campaignsRaw, mutate: refreshCampaigns } = useSWR<CampaignsResponse>(
    emailPlatformConnected ? `/api/integrations/email-platform/campaigns?store_id=${storeId}&${periodParam}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: flowsRaw, mutate: refreshFlows } = useSWR<FlowsResponse>(
    emailPlatformConnected ? `/api/integrations/email-platform/flows?store_id=${storeId}&${periodParam}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: shopify, mutate: refreshShopify } = useSWR<ShopifyReport>(
    shopifyConnected ? `/api/integrations/shopify/report?store_id=${storeId}&${periodParam}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  // Previous period (apenas se compare ligado e nao for custom)
  const prevDates = compareEnabled ? previousPeriodDates(range) : null
  const prevParam = prevDates ? `period=custom&start_date=${prevDates.start}&end_date=${prevDates.end}` : null
  const { data: reportPrev } = useSWR<EmailReport>(
    emailPlatformConnected && prevParam ? `/api/integrations/email-platform/report?store_id=${storeId}&${prevParam}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: shopifyPrev } = useSWR<ShopifyReport>(
    shopifyConnected && prevParam ? `/api/integrations/shopify/report?store_id=${storeId}&${prevParam}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const currency = report?.account?.currency || campaignsRaw?.currency || flowsRaw?.currency || "BRL"

  // KPIs derivados
  const kpis = useMemo(() => {
    const rv = report?.revenue ?? {}
    const rvPrev = reportPrev?.revenue ?? {}
    const sh = shopify?.orders ?? {}
    const shPrev = shopifyPrev?.orders ?? {}
    const cs = shopify?.customers ?? {}
    const csPrev = shopifyPrev?.customers ?? {}

    const faturamento = Number(sh.totalRevenue ?? rv.storeRevenue ?? 0)
    const faturamentoPrev = Number(shPrev.totalRevenue ?? rvPrev.storeRevenue ?? 0)
    const pedidos = Number(sh.totalOrders ?? rv.storeOrders ?? 0)
    const pedidosPrev = Number(shPrev.totalOrders ?? rvPrev.storeOrders ?? 0)
    const ticket = Number(sh.averageOrderValue ?? rv.averageOrderValue ?? 0)
    const ticketPrev = Number(shPrev.averageOrderValue ?? rvPrev.averageOrderValue ?? 0)
    const novosClientes = Number(cs.newCustomersLast30Days ?? 0)
    const novosClientesPrev = Number(csPrev.newCustomersLast30Days ?? 0)

    return {
      faturamento,
      faturamentoDelta: delta(faturamento, faturamentoPrev),
      pedidos,
      pedidosDelta: delta(pedidos, pedidosPrev),
      ticket,
      ticketDelta: ticket - ticketPrev,
      ticketDeltaPct: delta(ticket, ticketPrev),
      novosClientes,
      novosClientesDelta: delta(novosClientes, novosClientesPrev),
    }
  }, [report, reportPrev, shopify, shopifyPrev])

  // Receita atribuída
  const attribution = useMemo(() => {
    const rv = report?.revenue ?? {}
    const totalRevenue = Number(rv.storeRevenue ?? 0)
    const attributed = Number(rv.klaviyoAttributedRevenue ?? rv.totalRevenue ?? 0)
    const campRev = Number(rv.campaignRevenue ?? 0)
    const flowRev = Number(rv.flowRevenue ?? 0)
    const attributedOrders = Number(rv.klaviyoAttributedOrders ?? 0)
    const sumCampaignOrders = (campaignsRaw?.campaigns ?? []).reduce((s, c) => s + (c.recipients > 0 && c.openRate > 0 ? Math.round(c.revenue / (ticketSafe(rv.averageOrderValue))) : 0), 0)
    const campaignsCount = (campaignsRaw?.campaigns ?? []).filter((c) => c.status === "sent" || c.status === "Sent" || c.status === "live").length || campaignsRaw?.summary?.sentCampaigns || 0
    const flowsCount = (flowsRaw?.flows ?? []).filter((f) => f.status === "live" || f.status === "Live" || f.status === "active").length || flowsRaw?.summary?.liveFlows || 0
    const pct = totalRevenue > 0 ? attributed / totalRevenue : 0
    return {
      totalRevenue,
      attributed,
      pct,
      campaignRevenue: campRev,
      flowRevenue: flowRev,
      attributedOrders,
      sumCampaignOrders,
      campaignsCount,
      flowsCount,
    }
  }, [report, campaignsRaw, flowsRaw])

  // Email performance (já em fração 0-1)
  const emailPerf = useMemo(() => {
    const ep = report?.emailPerformance ?? {}
    return {
      delivered: Number(ep.delivered ?? campaignsRaw?.summary?.totalDelivered ?? 0),
      openRate: Number(ep.openRate ?? campaignsRaw?.summary?.avgOpenRate ?? 0),
      clickRate: Number(ep.clickRate ?? campaignsRaw?.summary?.avgClickRate ?? 0),
      ctor: Number(ep.clickToOpenRate ?? 0),
      bounceRate: Number(ep.bounceRate ?? 0),
    }
  }, [report, campaignsRaw])

  const emailPerfPrev = useMemo(() => {
    const ep = reportPrev?.emailPerformance ?? {}
    return {
      delivered: Number(ep.delivered ?? 0),
    }
  }, [reportPrev])

  // Top campanhas + flows (por receita)
  const topCampaigns = useMemo(() => {
    return [...(campaignsRaw?.campaigns ?? [])]
      .filter((c) => c.revenue > 0 || c.recipients > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
  }, [campaignsRaw])

  const topFlows = useMemo(() => {
    return [...(flowsRaw?.flows ?? [])]
      .filter((f) => f.revenue > 0 || f.recipients > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6)
  }, [flowsRaw])

  // Total campanhas + flows pra footer das tabelas
  const campCount = Number(campaignsRaw?.summary?.sentCampaigns ?? campaignsRaw?.campaigns?.length ?? 0)
  const flowCount = Number(flowsRaw?.summary?.liveFlows ?? flowsRaw?.flows?.filter((f) => f.status === "live").length ?? 0)

  const handleRefresh = () => {
    refreshReport()
    refreshCampaigns()
    refreshFlows()
    refreshShopify()
  }

  if (credLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!emailPlatformConnected) {
    return (
      <div className="bg-white border rounded-[10px] p-8 text-center" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        <h3 className="text-[14px] font-bold text-slate-900 mb-2">Sem plataforma de email conectada</h3>
        <p className="text-[12px] text-slate-500 mb-4">
          Conecte Klaviyo ou Omnisend na aba <strong>Setup</strong> pra ver os dados de performance.
        </p>
      </div>
    )
  }

  const loading = reportLoading

  return (
    <div className="flex flex-col gap-3">
      {/* ─── Header bar: range + compare + actions ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md">
            {(["7d", "30d", "90d", "1A", "custom"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "px-2.5 py-1 rounded text-[12px] font-semibold transition-colors",
                  range === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
                )}
              >
                {r === "custom" ? "Custom" : r}
              </button>
            ))}
          </div>
          <button
            onClick={() => setCompareEnabled((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] font-medium border transition-colors",
              compareEnabled
                ? "bg-brand-50 text-brand-700 border-brand-200"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
            )}
          >
            Comparando com{" "}
            <span className={cn("font-semibold", compareEnabled ? "text-brand-700" : "text-slate-700")}>
              Período anterior
            </span>
          </button>
          <button
            onClick={handleRefresh}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            title="Atualizar"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <ActionButton
            icon={ExternalLink}
            label="Abrir relatório"
            onClick={() => {
              const url = new URL(window.location.href)
              url.searchParams.set("tab", "relatorio")
              router.push(url.pathname + url.search)
            }}
          />
          <ActionButton
            icon={Download}
            label="Exportar PDF"
            onClick={() => window.print()}
          />
          <ActionButton
            icon={Send}
            label="Enviar ao cliente"
            primary
            onClick={() => {
              const link = `${window.location.origin}/cliente/${storeId}`
              window.prompt("Link do dashboard do cliente (copie):", link)
            }}
          />
        </div>
      </div>

      {/* ─── 4 KPIs ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={TrendingUp}
          label="Faturamento total"
          value={fmtCurrency(kpis.faturamento, currency)}
          compact
          rawValue={kpis.faturamento}
          delta={kpis.faturamentoDelta}
          deltaLabel="vs período anterior"
        />
        <KpiCard
          icon={ShoppingCart}
          label="Pedidos"
          value={kpis.pedidos.toLocaleString("pt-BR")}
          delta={kpis.pedidosDelta}
        />
        <KpiCard
          icon={TrendingUp}
          label="Ticket médio"
          value={fmtCurrency(kpis.ticket, currency)}
          delta={kpis.ticketDeltaPct}
          extraDelta={kpis.ticketDelta !== 0 ? `${kpis.ticketDelta >= 0 ? "+" : ""}${fmtCurrency(kpis.ticketDelta, currency)}` : null}
        />
        <KpiCard
          icon={Mail}
          label="Novos clientes"
          value={kpis.novosClientes.toLocaleString("pt-BR")}
          delta={kpis.novosClientesDelta}
        />
      </div>

      {/* ─── Receita atribuída Convertfy ─── */}
      <AttributionCard
        attribution={attribution}
        currency={currency}
        channel={channel}
        setChannel={setChannel}
        smsActive={false}
        pushActive={false}
      />

      {/* ─── Performance de email ─── */}
      <div className="bg-white border rounded-[10px] p-4" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        <h3 className="text-[14px] font-bold text-slate-900 m-0 mb-3">Performance de email</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <EmailMetric
            icon={Mail}
            label="Entregues"
            value={emailPerf.delivered.toLocaleString("pt-BR")}
            sub={
              emailPerfPrev.delivered > 0
                ? `${delta(emailPerf.delivered, emailPerfPrev.delivered)! >= 0 ? "+" : ""}${((delta(emailPerf.delivered, emailPerfPrev.delivered) || 0) * 100).toFixed(0)}% vs período`
                : null
            }
          />
          <EmailMetric
            icon={Mail}
            label="Abertura"
            value={fmtPct(emailPerf.openRate, 2)}
            highlight={emailPerf.openRate > BENCHMARKS.openRate ? "pos" : "neg"}
            sub={`benchmark ${(BENCHMARKS.openRate * 100).toFixed(1).replace(".", ",")}%`}
          />
          <EmailMetric
            icon={Mail}
            label="Clique"
            value={fmtPct(emailPerf.clickRate, 2)}
            highlight={emailPerf.clickRate > BENCHMARKS.clickRate ? "pos" : "neg"}
            sub={`benchmark ${(BENCHMARKS.clickRate * 100).toFixed(1).replace(".", ",")}%`}
          />
          <EmailMetric
            icon={Mail}
            label="CTOR"
            value={fmtPct(emailPerf.ctor, 2)}
            highlight={emailPerf.ctor > BENCHMARKS.ctor ? "pos" : "neg"}
            sub={`benchmark ${(BENCHMARKS.ctor * 100).toFixed(1).replace(".", ",")}%`}
          />
          <EmailMetric
            icon={Mail}
            label="Bounces"
            value={Math.round(emailPerf.delivered * emailPerf.bounceRate).toLocaleString("pt-BR")}
            sub={`${(emailPerf.bounceRate * 100).toFixed(2).replace(".", ",")}% taxa`}
          />
        </div>
      </div>

      {/* ─── Top campanhas + Top flows ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <TopTable
          title="Top campanhas por receita"
          subtitle={`${campCount} envios · ${range === "1A" ? "últimos 12 meses" : `últimos ${rangeDays(range)} dias`}`}
          columns={[
            { key: "name", label: "Campanha", width: "1fr" },
            { key: "envios", label: "Envios", width: "70px", align: "right" },
            { key: "abertura", label: "Abertura", width: "80px", align: "right" },
            { key: "cliques", label: "Cliques", width: "70px", align: "right" },
            { key: "receita", label: "Receita", width: "100px", align: "right" },
          ]}
          rows={topCampaigns.map((c) => ({
            key: c.id,
            isLive: c.status === "live",
            cells: {
              name: c.name,
              envios: (c.delivered || c.recipients || 0).toLocaleString("pt-BR"),
              abertura: fmtPct(c.openRate, 2),
              cliques: fmtPct(c.clickRate, 2),
              receita: <span className="text-brand-600 font-bold">{fmtCurrency(c.revenue, currency)}</span>,
            },
          }))}
        />
        <TopTable
          title="Top flows por receita"
          subtitle={`${flowCount} flows ativos`}
          columns={[
            { key: "name", label: "Flow", width: "1fr" },
            { key: "envios", label: "Envios", width: "70px", align: "right" },
            { key: "abertura", label: "Abertura", width: "80px", align: "right" },
            { key: "cliques", label: "Cliques", width: "70px", align: "right" },
            { key: "receita", label: "Receita", width: "100px", align: "right" },
          ]}
          rows={topFlows.map((f) => ({
            key: f.id,
            isLive: f.status === "live",
            cells: {
              name: f.name,
              envios: (f.delivered || f.recipients || 0).toLocaleString("pt-BR"),
              abertura: fmtPct(f.openRate, 2),
              cliques: fmtPct(f.clickRate, 2),
              receita: <span className="text-brand-600 font-bold">{fmtCurrency(f.revenue, currency)}</span>,
            },
          }))}
        />
      </div>
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────────

function ticketSafe(v: number | undefined): number {
  return v && v > 0 ? v : 1
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-semibold transition-colors border",
        primary
          ? "bg-brand-500 hover:bg-brand-600 text-white border-brand-500"
          : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  delta: deltaVal,
  deltaLabel,
  extraDelta,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  compact?: boolean
  rawValue?: number
  delta?: number | null
  deltaLabel?: string
  extraDelta?: string | null
}) {
  const sign = deltaVal != null && deltaVal >= 0
  const color = deltaVal == null ? "text-slate-400" : sign ? "text-emerald-600" : "text-red-600"
  return (
    <div className="bg-white border rounded-[10px] p-4" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      </div>
      <div className="text-[26px] font-bold text-slate-900 tabular-nums leading-none mb-1.5">{value}</div>
      <div className={cn("flex items-center gap-1.5 text-[11.5px] font-semibold", color)}>
        {extraDelta && <span>{extraDelta}</span>}
        {deltaVal != null && (
          <span>
            {sign ? "+" : ""}{(deltaVal * 100).toFixed(1).replace(".", ",")}%
          </span>
        )}
        {deltaLabel && <span className="text-slate-400 font-normal">{deltaLabel}</span>}
        {deltaVal == null && !extraDelta && <span className="text-slate-400 font-normal">—</span>}
      </div>
    </div>
  )
}

function AttributionCard({
  attribution,
  currency,
  channel,
  setChannel,
  smsActive,
  pushActive,
}: {
  attribution: {
    totalRevenue: number
    attributed: number
    pct: number
    campaignRevenue: number
    flowRevenue: number
    attributedOrders: number
    sumCampaignOrders: number
    campaignsCount: number
    flowsCount: number
  }
  currency: string
  channel: "email" | "sms" | "push"
  setChannel: (c: "email" | "sms" | "push") => void
  smsActive: boolean
  pushActive: boolean
}) {
  const { attributed, pct, campaignRevenue, flowRevenue, attributedOrders, campaignsCount, flowsCount } = attribution
  const totalBar = campaignRevenue + flowRevenue
  const campWidth = totalBar > 0 ? (campaignRevenue / totalBar) * 100 : 0
  const flowWidth = totalBar > 0 ? (flowRevenue / totalBar) * 100 : 0

  // Donut
  const RADIUS = 50
  const STROKE = 12
  const circumference = 2 * Math.PI * RADIUS
  const filled = circumference * pct

  return (
    <div className="bg-white border rounded-[10px] p-4 md:p-5" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-[14px] font-bold text-slate-900 m-0">Receita atribuída Convertfy</h3>
          <p className="text-[11.5px] text-slate-500 m-0 mt-0.5">Receita gerada por canais que gerenciamos</p>
        </div>
        <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md">
          {(["email", "sms", "push"] as const).map((c) => {
            const enabled = c === "email" || (c === "sms" && smsActive) || (c === "push" && pushActive)
            const Icon = c === "email" ? Mail : c === "sms" ? MessageSquare : BellRing
            return (
              <button
                key={c}
                onClick={() => enabled && setChannel(c)}
                disabled={!enabled}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors",
                  channel === c && enabled && "bg-white text-emerald-600 shadow-sm",
                  channel !== c && enabled && "text-slate-600 hover:text-slate-900",
                  !enabled && "text-slate-300 cursor-not-allowed",
                )}
              >
                <Icon className="h-3 w-3" />
                {c.toUpperCase()}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_160px] gap-4 lg:gap-6 items-center">
        {/* Total + breakdown stats */}
        <div className="flex flex-col gap-2">
          <div className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">Total atribuído</div>
          <div className="text-[34px] font-bold text-slate-900 leading-none tabular-nums">
            {fmtCurrency(attributed, currency)}
          </div>
          <div className="text-[11.5px] font-semibold text-brand-600">
            {(pct * 100).toFixed(1).replace(".", ",")}% do faturamento total
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
            <div>
              <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider">Pedidos</div>
              <div className="text-[13px] font-bold text-slate-900 tabular-nums">{attributedOrders.toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider">Email</div>
              <div className="text-[13px] font-bold text-slate-900 tabular-nums">{fmtCurrency(attributed, currency)}</div>
              <div className="text-[9.5px] text-emerald-600 font-semibold">{(pct * 100).toFixed(1).replace(".", ",")}%</div>
            </div>
            <div>
              <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider">SMS</div>
              <div className="text-[13px] font-bold text-slate-400 tabular-nums">{fmtCurrency(0, currency)}</div>
              <div className="text-[9.5px] text-slate-400">não ativo</div>
            </div>
          </div>
        </div>

        {/* Bar chart split */}
        <div className="flex flex-col gap-3">
          <div>
            <div className="flex justify-between items-baseline mb-1.5">
              <div className="text-[11.5px] text-slate-700">
                <span className="font-semibold">Campanhas</span>
                <span className="text-slate-400 ml-1.5">{campaignsCount} envios</span>
              </div>
              <div className="text-[12px] font-bold text-brand-600 tabular-nums">{fmtCurrency(campaignRevenue, currency)}</div>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${campWidth}%`, background: "#4E62D8" }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between items-baseline mb-1.5">
              <div className="text-[11.5px] text-slate-700">
                <span className="font-semibold">Flows</span>
                <span className="text-slate-400 ml-1.5">{flowsCount} ativos</span>
              </div>
              <div className="text-[12px] font-bold text-brand-600 tabular-nums">{fmtCurrency(flowRevenue, currency)}</div>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${flowWidth}%`, background: "#7B8AE0" }} />
            </div>
          </div>
        </div>

        {/* Donut */}
        <div className="flex flex-col items-center">
          <div className="relative" style={{ width: 140, height: 140 }}>
            <svg width={140} height={140} viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
              <circle cx={70} cy={70} r={RADIUS} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={STROKE} />
              <circle
                cx={70}
                cy={70}
                r={RADIUS}
                fill="none"
                stroke="#4E62D8"
                strokeWidth={STROKE}
                strokeDasharray={`${filled} ${circumference}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[24px] font-bold text-slate-900 tabular-nums leading-none">
                {(pct * 100).toFixed(1).replace(".", ",")}%
              </span>
              <span className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-500 mt-1">
                Participação
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmailMetric({
  icon: Icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string | null
  highlight?: "pos" | "neg"
}) {
  const valueColor =
    highlight === "pos" ? "text-emerald-600" : highlight === "neg" ? "text-slate-900" : "text-slate-900"
  return (
    <div className="rounded-md bg-slate-50 border p-3" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3 w-3 text-slate-400" />
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={cn("text-[20px] font-bold tabular-nums leading-none", valueColor)}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-1">{sub}</div>}
    </div>
  )
}

interface Column {
  key: string
  label: string
  width: string
  align?: "left" | "right"
}

interface Row {
  key: string
  isLive?: boolean
  cells: Record<string, React.ReactNode>
}

function TopTable({ title, subtitle, columns, rows }: { title: string; subtitle?: string; columns: Column[]; rows: Row[] }) {
  return (
    <div className="bg-white border rounded-[10px] p-4" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
      <div className="mb-3">
        <h3 className="text-[14px] font-bold text-slate-900 m-0">{title}</h3>
        {subtitle && <p className="text-[11.5px] text-slate-500 m-0 mt-0.5">{subtitle}</p>}
      </div>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-slate-400 italic">Sem dados no período</div>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-[12px] min-w-[500px]">
            <thead>
              <tr className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                {columns.map((c) => (
                  <th key={c.key} className={cn("pb-2 px-2", c.align === "right" ? "text-right" : "text-left")} style={{ width: c.width }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b last:border-b-0 hover:bg-slate-50/60" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "py-2.5 px-2 align-middle",
                        c.align === "right" ? "text-right tabular-nums" : "",
                      )}
                    >
                      {c.key === "name" ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-slate-800 font-medium truncate block max-w-[280px]">{row.cells[c.key]}</span>
                          {row.isLive && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-purple-600 w-fit">
                              <span className="h-1.5 w-1.5 rounded-full bg-purple-500" /> Live
                            </span>
                          )}
                        </div>
                      ) : (
                        row.cells[c.key]
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
