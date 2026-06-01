/**
 * Diagnostic services — gera conteúdo real das 5 abas do modal de diagnóstico.
 *
 * Cada aba tem uma função que lê dados cacheados do Supabase
 * (omnisend_campaign_metrics, omnisend_flow_metrics, store_revenue_summary,
 * weekly_reports) e retorna dados estruturados prontos pro frontend.
 *
 * Nenhuma chamada Omnisend API direta — tudo vem do cache (cron sync 30min).
 * IA (Anthropic) é usada APENAS para narrativa (80/20 ranking, insights),
 * nunca para gerar números.
 */

import { type SupabaseClient } from "@supabase/supabase-js"
import Anthropic from "@anthropic-ai/sdk"
import { logger } from "@/lib/logger"

const log = logger.child("DiagnosticService")

/* ────────── Types ────────── */

export interface FunnelStage {
  key: string
  label: string
  volume: number
  pct: number
  delta: number
  isGargalo: boolean
  trend: number[]
  bench: number | null
}

export interface EmailPerformance {
  entregues: number
  entreguesRate: number
  abertura: number
  aberturaBench: number
  clique: number
  cliqueBench: number
  ctor: number
  ctorBench: number
  bounces: number
  bouncesRate: number
}

export interface SingleFunnel {
  source: "campaign" | "automation"
  stages: FunnelStage[]
  gargaloLabel: string | null
  gargaloDelta: number | null
  gargaloKey: string | null
  insightTitle: string
  insightBody: string
  revenueImpact: number
  expectedOpen: number
  realOpen: number
  openDeltaPp: number
  totalRevenue: number
  hasData: boolean
}

export interface FunnelResult {
  campaign: SingleFunnel
  automation: SingleFunnel
  benchmarkOpen: number
  benchmarkClick: number
  benchmarkConvert: number
  dateRangeStart: string
  dateRangeEnd: string
  emailPerformance: EmailPerformance
}

export interface ParetoAction {
  title: string
  owner: string
  effort: string
  impact: string
}

export interface ParetoItem {
  rank: number
  title: string
  detail: string
  evidences: string[]
  impactPercent: number
  actions: ParetoAction[]
}

export interface HistoryRow {
  metric: string
  now: string
  avg: string
  delta: number
  deltaTone: "pos" | "neg" | "neut"
  context: string
  trend: number[]
}

export interface CampaignRow {
  date: string
  name: string
  segment: string | null
  size: number
  subject: string | null
  openRate: number | null
  ctr: number | null
  revenue: number | null
  isOutlier: boolean
}

export interface AutomationCard {
  name: string
  status: string | null
  triggerType: string | null
  recipients: number | null
  openRate: number | null
  clickRate: number | null
  conversionRate: number | null
  revenue: number | null
  problem: string | null
}

export interface PerfTableRow {
  name: string
  sends: number
  openRate: number | null
  clicks: number
  revenue: number
  isOutlier: boolean
  paused: boolean
}

export interface PerformanceResult {
  faturamentoTotal: number
  faturamentoDelta: number | null
  pedidos: number
  pedidosDelta: number | null
  faturamentoTrend: number[]
  pedidosTrend: number[]
  receitaAtribuida: number
  atribuidaPercent: number
  atribuidaPedidos: number
  emailRevenue: number
  emailPercent: number
  smsRevenue: number
  smsPercent: number
  campanhasRevenue: number
  campanhasEnvios: number
  flowsRevenue: number
  flowsAtivos: number
  topCampaigns: PerfTableRow[]
  topFlows: PerfTableRow[]
}

export interface DiagnosticData {
  performance: PerformanceResult
  funnel: FunnelResult
  pareto: ParetoItem[]
  history: HistoryRow[]
  campaigns: CampaignRow[]
  automations: AutomationCard[]
  currency: string
  currencySymbol: string
  period: string
}

export type DiagnosticPeriod = "7d" | "30d" | "90d" | "12m"

function cs(currency: string): string {
  if (currency === "EUR") return "€"
  if (currency === "USD") return "$"
  return "R$"
}

function fmtMoney(value: number, sym: string): string {
  if (value >= 1000) return `${sym} ${(value / 1000).toFixed(1)}k`
  return `${sym} ${Math.round(value).toLocaleString("pt-BR")}`
}

