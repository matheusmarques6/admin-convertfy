/**
 * GET /api/crm/funnel
 *
 * Dashboard do funil comercial: Leads → MQLs → Agendamentos → Reuniões
 * → Vendas + métricas de tráfego (investimento, CPL, CPA, ROAS, cash
 * collect).
 *
 * As etapas são semânticas: pipeline_stages.funnel_step mapeia cada
 * etapa do kanban pra uma etapa canônica. Um deal conta na etapa X se
 * ENTROU em alguma stage mapeada pra X (ou etapa superior) dentro da
 * janela — entrada = criação do deal na stage inicial ou mudança de
 * stage registrada em crm_deal_history (trigger). "Venda" usa
 * deals.won_at (fonte canônica de ganho) além de stages won.
 *
 * Agregação em runtime, mesmo padrão de /api/crm/dashboard/sales —
 * quando a base crescer, migrar pra snapshots diários.
 *
 * Query params:
 *   days=30                       janela em dias (default 30, max 365)
 *   from=YYYY-MM-DD&to=YYYY-MM-DD range custom (sobrepõe days)
 *   pipeline_id=<uuid>            filtra um pipeline (default: todos sales)
 *   utm_source / utm_medium / utm_campaign  filtros de atribuição
 */

import { NextRequest } from "next/server"
import { withTiming } from "@/lib/api/with-timing"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import {
  attributionKeysFromUtm,
  normalizeAdName,
  type AttributionKeys,
} from "@/lib/services/crm-ads-attribution"
import type { FunnelStep } from "@/types/crm"

const log = logger.child("CrmFunnel")

export const dynamic = "force-dynamic"

