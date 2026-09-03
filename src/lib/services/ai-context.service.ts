/**
 * AI Context Builder
 *
 * Constroi strings de contexto que sao injetadas no system prompt
 * do Claude. Quando o user esta numa pagina de loja/cliente, o chat
 * fica ciente desses dados e responde com referencia aos numeros
 * reais.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("AiContext")

function fmtBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v)
}

/** Formata na MOEDA da loja — loja EUR/USD não pode sair como R$. */
function fmtMoney(v: number, currency: string | null | undefined): string {
  const cur = (currency ?? "BRL").toUpperCase()
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
    }).format(v)
  } catch {
    return `${cur} ${Math.round(v).toLocaleString("pt-BR")}`
  }
}

function pct(num: number, den: number): string {
  return den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—"
}

function deltaPp(cur: { n: number; d: number }, prev: { n: number; d: number }): string {
  if (cur.d === 0 || prev.d === 0) return ""
  const diff = (cur.n / cur.d - prev.n / prev.d) * 100
  const sign = diff >= 0 ? "+" : ""
  return ` (${sign}${diff.toFixed(1)}pp vs 30d anteriores)`
}

/**
 * Dossiê da loja injetado no system prompt da ConvertIA. É o PISO de
 * contexto: quanto mais rico, menos rodadas o modelo gasta se situando
 * e menos resposta genérica sai. Cada bloco falha de forma isolada
 * (Promise.allSettled) — fonte indisponível vira lacuna, nunca erro.
 */