function fmtPct(value: number | null): string {
  if (value == null) return "—"
  return `${value.toFixed(1)}%`
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return 0
  return ((current - previous) / previous) * 100
}

/* ────────── ABA 1: Funil & Gargalo ────────── */

async function getNetworkBenchmark(admin: SupabaseClient): Promise<{ open: number; click: number; ctor: number; clickRate: number; convert: number; deliv: number }> {
  const { data } = await admin
    .from("omnisend_campaign_metrics")
    .select("recipients, delivered, opened, clicked, conversions")
    .eq("period_label", "30d")
    .limit(500)

  const rows = (data ?? []) as Array<Record<string, number | null>>
  if (rows.length === 0) return { open: 30, click: 35, ctor: 11, clickRate: 3.8, convert: 8, deliv: 98 }

  const totSent = rows.reduce<number>((a, r) => a + (r.recipients || 0), 0)
  const totDeliv = rows.reduce<number>((a, r) => a + (r.delivered || 0), 0)
  const totOpen = rows.reduce<number>((a, r) => a + (r.opened || 0), 0)
  const totClick = rows.reduce<number>((a, r) => a + (r.clicked || 0), 0)
  const totConv = rows.reduce<number>((a, r) => a + (r.conversions || 0), 0)

  return {
    deliv: totSent > 0 ? (totDeliv / totSent) * 100 : 98,
    open: totDeliv > 0 ? (totOpen / totDeliv) * 100 : 30,
    click: totOpen > 0 ? (totClick / totOpen) * 100 : 35, // CTOR (legacy field)
    ctor: totOpen > 0 ? (totClick / totOpen) * 100 : 11,
    clickRate: totDeliv > 0 ? (totClick / totDeliv) * 100 : 3.8,
    convert: totClick > 0 ? (totConv / totClick) * 100 : 8,
  }
}

type FunnelRow = Record<string, unknown>

const sumRows = (rows: FunnelRow[] | null, key: string): number =>
  (rows ?? []).reduce<number>((acc, r) => acc + (Number(r[key]) || 0), 0)

// Converte de forma robusta: usa `conversions`; se vier 0 (Statistics API
// pode falhar/rate-limit), cai pra contagem de itens com receita > 0 —
// cada item que gerou receita teve pelo menos 1 conversão.
function robustConversions(rows: FunnelRow[] | null): number {
  const direct = sumRows(rows, "conversions")
  if (direct > 0) return direct
  return (rows ?? []).filter((r) => (Number(r.conversion_value) || 0) > 0).length
}

interface BenchSet { open: number; click: number; ctor: number; clickRate: number; convert: number; deliv: number }