const STEP_ORDER: Record<FunnelStep, number> = {
  mql: 1,
  agendamento: 2,
  reuniao: 3,
  venda: 4,
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface StageRow {
  id: string
  pipeline_id: string
  name: string
  color: string | null
  order: number
  stage_type: string
  funnel_step: FunnelStep | null
}

interface DealRow {
  id: string
  pipeline_id: string
  stage_id: string
  title: string
  status: string
  value: number | null
  cash_collected: number | null
  created_at: string
  won_at: string | null
  source: string | null
  utm: Record<string, unknown> | null
  lead_id: string | null
}

interface HistRow {
  deal_id: string
  new_value: unknown
  old_value: unknown
  changed_at: string
}

interface InsightRow {
  day: string
  level: string
  entity_id: string
  campaign_name: string | null
  adset_name: string | null
  ad_name: string | null
  spend: number | null
  impressions: number | null
  clicks: number | null
  leads: number | null
}

/**
 * True quando o erro é "coluna/tabela não existe" — ou seja, a migration
 * do funil ainda não rodou neste banco. Nesses casos a rota degrada em
 * vez de derrubar a página inteira: o funil continua contando o que dá,
 * e o payload informa o que falta em `schema_missing`.
 */
function isMissingSchema(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204") return true
  const msg = (e.message || "").toLowerCase()
  return msg.includes("does not exist") || msg.includes("could not find")
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** JSONB gravado como to_jsonb(uuid::text) volta como string simples. */
function jsonbText(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

function isNonEmptyUtm(u: unknown): u is Record<string, unknown> {
  return !!u && typeof u === "object" && Object.keys(u as object).length > 0
}

async function handleGet(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    // Multi-tenant: mesmo padrão de /api/crm/leads
    const { data: userOrg } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    const sp = request.nextUrl.searchParams

    // ── Janela ───────────────────────────────────────────────────
    const fromParam = sp.get("from")
    const toParam = sp.get("to")
    let fromIso: string
    let toIso: string
    let windowDays: number
    if (fromParam && toParam && DATE_RE.test(fromParam) && DATE_RE.test(toParam)) {
      fromIso = `${fromParam}T00:00:00.000Z`
      toIso = `${toParam}T23:59:59.999Z`
      windowDays = Math.max(
        1,
        Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000),
      )
    } else {
      windowDays = Math.min(Math.max(parseInt(sp.get("days") || "30", 10) || 30, 1), 365)
      const now = new Date()
      toIso = now.toISOString()
      fromIso = new Date(now.getTime() - windowDays * 86_400_000).toISOString()
    }
    const fromDay = fromIso.slice(0, 10)
    const toDay = toIso.slice(0, 10)

    const pipelineFilter = sp.get("pipeline_id")
    const utmFilter = {
      source: sp.get("utm_source") || null,
      medium: sp.get("utm_medium") || null,
      campaign: sp.get("utm_campaign") || null,
    }
    const hasUtmFilter = !!(utmFilter.source || utmFilter.medium || utmFilter.campaign)

    // ── Pipelines sales + stages ─────────────────────────────────
    const { data: allPipelines, error: pipErr } = await admin
      .from("pipelines")
      .select("id, name, color")
      .eq("scope", "sales")
      .eq("is_archived", false)
      .order("name")
    if (pipErr) throw pipErr

    const allIds = (allPipelines || []).map((p) => p.id)
    const activeIds =
      pipelineFilter && pipelineFilter !== "all" && allIds.includes(pipelineFilter)
        ? [pipelineFilter]
        : allIds

    if (allIds.length === 0) {
      return successResponse(request, emptyPayload(windowDays, fromDay, toDay))
    }

    const schemaMissing: string[] = []

    let stageRows: StageRow[] | null = null
    {
      const withStep = await admin
        .from("pipeline_stages")
        .select('id, pipeline_id, name, color, "order", stage_type, funnel_step')
        .in("pipeline_id", allIds)
        .limit(2000)

      if (withStep.error && isMissingSchema(withStep.error)) {
        // Migration do funil ainda não rodou: segue sem o mapeamento
        // semântico (etapas de ganho ainda contam como venda).
        schemaMissing.push("pipeline_stages.funnel_step")
        log.warn("[Funnel] funnel_step ausente — rode a migration 20261052")
        const fallback = await admin
          .from("pipeline_stages")
          .select('id, pipeline_id, name, color, "order", stage_type')
          .in("pipeline_id", allIds)
          .limit(2000)
        if (fallback.error) throw fallback.error
        stageRows = (fallback.data as StageRow[] | null) ?? []
      } else {
        if (withStep.error) throw withStep.error
        stageRows = (withStep.data as StageRow[] | null) ?? []
      }
    }

    const stages = (stageRows ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
    const stageById = new Map(stages.map((s) => [s.id, s]))
    const stepOfStage = (stageId: string | null): number | null => {
      if (!stageId) return null
      const st = stageById.get(stageId)
      if (!st) return null
      if (st.funnel_step) return STEP_ORDER[st.funnel_step] ?? null
      // Fail-safe: stage won sem mapeamento conta como venda
      if (st.stage_type === "won") return STEP_ORDER.venda
      return null
    }

    // ── Deals do escopo (todos, não só os criados na janela: um deal
    //    antigo que ENTRA em "Reunião" hoje conta no funil de hoje) ──
    const DEAL_COLS =
      "id, pipeline_id, stage_id, title, status, value, created_at, won_at, source, utm, lead_id"

    let dealRows: DealRow[] | null = null
    {
      const withCash = await admin
        .from("deals")
        .select(`${DEAL_COLS}, cash_collected`)
        .in("pipeline_id", activeIds)
        .neq("status", "archived")
        .limit(10000)

      if (withCash.error && isMissingSchema(withCash.error)) {
        schemaMissing.push("deals.cash_collected")
        const fallback = await admin
          .from("deals")
          .select(DEAL_COLS)
          .in("pipeline_id", activeIds)
          .neq("status", "archived")
          .limit(10000)
        if (fallback.error) throw fallback.error
        dealRows = (fallback.data as DealRow[] | null) ?? []
      } else {
        if (withCash.error) throw withCash.error
        dealRows = (withCash.data as DealRow[] | null) ?? []
      }
    }
    const deals = dealRows ?? []
    const dealIds = new Set(deals.map((d) => d.id))

    // ── Histórico de mudança de etapa dentro da janela ───────────
    const { data: histRows, error: histErr } = await admin
      .from("crm_deal_history")
      .select("deal_id, new_value, old_value, changed_at")
      .eq("field", "stage_id")
      .gte("changed_at", fromIso)
      .lte("changed_at", toIso)
      .order("changed_at", { ascending: true })
      .limit(10000)
    if (histErr) throw histErr
    const hist = ((histRows as HistRow[] | null) ?? []).filter((h) =>
      dealIds.has(h.deal_id),
    )

    // ── Leads criados na janela (topo do funil) ──────────────────
    let leadsQ = admin
      .from("crm_leads")
      .select("id, utm, source, created_at")
      .eq("scope", "sales")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .limit(10000)
    if (userOrg?.org_id) leadsQ = leadsQ.eq("org_id", userOrg.org_id)
    const { data: leadRows, error: leadErr } = await leadsQ
    if (leadErr) throw leadErr
    const leads = (leadRows as Array<{ id: string; utm: unknown; source: string | null }> | null) ?? []

    // ── UTM dos leads dos deals (fallback deal.utm → lead.utm) ───
    const leadUtmMap = new Map<string, Record<string, unknown>>()
    for (const l of leads) if (isNonEmptyUtm(l.utm)) leadUtmMap.set(l.id, l.utm)
    const missingLeadIds = Array.from(
      new Set(
        deals
          .map((d) => d.lead_id)
          .filter((id): id is string => !!id && !leadUtmMap.has(id)),
      ),
    )
    for (const ids of chunk(missingLeadIds, 200)) {
      const { data } = await admin.from("crm_leads").select("id, utm").in("id", ids)
      for (const l of data ?? []) {
        if (isNonEmptyUtm(l.utm)) leadUtmMap.set(l.id, l.utm)
      }
    }

    const utmOfDeal = (d: DealRow): Record<string, unknown> => {
      if (isNonEmptyUtm(d.utm)) return d.utm
      if (d.lead_id) return leadUtmMap.get(d.lead_id) ?? {}
      return {}
    }
    const matchesUtm = (u: Record<string, unknown>): boolean => {
      if (utmFilter.source && String(u.source ?? "") !== utmFilter.source) return false
      if (utmFilter.medium && String(u.medium ?? "") !== utmFilter.medium) return false
      if (utmFilter.campaign && String(u.campaign ?? "") !== utmFilter.campaign) return false
      return true
    }

    // ── Investimento: lançamentos manuais + insights sincronizados ─
    let spendEntries: Array<{
      id: string
      day: string
      platform: string
      account_name: string
      amount: number | null
      notes: string | null
    }> = []
    if (userOrg?.org_id) {
      const { data: spendRows, error: spendErr } = await admin
        .from("crm_ad_spend")
        .select("id, day, platform, account_name, amount, notes")
        .eq("org_id", userOrg.org_id)
        .eq("source", "manual")
        .gte("day", fromDay)
        .lte("day", toDay)
        .order("day", { ascending: false })
        .limit(2000)
      if (spendErr) {
        if (!isMissingSchema(spendErr)) throw spendErr
        schemaMissing.push("crm_ad_spend")
      } else {
        spendEntries = spendRows ?? []
      }
    }

    // Insights da Meta: nível campaign é a fonte do gasto (somar os 3
    // níveis contaria o mesmo investimento três vezes); nível ad é o
    // que alimenta o ranking de criativos.
    let campaignInsights: InsightRow[] = []
    let adInsights: InsightRow[] = []
    let connectedAccounts: Array<{
      id: string
      account_id: string
      account_name: string
      last_synced_at: string | null
      last_sync_status: string | null
      last_sync_error: string | null
    }> = []

    if (userOrg?.org_id) {
      const [accountsRes, insightsRes] = await Promise.all([
        admin
          .from("crm_ad_accounts")
          .select("id, account_id, account_name, last_synced_at, last_sync_status, last_sync_error")
          .eq("org_id", userOrg.org_id)
          .eq("is_active", true),
        admin
          .from("crm_ad_insights")
          .select(
            "day, level, entity_id, campaign_name, adset_name, ad_name, spend, impressions, clicks, leads",
          )
          .eq("org_id", userOrg.org_id)
          .in("level", ["campaign", "ad"])
          .gte("day", fromDay)
          .lte("day", toDay)
          .limit(20000),
      ])

      if (accountsRes.error) {
        if (!isMissingSchema(accountsRes.error)) throw accountsRes.error
        schemaMissing.push("crm_ad_accounts")
      } else {
        connectedAccounts = accountsRes.data ?? []
      }

      if (insightsRes.error) {
        if (!isMissingSchema(insightsRes.error)) throw insightsRes.error
        schemaMissing.push("crm_ad_insights")
      } else {
        const rows = (insightsRes.data as InsightRow[] | null) ?? []
        campaignInsights = rows.filter((r) => r.level === "campaign")
        adInsights = rows.filter((r) => r.level === "ad")
      }
    }

    // ── Eventos de entrada em etapa por deal ─────────────────────
    // Entrada por mudança de stage (history) + criação do deal na
    // stage inicial + won_at (venda). Contagem cumulativa: um deal com
    // maxStep>=N conta em todas as etapas até N.
    const earliestHistByDeal = new Map<string, HistRow>()
    for (const h of hist) {
      if (!earliestHistByDeal.has(h.deal_id)) earliestHistByDeal.set(h.deal_id, h)
    }

    const maxStepByDeal = new Map<string, number>()
    const bump = (dealId: string, step: number | null) => {
      if (step == null) return
      const cur = maxStepByDeal.get(dealId) ?? 0
      if (step > cur) maxStepByDeal.set(dealId, step)
    }

    for (const h of hist) bump(h.deal_id, stepOfStage(jsonbText(h.new_value)))

    for (const d of deals) {
      const createdInWindow = d.created_at >= fromIso && d.created_at <= toIso
      if (createdInWindow) {
        // Stage inicial: old_value da primeira mudança na janela; sem
        // mudança registrada, aproxima pela stage atual.
        const first = earliestHistByDeal.get(d.id)
        const initialStage = first ? jsonbText(first.old_value) : d.stage_id
        bump(d.id, stepOfStage(initialStage))
      }
      if (d.status === "won" && d.won_at && d.won_at >= fromIso && d.won_at <= toIso) {
        bump(d.id, STEP_ORDER.venda)
      }
    }

    // ── Filtro UTM + contagens ───────────────────────────────────
    const scopedDeals = hasUtmFilter
      ? deals.filter((d) => matchesUtm(utmOfDeal(d)))
      : deals
    const scopedDealIds = new Set(scopedDeals.map((d) => d.id))
    const scopedLeads = hasUtmFilter
      ? leads.filter((l) => matchesUtm(isNonEmptyUtm(l.utm) ? l.utm : {}))
      : leads

    const countAtLeast = (step: number) => {
      let n = 0
      for (const [dealId, max] of maxStepByDeal) {
        if (max >= step && scopedDealIds.has(dealId)) n++
      }
      return n
    }

    const leadsCount = scopedLeads.length
    const mqlCount = countAtLeast(STEP_ORDER.mql)
    const agendamentoCount = countAtLeast(STEP_ORDER.agendamento)
    const reuniaoCount = countAtLeast(STEP_ORDER.reuniao)

    const vendaDeals = scopedDeals.filter(
      (d) => (maxStepByDeal.get(d.id) ?? 0) >= STEP_ORDER.venda,
    )
    const vendaCount = vendaDeals.length

    // ── Métricas ─────────────────────────────────────────────────
    const manualSpend = spendEntries.reduce((s, e) => s + (e.amount || 0), 0)
    const syncedSpend = campaignInsights.reduce((s, r) => s + (r.spend || 0), 0)
    const investimento = manualSpend + syncedSpend
    const faturamento = vendaDeals.reduce((s, d) => s + (d.value || 0), 0)
    const cashCollect = vendaDeals.reduce((s, d) => s + (d.cash_collected || 0), 0)

    const div = (a: number, b: number): number | null => (b > 0 ? a / b : null)
    const pct = (a: number, b: number): number | null =>
      b > 0 ? (a / b) * 100 : null

    const metrics = {
      investimento,
      faturamento,
      cash_collect: cashCollect,
      roas: div(faturamento, investimento),
      tx_conversao: pct(vendaCount, leadsCount),
      ticket_medio: div(faturamento, vendaCount),
      taxa_cash_collect: pct(cashCollect, faturamento),
      cpl: div(investimento, leadsCount),
      custo_mql: div(investimento, mqlCount),
      custo_agendamento: div(investimento, agendamentoCount),
      custo_reuniao: div(investimento, reuniaoCount),
      cpa: div(investimento, vendaCount),
    }

    const funnel = {
      leads: leadsCount,
      mql: mqlCount,
      agendamento: agendamentoCount,
      reuniao: reuniaoCount,
      venda: vendaCount,
    }

    const rates = {
      leads_mql: pct(mqlCount, leadsCount),
      mql_agendamento: pct(agendamentoCount, mqlCount),
      agendamento_reuniao: pct(reuniaoCount, agendamentoCount),
      reuniao_venda: pct(vendaCount, reuniaoCount),
    }

    // ── Investimento por conta ───────────────────────────────────
    const accountMap = new Map<string, { platform: string; account_name: string; amount: number }>()
    for (const e of spendEntries) {
      const key = `${e.platform}::${e.account_name}`
      const item = accountMap.get(key) || {
        platform: e.platform,
        account_name: e.account_name,
        amount: 0,
      }
      item.amount += e.amount || 0
      accountMap.set(key, item)
    }
    for (const acc of connectedAccounts) {
      const spent = campaignInsights.reduce((s, r) => s + (r.spend || 0), 0)
      if (spent <= 0) continue
      const key = `meta::${acc.account_name || acc.account_id}`
      const item = accountMap.get(key) || {
        platform: "meta",
        account_name: acc.account_name || acc.account_id,
        amount: 0,
      }
      item.amount += spent
      accountMap.set(key, item)
      break // insights não guardam a conta por linha no payload atual
    }
    const byAccount = Array.from(accountMap.values()).sort((a, b) => b.amount - a.amount)

    // ── Performance por criativo (Meta × CRM, casado por UTM) ────
    // A ligação é por NOME: utm_campaign={{campaign.name}},
    // utm_medium={{adset.name}}, utm_content={{ad.name}} - {{placement}}.
    interface CreativeAgg {
      ad_name: string
      campaign_name: string
      adset_name: string
      spend: number
      impressions: number
      clicks: number
      leads_meta: number
      leads_crm: number
      vendas: number
      receita: number
    }
    const creativeMap = new Map<string, CreativeAgg>()
    const creativeOf = (
      adName: string,
      campaign: string,
      adset: string,
    ): CreativeAgg => {
      const key = adName || `${campaign}::${adset}`
      let item = creativeMap.get(key)
      if (!item) {
        item = {
          ad_name: adName,
          campaign_name: campaign,
          adset_name: adset,
          spend: 0,
          impressions: 0,
          clicks: 0,
          leads_meta: 0,
          leads_crm: 0,
          vendas: 0,
          receita: 0,
        }
        creativeMap.set(key, item)
      }
      return item
    }

    // Lado Meta: gasto e entrega por anúncio
    for (const r of adInsights) {
      const adName = normalizeAdName(r.ad_name)
      const item = creativeOf(
        adName,
        normalizeAdName(r.campaign_name),
        normalizeAdName(r.adset_name),
      )
      // Preserva o nome original pra exibição (o normalizado é só chave)
      if (r.ad_name && item.ad_name === adName) item.ad_name = r.ad_name
      if (r.campaign_name) item.campaign_name = r.campaign_name
      if (r.adset_name) item.adset_name = r.adset_name
      item.spend += r.spend || 0
      item.impressions += r.impressions || 0
      item.clicks += r.clicks || 0
      item.leads_meta += r.leads || 0
    }

    // Lado CRM: leads e vendas que carregam a UTM daquele anúncio.
    // Só cria bucket novo se o anúncio já veio da Meta OU se o filtro de
    // criativo é o único dado — assim tráfego sem gasto ainda aparece.
    const creativeKeyIndex = new Map<string, string>()
    for (const [key, agg] of creativeMap) {
      creativeKeyIndex.set(normalizeAdName(agg.ad_name) || key, key)
    }
    const bucketFor = (keys: AttributionKeys): CreativeAgg | null => {
      if (!keys.ad && !keys.campaign && !keys.adset) return null
      const byAd = keys.ad ? creativeKeyIndex.get(keys.ad) : undefined
      if (byAd) return creativeMap.get(byAd) ?? null
      return creativeOf(keys.ad, keys.campaign, keys.adset)
    }

    for (const l of scopedLeads) {
      const keys = attributionKeysFromUtm(
        isNonEmptyUtm(l.utm) ? (l.utm as Record<string, unknown>) : {},
      )
      const bucket = bucketFor(keys)
      if (bucket) bucket.leads_crm += 1
    }
    for (const d of vendaDeals) {
      const keys = attributionKeysFromUtm(utmOfDeal(d))
      const bucket = bucketFor(keys)
      if (bucket) {
        bucket.vendas += 1
        bucket.receita += d.value || 0
      }
    }

    const creatives = Array.from(creativeMap.values())
      .filter((c) => c.spend > 0 || c.leads_crm > 0 || c.vendas > 0)
      .map((c) => ({
        ...c,
        cpl: c.leads_crm > 0 && c.spend > 0 ? c.spend / c.leads_crm : null,
        cpa: c.vendas > 0 && c.spend > 0 ? c.spend / c.vendas : null,
        roas: c.spend > 0 ? c.receita / c.spend : null,
      }))
      .sort((a, b) => b.receita - a.receita || b.spend - a.spend)
      .slice(0, 50)

    // ── Opções de UTM (janela, sem filtro aplicado) ──────────────
    const utmOptions = { sources: new Set<string>(), mediums: new Set<string>(), campaigns: new Set<string>() }
    const collectUtm = (u: Record<string, unknown>) => {
      if (typeof u.source === "string" && u.source) utmOptions.sources.add(u.source)
      if (typeof u.medium === "string" && u.medium) utmOptions.mediums.add(u.medium)
      if (typeof u.campaign === "string" && u.campaign) utmOptions.campaigns.add(u.campaign)
    }
    for (const l of leads) if (isNonEmptyUtm(l.utm)) collectUtm(l.utm)
    for (const d of deals) collectUtm(utmOfDeal(d))

    // ── Vendas do período (edição de cash collect) ───────────────
    const vendas = vendaDeals
      .slice()
      .sort((a, b) => (b.won_at || "").localeCompare(a.won_at || ""))
      .slice(0, 100)
      .map((d) => ({
        id: d.id,
        title: d.title,
        value: d.value || 0,
        cash_collected: d.cash_collected,
        won_at: d.won_at,
        pipeline_id: d.pipeline_id,
      }))

    // ── Payload de mapeamento (dialog de configuração) ───────────
    const pipelinesPayload = (allPipelines || []).map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      stages: stages
        .filter((s) => s.pipeline_id === p.id)
        .map((s) => ({
          id: s.id,
          name: s.name,
          order: s.order,
          stage_type: s.stage_type,
          funnel_step: s.funnel_step,
        })),
    }))

    const mappedSteps = new Set(
      stages
        .filter((s) => activeIds.includes(s.pipeline_id) && s.funnel_step)
        .map((s) => s.funnel_step as string),
    )

    return successResponse(request, {
      window: { days: windowDays, from: fromDay, to: toDay },
      funnel,
      rates,
      metrics,
      ad_spend: {
        total: investimento,
        manual: manualSpend,
        synced: syncedSpend,
        by_account: byAccount,
        entries: spendEntries,
      },
      ad_accounts: connectedAccounts,
      creatives,
      schema_missing: schemaMissing,
      vendas,
      pipelines: pipelinesPayload,
      mapped_steps: Array.from(mappedSteps),
      utm_options: {
        sources: Array.from(utmOptions.sources).sort(),
        mediums: Array.from(utmOptions.mediums).sort(),
        campaigns: Array.from(utmOptions.campaigns).sort(),
      },
    })
  } catch (error) {
    log.error("Funnel GET error:", error)
    return errorResponse(request, error, "crm-funnel-get")
  }
}

function emptyPayload(days: number, from: string, to: string) {
  return {
    window: { days, from, to },
    funnel: { leads: 0, mql: 0, agendamento: 0, reuniao: 0, venda: 0 },
    rates: {
      leads_mql: null,
      mql_agendamento: null,
      agendamento_reuniao: null,
      reuniao_venda: null,
    },
    metrics: {
      investimento: 0,
      faturamento: 0,
      cash_collect: 0,
      roas: null,
      tx_conversao: null,
      ticket_medio: null,
      taxa_cash_collect: null,
      cpl: null,
      custo_mql: null,
      custo_agendamento: null,
      custo_reuniao: null,
      cpa: null,
    },
    ad_spend: { total: 0, manual: 0, synced: 0, by_account: [], entries: [] },
    ad_accounts: [],
    creatives: [],
    schema_missing: [],
    vendas: [],
    pipelines: [],
    mapped_steps: [],
    utm_options: { sources: [], mediums: [], campaigns: [] },
  }
}

export const GET = withTiming("crm/funnel", handleGet)