export async function buildStoreContext(storeId: string): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data: store } = await admin
      .from("client_stores")
      .select(
        "id, store_name, platform, niche, country, target_audience, health_score, mrr_cents, currency, email_platform",
      )
      .eq("id", storeId)
      .maybeSingle()
    if (!store) return ""

    const now = Date.now()
    const d30 = new Date(now - 30 * 24 * 3600 * 1000).toISOString()
    const d60 = new Date(now - 60 * 24 * 3600 * 1000).toISOString()
    const day30 = d30.slice(0, 10)
    const day60 = d60.slice(0, 10)

    const [dailyQ, kCampQ, oCampQ, flowsOQ, flowsKQ, alertsQ, healthQ] =
      await Promise.allSettled([
        // Série diária da LOJA (60d — janela atual + anterior)
        admin
          .from("store_daily_metrics")
          .select("metric_date, delivered, opened, clicked, conversion_value")
          .eq("store_id", storeId)
          .gte("metric_date", day60),
        // Campanhas recentes das DUAS plataformas (loja Klaviyo ficava sem nada)
        admin
          .from("klaviyo_campaign_metrics")
          .select("campaign_id, campaign_name, send_time, recipients, open_rate, conversion_value, fetched_at")
          .eq("store_id", storeId)
          .gte("send_time", d30)
          .order("send_time", { ascending: false })
          .limit(30),
        admin
          .from("omnisend_campaign_metrics")
          .select("campaign_id, campaign_name, send_time, recipients, open_rate, conversion_value, fetched_at")
          .eq("store_id", storeId)
          .gte("send_time", d30)
          .order("send_time", { ascending: false })
          .limit(30),
        admin
          .from("omnisend_flow_metrics")
          .select("flow_name, conversion_value")
          .eq("store_id", storeId)
          .gte("period_start", d30)
          .order("conversion_value", { ascending: false })
          .limit(3),
        admin
          .from("klaviyo_flow_metrics")
          .select("flow_name, conversion_value")
          .eq("store_id", storeId)
          .gte("period_start", d30)
          .order("conversion_value", { ascending: false })
          .limit(3),
        admin
          .from("store_alerts")
          .select("severity, title, created_at")
          .eq("store_id", storeId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(5),
        admin
          .from("crm_health_history")
          .select("health_score, computed_at")
          .eq("store_id", storeId)
          .lte("computed_at", d30)
          .order("computed_at", { ascending: false })
          .limit(1),
      ])

    const rows = <T,>(q: PromiseSettledResult<{ data: T[] | null }>): T[] =>
      q.status === "fulfilled" ? (q.value.data ?? []) : []

    // ── Tendência 30d vs 30d anteriores (série diária da loja) ──────
    const daily = rows<{
      metric_date: string
      delivered: number | null
      opened: number | null
      clicked: number | null
      conversion_value: number | string | null
    }>(dailyQ)
    const cur = { revenue: 0, delivered: 0, opened: 0, clicked: 0 }
    const prev = { revenue: 0, delivered: 0, opened: 0, clicked: 0 }
    for (const r of daily) {
      const bucket = r.metric_date >= day30 ? cur : prev
      bucket.revenue += Number(r.conversion_value ?? 0)
      bucket.delivered += r.delivered ?? 0
      bucket.opened += r.opened ?? 0
      bucket.clicked += r.clicked ?? 0
    }
    const revDelta =
      prev.revenue > 0
        ? ` (${cur.revenue >= prev.revenue ? "+" : ""}${(((cur.revenue - prev.revenue) / prev.revenue) * 100).toFixed(0)}% vs 30d anteriores)`
        : ""

    // Rótulo honesto: a série diária cobre CAMPANHAS — receita de flow
    // não entra aqui (mesma convenção do dashboard, "campanhas · diário").
    const trendBlock =
      daily.length > 0
        ? `TENDÊNCIA (30 dias vs 30 anteriores · campanhas, série diária — flows ficam FORA deste número; para o total do email consulte as tools):
- Receita atribuída (campanhas): ${fmtMoney(cur.revenue, store.currency)}${revDelta}
- Open rate: ${pct(cur.opened, cur.delivered)}${deltaPp({ n: cur.opened, d: cur.delivered }, { n: prev.opened, d: prev.delivered })}
- Click rate: ${pct(cur.clicked, cur.delivered)}${deltaPp({ n: cur.clicked, d: cur.delivered }, { n: prev.clicked, d: prev.delivered })}`
        : "TENDÊNCIA: sem série diária coletada ainda."

    // ── Campanhas recentes (dedup por campaign_id, fetched_at mais novo) ─
    type Camp = {
      campaign_id: string
      campaign_name: string | null
      send_time: string | null
      recipients: number | null
      open_rate: number | string | null
      conversion_value: number | string | null
      fetched_at: string | null
    }
    const byId = new Map<string, Camp>()
    for (const c of [...rows<Camp>(kCampQ), ...rows<Camp>(oCampQ)]) {
      const existing = byId.get(c.campaign_id)
      if (!existing || (c.fetched_at ?? "") > (existing.fetched_at ?? "")) {
        byId.set(c.campaign_id, c)
      }
    }
    const recentCampaigns = [...byId.values()]
      .sort((a, b) => (b.send_time ?? "").localeCompare(a.send_time ?? ""))
      .slice(0, 3)
    const campaignsBlock =
      recentCampaigns.length > 0
        ? `ÚLTIMAS CAMPANHAS:\n${recentCampaigns
            .map((c) => {
              const when = c.send_time
                ? new Date(c.send_time).toLocaleDateString("pt-BR")
                : "—"
              return `- ${c.campaign_name ?? c.campaign_id} (${when}): ${c.recipients ?? 0} envios · open ${Number(c.open_rate ?? 0).toFixed(1)}% · ${fmtMoney(Number(c.conversion_value ?? 0), store.currency)}`
            })
            .join("\n")}`
        : "ÚLTIMAS CAMPANHAS: nenhuma nos últimos 30 dias."

    // ── Top flows (duas plataformas) ────────────────────────────────
    // As tabelas guardam VÁRIAS janelas por flow (7d/15d/30d…) — sem
    // dedup por nome o mesmo flow saía 2x com valores divergentes.
    // Fica o MAIOR valor de cada flow, com rótulo de janela honesto.
    const bestByFlow = new Map<string, number>()
    for (const f of [
      ...rows<{ flow_name: string; conversion_value: number | string | null }>(flowsOQ),
      ...rows<{ flow_name: string; conversion_value: number | string | null }>(flowsKQ),
    ]) {
      const v = Number(f.conversion_value ?? 0)
      if (v > (bestByFlow.get(f.flow_name) ?? -1)) bestByFlow.set(f.flow_name, v)
    }
    const topFlows =
      [...bestByFlow.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, v]) => `${name} (${fmtMoney(v, store.currency)})`)
        .join(", ") || "nenhum flow com dados"

    // ── Alertas ativos ──────────────────────────────────────────────
    const alerts = rows<{ severity: string; title: string }>(alertsQ)
    const alertsBlock =
      alerts.length > 0
        ? `ALERTAS ATIVOS (investigue antes de concluir que está tudo bem):\n${alerts
            .map((a) => `- [${a.severity}] ${a.title}`)
            .join("\n")}`
        : ""

    // ── Health: valor atual + direção vs ~30d atrás ─────────────────
    const pastHealth = rows<{ health_score: number }>(healthQ)[0]?.health_score
    const healthTrend =
      store.health_score != null && pastHealth != null
        ? store.health_score > pastHealth
          ? ` (subiu de ${pastHealth} há 30d)`
          : store.health_score < pastHealth
            ? ` (caiu de ${pastHealth} há 30d)`
            : " (estável há 30d)"
        : ""

    return [
      `LOJA EM CONTEXTO:
- Nome: ${store.store_name}
- Plataforma: ${store.platform ?? "—"} · Email: ${store.email_platform ?? "—"}
- Nicho: ${store.niche ?? "—"} · País: ${store.country ?? "BR"}
- MRR: ${store.mrr_cents ? fmtBRL(store.mrr_cents / 100) : "não informado"}
- Health score: ${store.health_score ?? "—"}/100${healthTrend}
- Audiência: ${store.target_audience ?? "—"}`,
      trendBlock,
      campaignsBlock,
      `TOP FLOWS (maior valor entre as janelas sincronizadas recentes — não somar com a tendência): ${topFlows}`,
      alertsBlock,
    ]
      .filter(Boolean)
      .join("\n\n")
  } catch (e) {
    log.warn("buildStoreContext failed", e)
    return ""
  }
}