function computeFunnel(
  source: "campaign" | "automation",
  rows7d: FunnelRow[] | null,
  rows30d: FunnelRow[] | null,
  bench: BenchSet,
  trends: { open: number[]; click: number[]; conv: number[]; sent: number[] },
  sym: string,
): SingleFunnel {
  const sent7 = sumRows(rows7d, "recipients")
  const deliv7 = sumRows(rows7d, "delivered")
  const open7 = sumRows(rows7d, "opened")
  const click7 = sumRows(rows7d, "clicked")
  const conv7 = robustConversions(rows7d)
  const rev7 = sumRows(rows7d, "conversion_value")

  const sent30 = sumRows(rows30d, "recipients")
  const deliv30 = sumRows(rows30d, "delivered")
  const open30 = sumRows(rows30d, "opened")
  const click30 = sumRows(rows30d, "clicked")
  const conv30 = robustConversions(rows30d)

  const delivPct7 = sent7 > 0 ? deliv7 / sent7 : 0
  const openPct7 = deliv7 > 0 ? open7 / deliv7 : 0
  const clickPct7 = open7 > 0 ? click7 / open7 : 0
  const convPct7 = click7 > 0 ? conv7 / click7 : 0

  const delivPct30 = sent30 > 0 ? deliv30 / sent30 : 0
  const openPct30 = deliv30 > 0 ? open30 / deliv30 : 0
  const clickPct30 = open30 > 0 ? click30 / open30 : 0
  const convPct30 = click30 > 0 ? conv30 / click30 : 0

  const stages: FunnelStage[] = [
    { key: "sent", label: "Enviados", volume: sent7, pct: 1, delta: pctChange(sent7, sent30 / 4), isGargalo: false, trend: trends.sent, bench: null },
    { key: "delivered", label: "Entregues", volume: deliv7, pct: delivPct7, delta: pctChange(delivPct7, delivPct30), isGargalo: false, trend: [], bench: bench.deliv },
    { key: "opened", label: "Abertos", volume: open7, pct: openPct7, delta: pctChange(openPct7, openPct30), isGargalo: false, trend: trends.open, bench: bench.open },
    { key: "clicked", label: "Clicaram", volume: click7, pct: clickPct7, delta: pctChange(clickPct7, clickPct30), isGargalo: false, trend: trends.click, bench: bench.click },
    { key: "converted", label: "Converteram", volume: conv7, pct: convPct7, delta: pctChange(convPct7, convPct30), isGargalo: false, trend: trends.conv, bench: bench.convert },
  ]

  const gargalo = stages.slice(2)
    .filter((s) => s.delta < -3)
    .sort((a, b) => Math.abs(b.delta) * b.volume - Math.abs(a.delta) * a.volume)[0] ?? null
  if (gargalo) gargalo.isGargalo = true

  const avgRevPerConv = conv7 > 0 ? rev7 / conv7 : 0
  const revenueImpact = gargalo && gargalo.pct > 0
    ? Math.abs(gargalo.delta / 100) * (gargalo.volume / gargalo.pct) * avgRevPerConv
    : 0

  const label = source === "campaign" ? "campanhas" : "automações"

  return {
    source,
    stages,
    gargaloLabel: gargalo?.label ?? null,
    gargaloDelta: gargalo?.delta ?? null,
    gargaloKey: gargalo?.key ?? null,
    insightTitle: gargalo ? `Gargalo: ${gargalo.label}` : `Funil de ${label} saudável`,
    insightBody: gargalo
      ? `${gargalo.label} caiu ${Math.abs(gargalo.delta).toFixed(1)}% vs média 30d nas ${label}. Receita estimada perdida: ${fmtMoney(revenueImpact, sym)}.`
      : `Nenhum gargalo significativo nas ${label}.`,
    revenueImpact,
    expectedOpen: Math.round(deliv7 * (bench.open / 100)),
    realOpen: open7,
    openDeltaPp: (openPct7 * 100) - bench.open,
    totalRevenue: rev7,
    hasData: sent7 > 0 || sent30 > 0,
  }
}

