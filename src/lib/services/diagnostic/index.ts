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
}

export interface FunnelResult {
  stages: FunnelStage[]
  gargaloLabel: string | null
  gargaloDelta: number | null
  insightTitle: string
  insightBody: string
}

export interface ParetoItem {
  rank: number
  title: string
  detail: string
  evidences: string[]
  impactPercent: number
}

export interface HistoryRow {
  metric: string
  now: string
  avg: string
  delta: number
  deltaTone: "pos" | "neg" | "neut"
  context: string
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

export interface DiagnosticData {
  funnel: FunnelResult
  pareto: ParetoItem[]
  history: HistoryRow[]
  campaigns: CampaignRow[]
  automations: AutomationCard[]
  currency: string
  currencySymbol: string
}

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

export async function buildFunnel(
  admin: SupabaseClient,
  storeId: string,
  currency: string,
): Promise<FunnelResult> {
  const sym = cs(currency)

  const { data: campaigns } = await admin
    .from("omnisend_campaign_metrics")
    .select("recipients, delivered, opened, clicked, conversions, conversion_value, open_rate, click_rate, bounce_rate")
    .eq("store_id", storeId)
    .eq("period_label", "7d")

  const { data: campaigns30d } = await admin
    .from("omnisend_campaign_metrics")
    .select("recipients, delivered, opened, clicked, conversions, conversion_value")
    .eq("store_id", storeId)
    .eq("period_label", "30d")

  const sum = (rows: unknown[] | null, key: string): number =>
    (rows ?? []).reduce<number>((acc, r) => acc + (Number((r as Record<string, unknown>)[key]) || 0), 0)

  const sent7d = sum(campaigns, "recipients")
  const deliv7d = sum(campaigns, "delivered")
  const open7d = sum(campaigns, "opened")
  const click7d = sum(campaigns, "clicked")
  const conv7d = sum(campaigns, "conversions")
  const rev7d = sum(campaigns, "conversion_value")

  const sent30d = sum(campaigns30d, "recipients")
  const deliv30d = sum(campaigns30d, "delivered")
  const open30d = sum(campaigns30d, "opened")
  const click30d = sum(campaigns30d, "clicked")
  const conv30d = sum(campaigns30d, "conversions")

  const delivPct7d = sent7d > 0 ? deliv7d / sent7d : 0
  const openPct7d = deliv7d > 0 ? open7d / deliv7d : 0
  const clickPct7d = open7d > 0 ? click7d / open7d : 0
  const convPct7d = click7d > 0 ? conv7d / click7d : 0

  const delivPct30d = sent30d > 0 ? deliv30d / sent30d : 0
  const openPct30d = deliv30d > 0 ? open30d / deliv30d : 0
  const clickPct30d = open30d > 0 ? click30d / open30d : 0
  const convPct30d = click30d > 0 ? conv30d / click30d : 0

  const stages: FunnelStage[] = [
    { key: "sent", label: "Enviados", volume: sent7d, pct: 1, delta: pctChange(sent7d, sent30d / 4), isGargalo: false },
    { key: "delivered", label: "Entregues", volume: deliv7d, pct: delivPct7d, delta: pctChange(delivPct7d, delivPct30d), isGargalo: false },
    { key: "opened", label: "Abertos", volume: open7d, pct: openPct7d, delta: pctChange(openPct7d, openPct30d), isGargalo: false },
    { key: "clicked", label: "Clicaram", volume: click7d, pct: clickPct7d, delta: pctChange(clickPct7d, clickPct30d), isGargalo: false },
    { key: "converted", label: "Converteram", volume: conv7d, pct: convPct7d, delta: pctChange(convPct7d, convPct30d), isGargalo: false },
  ]

  const candidates = stages.slice(2)
  const gargalo = candidates
    .filter((s) => s.delta < -3)
    .sort((a, b) => Math.abs(b.delta) * b.volume - Math.abs(a.delta) * a.volume)[0] ?? null

  if (gargalo) gargalo.isGargalo = true

  const avgRevPerConv = conv7d > 0 ? rev7d / conv7d : 0
  const revenueImpact = gargalo && gargalo.pct > 0
    ? Math.abs(gargalo.delta / 100) * (gargalo.volume / gargalo.pct) * avgRevPerConv
    : 0

  return {
    stages,
    gargaloLabel: gargalo?.label ?? null,
    gargaloDelta: gargalo?.delta ?? null,
    insightTitle: gargalo ? `Gargalo: ${gargalo.label}` : "Funil saudável",
    insightBody: gargalo
      ? `${gargalo.label} caiu ${Math.abs(gargalo.delta).toFixed(1)}% vs média 30d. Receita estimada perdida: ${fmtMoney(revenueImpact, sym)}. Foco: melhorar esta etapa do funil.`
      : "Nenhum gargalo significativo detectado. Todas as etapas estão dentro da variação normal.",
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
  if (funnel.gargaloLabel) {
    problems.push(`Funil: ${funnel.gargaloLabel} caiu ${Math.abs(funnel.gargaloDelta ?? 0).toFixed(1)}%`)
  }
  for (const f of flows) {
    if (f.flow_status === "paused") problems.push(`Automação "${f.flow_name}" pausada`)
    if ((f.open_rate as number) < 15 && (f.recipients as number) > 0) problems.push(`Automação "${f.flow_name}" com abertura baixa (${f.open_rate}%)`)
  }
  for (const c of allConcerns.slice(0, 5)) {
    problems.push(c)
  }

  if (problems.length === 0) {
    return [{ rank: 1, title: "Sem problemas críticos", detail: "Loja performando dentro do esperado.", evidences: [], impactPercent: 100 }]
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return problems.slice(0, 5).map((p, i) => ({
      rank: i + 1,
      title: p,
      detail: "",
      evidences: [],
      impactPercent: Math.round(100 / Math.min(problems.length, 5)),
    }))
  }

  try {
    const ai = new Anthropic({ apiKey })
    const res = await ai.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: `Você é analista sênior de email marketing. Ranqueie os problemas por impacto na queda da loja. Retorne APENAS JSON válido: { "items": [{ "rank": 1, "title": "...", "detail": "1 frase", "evidences": ["dado 1", "dado 2"], "impactPercent": 50 }] }. Soma dos impactPercent = 100. Use SÓ os dados fornecidos. Não invente.`,
      messages: [{
        role: "user",
        content: `Loja: ${storeName}\nProblemas detectados:\n${problems.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\nRetorne JSON com até 5 itens ranqueados.`,
      }],
    })
    const text = res.content[0]?.type === "text" ? res.content[0].text : ""
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      const items = (parsed.items ?? []) as ParetoItem[]
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
    rank: i + 1, title: p, detail: "", evidences: [], impactPercent: Math.round(100 / Math.min(problems.length, 5)),
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
      { metric: "Abertura média", now: "—", avg: "—", delta: 0, deltaTone: "neut", context: "Sem histórico suficiente" },
      { metric: "Receita atribuída", now: "—", avg: "—", delta: 0, deltaTone: "neut", context: "Sem histórico suficiente" },
      { metric: "CTR", now: "—", avg: "—", delta: 0, deltaTone: "neut", context: "Sem histórico suficiente" },
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

  const buildRow = (label: string, path: string, format: "pct" | "money"): HistoryRow => {
    const current = extract(weeks[0]!, path)
    const prevValues = weeks.slice(1).map((w) => extract(w, path)).filter((v): v is number => v != null)
    const avg = prevValues.length > 0 ? prevValues.reduce((a, b) => a + b, 0) / prevValues.length : null

    if (current == null || avg == null) {
      return { metric: label, now: "—", avg: "—", delta: 0, deltaTone: "neut", context: "Dados insuficientes" }
    }

    const delta = avg > 0 ? ((current - avg) / avg) * 100 : 0
    const tone: "pos" | "neg" | "neut" = Math.abs(delta) < 2 ? "neut" : delta > 0 ? "pos" : "neg"
    const fmtNow = format === "pct" ? fmtPct(current) : fmtMoney(current, sym)
    const fmtAvg = format === "pct" ? fmtPct(avg) : fmtMoney(avg, sym)

    return {
      metric: label, now: fmtNow, avg: fmtAvg, delta: Math.round(delta * 10) / 10, deltaTone: tone,
      context: weeks[0]!.ai_summary?.slice(0, 80) ?? (tone === "neut" ? "estável" : tone === "pos" ? "melhorando" : "em queda"),
    }
  }

  return [
    buildRow("Abertura média", "open_rate", "pct"),
    buildRow("Receita atribuída", "revenue.total", "money"),
    buildRow("Recuperação cart", "revenue.flow", "money"),
    buildRow("CTR", "click_rate", "pct"),
    buildRow("Conversão do clique", "conversion_rate", "pct"),
  ]
}

/* ────────── ABA 4: Campanhas ────────── */

export async function buildCampaigns(
  admin: SupabaseClient,
  storeId: string,
  currency: string,
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

/* ────────── ORQUESTRADOR ────────── */

export async function buildFullDiagnostic(
  admin: SupabaseClient,
  storeId: string,
  storeName: string,
  currency: string,
): Promise<DiagnosticData> {
  const [funnel, campaigns, automations, history] = await Promise.all([
    buildFunnel(admin, storeId, currency),
    buildCampaigns(admin, storeId, currency),
    buildAutomations(admin, storeId),
    buildHistory(admin, storeId, currency),
  ])

  const pareto = await buildPareto(admin, storeId, storeName, funnel)

  return {
    funnel,
    pareto,
    history,
    campaigns: campaigns.map((c) => ({ ...c })),
    automations,
    currency,
    currencySymbol: cs(currency),
  }
}