export async function buildClientContext(clientId: string): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data: client } = await admin
      .from("clients")
      .select("id, name, status, company")
      .eq("id", clientId)
      .maybeSingle()
    if (!client) return ""

    const { data: stores } = await admin
      .from("client_stores")
      .select("id, store_name, platform, health_score, mrr_cents")
      .eq("client_id", clientId)

    const storeList =
      (stores ?? [])
        .map(
          (s) =>
            `${s.store_name} (${s.platform ?? "—"}, health ${s.health_score ?? "—"})`,
        )
        .join(" / ") || "nenhuma loja"

    const totalMrr =
      (stores ?? []).reduce((s, x) => s + (x.mrr_cents ?? 0), 0) / 100

    return `CLIENTE EM CONTEXTO:
- Nome: ${client.name} (${client.company ?? "—"})
- Status: ${client.status}
- Lojas: ${storeList}
- MRR total: ${fmtBRL(totalMrr)}`
  } catch (e) {
    log.warn("buildClientContext failed", e)
    return ""
  }
}

export async function buildOrgContext(orgId: string): Promise<string> {
  try {
    const admin = createAdminClient()
    const [storesQ, clientsQ] = await Promise.all([
      admin.from("client_stores").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      admin.from("clients").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "active"),
    ])
    return `ORG EM CONTEXTO:
- Clientes ativos: ${clientsQ.count ?? 0}
- Lojas: ${storesQ.count ?? 0}`
  } catch (e) {
    log.warn("buildOrgContext failed", e)
    return ""
  }
}