export async function buildFunnel(
  admin: SupabaseClient,
  storeId: string,
  currency: string,
): Promise<FunnelResult> {
  const sym = cs(currency)

  const [camp7Res, camp30Res, flow7Res, flow30Res, bench, weeklyRes] = await Promise.all([
    admin.from("omnisend_campaign_metrics")
      .select("recipients, delivered, opened, clicked, conversions, conversion_value, send_time")
      .eq("store_id", storeId).eq("period_label", "7d"),
    admin.from("omnisend_campaign_metrics")
      .select("recipients, delivered, opened, clicked, conversions, conversion_value, send_time, bounced")
      .eq("store_id", storeId).eq("period_label", "30d"),
    admin.from("omnisend_flow_metrics")
      .select("recipients, delivered, opened, clicked, conversions, conversion_value")
      .eq("store_id", storeId).eq("period_label", "7d"),
    admin.from("omnisend_flow_metrics")
      .select("recipients, delivered, opened, clicked, conversions, conversion_value")
      .eq("store_id", storeId).eq("period_label", "30d"),
    getNetworkBenchmark(admin),
    admin.from("weekly_reports")
      .select("week_start, metrics")
      .eq("store_id", storeId)
      .order("week_start", { ascending: false }).limit(8),
  ])

  const campaigns7 = camp7Res.data as FunnelRow[] | null
  const campaigns30 = camp30Res.data as FunnelRow[] | null
  const flows7 = flow7Res.data as FunnelRow[] | null
  const flows30 = flow30Res.data as FunnelRow[] | null

  // Sparklines de 8 semanas via weekly_reports (defensivo: JSONB incerto)
  const weeks = ((weeklyRes.data ?? []) as Array<{ week_start: string; metrics: Record<string, unknown> | null }>)
  const metricSeries = (path: string): number[] => {
    return weeks.map((w) => {
      const m = w.metrics
      if (!m) return null
      const parts = path.split(".")
      let val: unknown = m
      for (const p of parts) {
        if (val == null || typeof val !== "object") return null
        val = (val as Record<string, unknown>)[p]
      }
      return typeof val === "number" ? val : null
    }).filter((v): v is number => v != null).reverse()
  }
  const trends = {
    open: metricSeries("open_rate"),
    click: metricSeries("click_rate"),
    conv: metricSeries("conversion_rate"),
    sent: metricSeries("sent"),
  }
  // Automações não têm trend semanal separado no weekly_reports
  const emptyTrends = { open: [], click: [], conv: [], sent: [] }

  const campaignFunnel = computeFunnel("campaign", campaigns7, campaigns30, bench, trends, sym)
  const automationFunnel = computeFunnel("automation", flows7, flows30, bench, emptyTrends, sym)

  // Performance de email (campanhas, período 30d, vs benchmark da rede)
  const sent30 = sumRows(campaigns30, "recipients")
  const deliv30 = sumRows(campaigns30, "delivered")
  const open30 = sumRows(campaigns30, "opened")
  const click30 = sumRows(campaigns30, "clicked")
  const bounces30 = sumRows(campaigns30, "bounced")
  const emailPerformance: EmailPerformance = {
    entregues: deliv30,
    entreguesRate: sent30 > 0 ? (deliv30 / sent30) * 100 : 0,
    abertura: deliv30 > 0 ? (open30 / deliv30) * 100 : 0,
    aberturaBench: bench.open,
    clique: deliv30 > 0 ? (click30 / deliv30) * 100 : 0,
    cliqueBench: bench.clickRate,
    ctor: open30 > 0 ? (click30 / open30) * 100 : 0,
    ctorBench: bench.ctor,
    bounces: bounces30,
    bouncesRate: sent30 > 0 ? (bounces30 / sent30) * 100 : 0,
  }

  const dates = ((campaigns7 ?? []) as Array<{ send_time?: string | null }>)
    .map((c) => c.send_time)
    .filter((d): d is string => !!d)
    .sort()
  const dateStart = dates[0] ? new Date(dates[0]).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : ""
  const dateEnd = dates[dates.length - 1] ? new Date(dates[dates.length - 1]!).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : ""

  return {
    campaign: campaignFunnel,
    automation: automationFunnel,
    benchmarkOpen: bench.open,
    benchmarkClick: bench.click,
    benchmarkConvert: bench.convert,
    dateRangeStart: dateStart,
    dateRangeEnd: dateEnd,
    emailPerformance,
  }
}

/* ────────── ABA 2: 80/20 Problemas ────────── */

export async function buildPareto(
  admin: SupabaseClient,
  storeId: string,
  storeName: string,
  funnel: FunnelResult,
): Promise<ParetoItem[]> {
  const { data: flowsRaw } = await admin
    .from("omnisend_flow_metrics")
    .select("flow_name, flow_status, open_rate, click_rate, conversion_value, recipients")
    .eq("store_id", storeId)
    .eq("period_label", "30d")

  const flows = (flowsRaw ?? []) as Array<Record<string, unknown>>

  const { data: reportsRaw } = await admin
    .from("weekly_reports")
    .select("concerns, highlights")
    .eq("store_id", storeId)
    .order("week_start", { ascending: false })
    .limit(3)

  const allConcerns = (reportsRaw ?? []).flatMap((r) => {
    const c = (r as { concerns: unknown }).concerns
    return Array.isArray(c) ? c.map(String) : []
  })

  const problems: string[] = []
  const fg = funnel.campaign.gargaloLabel ? funnel.campaign : funnel.automation.gargaloLabel ? funnel.automation : null
  if (fg?.gargaloLabel) {
    const src = fg.source === "campaign" ? "campanhas" : "automações"
    problems.push(`Funil (${src}): ${fg.gargaloLabel} caiu ${Math.abs(fg.gargaloDelta ?? 0).toFixed(1)}%`)
  }
  for (const f of flows) {
    if (f.flow_status === "paused") problems.push(`Automação "${f.flow_name}" pausada`)
    if ((f.open_rate as number) < 15 && (f.recipients as number) > 0) problems.push(`Automação "${f.flow_name}" com abertura baixa (${f.open_rate}%)`)
  }
  for (const c of allConcerns.slice(0, 5)) {
    problems.push(c)
  }

  if (problems.length === 0) {
    return [{ rank: 1, title: "Sem problemas críticos", detail: "Loja performando dentro do esperado.", evidences: [], impactPercent: 100, actions: [] }]
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return problems.slice(0, 5).map((p, i) => ({
      rank: i + 1,
      title: p,
      detail: "",
      evidences: [],
      impactPercent: Math.round(100 / Math.min(problems.length, 5)),
      actions: [],
    }))
  }

  try {
    const ai = new Anthropic({ apiKey })
    const res = await ai.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system: `Você é analista sênior de email marketing da Convertfy. Ranqueie os problemas por impacto na queda da loja e sugira ações concretas.
Retorne APENAS JSON válido:
{ "items": [{
  "rank": 1,
  "title": "título curto",
  "detail": "1 frase explicando",
  "evidences": ["dado numérico 1", "dado numérico 2"],
  "impactPercent": 50,
  "actions": [{ "title": "ação concreta", "owner": "Mariana", "effort": "2h", "impact": "+18% open est." }]
}] }
REGRAS:
- Soma dos impactPercent = 100
- Use SÓ os dados fornecidos. Não invente números.
- owner deve ser um de: Mariana (Designer), Pedro (Ops), Jean (Estrategista), Ryan (CS)
- effort: estimativa curta tipo "2h", "10min", "1d"
- impact: ganho estimado curto tipo "+18% open est.", "limita queda", "+8% CTR est."
- 1 a 3 ações por problema, só pros problemas mais impactantes (top 3)
- problemas menores podem ter actions: []`,
      messages: [{
        role: "user",
        content: `Loja: ${storeName}\nProblemas detectados:\n${problems.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\nRetorne JSON com até 5 itens ranqueados, com ações concretas pros top 3.`,
      }],
    })
    const text = res.content[0]?.type === "text" ? res.content[0].text : ""
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      const items = ((parsed.items ?? []) as ParetoItem[]).map((it) => ({
        ...it,
        evidences: Array.isArray(it.evidences) ? it.evidences : [],
        actions: Array.isArray(it.actions) ? it.actions : [],
      }))
      const total = items.reduce((s, i) => s + (i.impactPercent || 0), 0)
      if (total > 0 && total !== 100) {
        items.forEach((i) => { i.impactPercent = Math.round((i.impactPercent / total) * 100) })
      }
      items.sort((a, b) => b.impactPercent - a.impactPercent)
      items.forEach((i, idx) => { i.rank = idx + 1 })
      return items
    }
  } catch (e) {
    log.error("Pareto IA falhou", { error: (e as Error).message })
  }

  return problems.slice(0, 5).map((p, i) => ({
    rank: i + 1, title: p, detail: "", evidences: [], impactPercent: Math.round(100 / Math.min(problems.length, 5)), actions: [],
  }))
}

/* ────────── ABA 3: Comparativo Histórico ────────── */

export async function buildHistory(
  admin: SupabaseClient,
  storeId: string,
  currency: string,
): Promise<HistoryRow[]> {
  const sym = cs(currency)

  const { data: reports } = await admin
    .from("weekly_reports")
    .select("week_start, metrics, highlights, concerns, ai_summary")
    .eq("store_id", storeId)
    .order("week_start", { ascending: false })
    .limit(8)

  const weeks = (reports ?? []) as Array<{
    week_start: string
    metrics: Record<string, unknown> | null
    ai_summary: string | null
  }>

  if (weeks.length < 2) {
    return [
      { metric: "Abertura média", now: "—", avg: "—", delta: 0, deltaTone: "neut", context: "Sem histórico suficiente · ramp-up", trend: [] },
      { metric: "Receita atribuída", now: "—", avg: "—", delta: 0, deltaTone: "neut", context: "Sem histórico suficiente · ramp-up", trend: [] },
      { metric: "CTR", now: "—", avg: "—", delta: 0, deltaTone: "neut", context: "Sem histórico suficiente · ramp-up", trend: [] },
    ]
  }

  const extract = (w: typeof weeks[0], path: string): number | null => {
    const m = w.metrics
    if (!m) return null
    const parts = path.split(".")
    let val: unknown = m
    for (const p of parts) {
      if (val == null || typeof val !== "object") return null
      val = (val as Record<string, unknown>)[p]
    }
    return typeof val === "number" ? val : null
  }

  // "invert": métrica onde subir é ruim (descadastro). format "intK": milhar (4.2k)
  const buildRow = (label: string, path: string, format: "pct" | "money" | "intK", invert = false): HistoryRow => {
    const current = extract(weeks[0]!, path)
    const prevValues = weeks.slice(1).map((w) => extract(w, path)).filter((v): v is number => v != null)
    const avg = prevValues.length > 0 ? prevValues.reduce((a, b) => a + b, 0) / prevValues.length : null
    const trend = weeks.map((w) => extract(w, path)).filter((v): v is number => v != null).reverse()

    if (current == null || avg == null) {
      return { metric: label, now: "—", avg: "—", delta: 0, deltaTone: "neut", context: "Dados insuficientes", trend }
    }

    const delta = avg > 0 ? ((current - avg) / avg) * 100 : 0
    const improving = invert ? delta < 0 : delta > 0
    const tone: "pos" | "neg" | "neut" = Math.abs(delta) < 2 ? "neut" : improving ? "pos" : "neg"
    const fmtVal = (v: number) =>
      format === "pct" ? fmtPct(v)
      : format === "intK" ? (v >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")}k` : Math.round(v).toLocaleString("pt-BR"))
      : fmtMoney(v, sym)

    let context = weeks[0]!.ai_summary?.slice(0, 70) ?? ""
    if (!context) {
      if (tone === "neut") context = "estável dentro do desvio padrão"
      else if (label.includes("descadastro") && !improving) context = "subindo · sinal de irritação"
      else if (label.includes("CTR") && improving) context = "sinal de qualidade do clique"
      else context = improving ? "melhorando vs média" : "abaixo da média · revisar"
    }

    return {
      metric: label, now: fmtVal(current), avg: fmtVal(avg),
      delta: Math.round(delta * 10) / 10, deltaTone: tone, context, trend,
    }
  }

  return [
    buildRow("Abertura média", "open_rate", "pct"),
    buildRow("Receita atribuída", "revenue.total", "money"),
    buildRow("Recuperação cart", "revenue.flow", "money"),
    buildRow("CTR", "click_rate", "pct"),
    buildRow("Conversão do clique", "conversion_rate", "pct"),
    buildRow("Lista engajados 30d", "engaged_leads", "intK"),
    buildRow("Taxa de descadastro", "unsubscribe_rate", "pct", true),
  ]
}

/* ────────── ABA 4: Campanhas ────────── */

export async function buildCampaigns(
  admin: SupabaseClient,
  storeId: string,
  _currency: string,
): Promise<CampaignRow[]> {
  const { data: rows } = await admin
    .from("omnisend_campaign_metrics")
    .select("campaign_name, send_time, subject, recipients, open_rate, click_rate, conversion_value")
    .eq("store_id", storeId)
    .eq("period_label", "30d")
    .order("send_time", { ascending: false })
    .limit(10)

  if (!rows || rows.length === 0) return []

  const campaigns = rows as unknown as Array<{
    campaign_name: string
    send_time: string | null
    subject: string | null
    recipients: number
    open_rate: number | null
    click_rate: number | null
    conversion_value: number | null
  }>

  const validRates = campaigns.map((c) => c.open_rate).filter((r): r is number => r != null && r > 0)
  const avgOpen = validRates.length > 0 ? validRates.reduce((a, b) => a + b, 0) / validRates.length : 30

  return campaigns.map((c) => ({
    date: c.send_time ? new Date(c.send_time).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—",
    name: c.campaign_name ?? "—",
    segment: null,
    size: c.recipients ?? 0,
    subject: c.subject,
    openRate: c.open_rate,
    ctr: c.click_rate,
    revenue: c.conversion_value,
    isOutlier: c.open_rate != null && c.open_rate < avgOpen * 0.7,
  }))
}

/* ────────── ABA 5: Automações ────────── */

export async function buildAutomations(
  admin: SupabaseClient,
  storeId: string,
): Promise<AutomationCard[]> {
  const { data: rows } = await admin
    .from("omnisend_flow_metrics")
    .select("flow_name, flow_status, trigger_type, recipients, open_rate, click_rate, conversions, conversion_value")
    .eq("store_id", storeId)
    .eq("period_label", "30d")
    .order("conversion_value", { ascending: false })
    .limit(15)

  if (!rows || rows.length === 0) return []

  const flows = rows as unknown as Array<{
    flow_name: string
    flow_status: string | null
    trigger_type: string | null
    recipients: number | null
    open_rate: number | null
    click_rate: number | null
    conversions: number | null
    conversion_value: number | null
  }>

  return flows.map((f) => {
    let problem: string | null = null
    if (f.flow_status === "paused") {
      problem = "Automação pausada — revisar se deve reativar"
    } else if (f.open_rate != null && f.open_rate < 15 && (f.recipients ?? 0) > 50) {
      problem = `Abertura muito baixa (${f.open_rate.toFixed(1)}%) — revisar subject ou segmentação`
    } else if (f.click_rate != null && f.click_rate < 1 && (f.recipients ?? 0) > 50) {
      problem = `CTR abaixo de 1% — revisar conteúdo ou CTA`
    }

    return {
      name: f.flow_name,
      status: f.flow_status,
      triggerType: f.trigger_type,
      recipients: f.recipients,
      openRate: f.open_rate,
      clickRate: f.click_rate,
      conversionRate: f.conversions != null && f.recipients != null && f.recipients > 0 ? (f.conversions / f.recipients) * 100 : null,
      revenue: f.conversion_value,
      problem,
    }
  }).sort((a, b) => {
    if (a.problem && !b.problem) return -1
    if (!a.problem && b.problem) return 1
    return 0
  })
}

/* ────────── ABA: Performance (financeiro) ────────── */

export async function buildPerformance(
  admin: SupabaseClient,
  storeId: string,
  period: DiagnosticPeriod,
): Promise<PerformanceResult> {
  const [summaryRes, campaignsRes, flowsRes, reportsRes] = await Promise.all([
    admin
      .from("store_revenue_summary")
      .select("store_total_revenue, store_orders, omnisend_total_revenue, omnisend_campaign_revenue, omnisend_flow_revenue, omnisend_total_orders")
      .eq("store_id", storeId)
      .eq("period_label", period)
      .maybeSingle(),
    admin
      .from("omnisend_campaign_metrics")
      .select("campaign_name, recipients, open_rate, clicked, conversion_value")
      .eq("store_id", storeId)
      .eq("period_label", period)
      .order("conversion_value", { ascending: false })
      .limit(5),
    admin
      .from("omnisend_flow_metrics")
      .select("flow_name, flow_status, recipients, open_rate, clicked, conversion_value")
      .eq("store_id", storeId)
      .eq("period_label", period)
      .order("conversion_value", { ascending: false })
      .limit(5),
    admin
      .from("weekly_reports")
      .select("week_start, metrics")
      .eq("store_id", storeId)
      .order("week_start", { ascending: false })
      .limit(8),
  ])

  const summary = (summaryRes.data ?? {}) as {
    store_total_revenue?: number | null
    store_orders?: number | null
    omnisend_total_revenue?: number | null
    omnisend_campaign_revenue?: number | null
    omnisend_flow_revenue?: number | null
    omnisend_total_orders?: number | null
  }

  const faturamentoTotal = summary.store_total_revenue ?? 0
  const pedidos = summary.store_orders ?? 0
  const receitaAtribuida = summary.omnisend_total_revenue ?? 0
  const campanhasRevenue = summary.omnisend_campaign_revenue ?? 0
  const flowsRevenue = summary.omnisend_flow_revenue ?? 0
  const atribuidaPedidos = summary.omnisend_total_orders ?? 0
  const atribuidaPercent = faturamentoTotal > 0 ? (receitaAtribuida / faturamentoTotal) * 100 : 0

  // Email vs SMS: o cache Omnisend é email; SMS fica 0 até termos canal SMS
  const emailRevenue = receitaAtribuida
  const emailPercent = faturamentoTotal > 0 ? (emailRevenue / faturamentoTotal) * 100 : 0
  const smsRevenue = 0
  const smsPercent = 0

  const campaigns = (campaignsRes.data ?? []) as unknown as Array<{
    campaign_name: string; recipients: number | null; open_rate: number | null; clicked: number | null; conversion_value: number | null
  }>
  const flows = (flowsRes.data ?? []) as unknown as Array<{
    flow_name: string; flow_status: string | null; recipients: number | null; open_rate: number | null; clicked: number | null; conversion_value: number | null
  }>

  // Contagem total de envios/flows ativos (não só top 5)
  const [{ count: campanhasEnvios }, { count: flowsAtivos }] = await Promise.all([
    admin.from("omnisend_campaign_metrics").select("campaign_id", { count: "exact", head: true }).eq("store_id", storeId).eq("period_label", period),
    admin.from("omnisend_flow_metrics").select("flow_id", { count: "exact", head: true }).eq("store_id", storeId).eq("period_label", period).neq("flow_status", "paused"),
  ])

  const avgCampOpen = campaigns.length > 0
    ? campaigns.reduce<number>((a, c) => a + (c.open_rate ?? 0), 0) / campaigns.length
    : 30

  const topCampaigns: PerfTableRow[] = campaigns.map((c) => ({
    name: c.campaign_name ?? "—",
    sends: c.recipients ?? 0,
    openRate: c.open_rate,
    clicks: c.clicked ?? 0,
    revenue: c.conversion_value ?? 0,
    isOutlier: c.open_rate != null && c.open_rate < avgCampOpen * 0.7,
    paused: false,
  }))

  const topFlows: PerfTableRow[] = flows.map((f) => ({
    name: f.flow_name ?? "—",
    sends: f.recipients ?? 0,
    openRate: f.open_rate,
    clicks: f.clicked ?? 0,
    revenue: f.conversion_value ?? 0,
    isOutlier: false,
    paused: f.flow_status === "paused",
  }))

  // Deltas + sparklines via weekly_reports (defensivo: formato JSONB incerto)
  const weeks = ((reportsRes.data ?? []) as Array<{ week_start: string; metrics: Record<string, unknown> | null }>)
  const extractRevenue = (m: Record<string, unknown> | null): number | null => {
    if (!m) return null
    const rev = (m as { revenue?: { total?: number } }).revenue
    if (rev && typeof rev.total === "number") return rev.total
    if (typeof (m as { total_revenue?: number }).total_revenue === "number") return (m as { total_revenue: number }).total_revenue
    return null
  }
  const extractOrders = (m: Record<string, unknown> | null): number | null => {
    if (!m) return null
    const o = (m as { orders?: { total?: number } }).orders
    if (o && typeof o.total === "number") return o.total
    if (typeof (m as { total_orders?: number }).total_orders === "number") return (m as { total_orders: number }).total_orders
    return null
  }

  const revSeries = weeks.map((w) => extractRevenue(w.metrics)).filter((v): v is number => v != null).reverse()
  const ordSeries = weeks.map((w) => extractOrders(w.metrics)).filter((v): v is number => v != null).reverse()

  const halfDelta = (series: number[]): number | null => {
    if (series.length < 4) return null
    const mid = Math.floor(series.length / 2)
    const older = series.slice(0, mid)
    const recent = series.slice(mid)
    const avgOld = older.reduce((a, b) => a + b, 0) / older.length
    const avgNew = recent.reduce((a, b) => a + b, 0) / recent.length
    return avgOld > 0 ? ((avgNew - avgOld) / avgOld) * 100 : null
  }

  return {
    faturamentoTotal,
    faturamentoDelta: halfDelta(revSeries),
    pedidos,
    pedidosDelta: halfDelta(ordSeries),
    faturamentoTrend: revSeries.slice(-8),
    pedidosTrend: ordSeries.slice(-8),
    receitaAtribuida,
    atribuidaPercent,
    atribuidaPedidos,
    emailRevenue,
    emailPercent,
    smsRevenue,
    smsPercent,
    campanhasRevenue,
    campanhasEnvios: campanhasEnvios ?? campaigns.length,
    flowsRevenue,
    flowsAtivos: flowsAtivos ?? flows.filter((f) => f.flow_status !== "paused").length,
    topCampaigns,
    topFlows,
  }
}

/* ────────── ORQUESTRADOR ────────── */

export async function buildFullDiagnostic(
  admin: SupabaseClient,
  storeId: string,
  storeName: string,
  currency: string,
  period: DiagnosticPeriod = "30d",
): Promise<DiagnosticData> {
  const [performance, funnel, campaigns, automations, history] = await Promise.all([
    buildPerformance(admin, storeId, period),
    buildFunnel(admin, storeId, currency),
    buildCampaigns(admin, storeId, currency),
    buildAutomations(admin, storeId),
    buildHistory(admin, storeId, currency),
  ])

  const pareto = await buildPareto(admin, storeId, storeName, funnel)

  return {
    performance,
    funnel,
    pareto,
    history,
    campaigns: campaigns.map((c) => ({ ...c })),
    automations,
    currency,
    currencySymbol: cs(currency),
    period,
  }
}
