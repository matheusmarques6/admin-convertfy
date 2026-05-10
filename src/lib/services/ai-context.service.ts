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

export async function buildStoreContext(storeId: string): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data: store } = await admin
      .from("client_stores")
      .select(
        "id, store_name, platform, niche, country, target_audience, health_score, mrr_cents, currency",
      )
      .eq("id", storeId)
      .maybeSingle()
    if (!store) return ""

    // Metricas dos ultimos 30 dias
    const thirtyAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    const { data: campaigns } = await admin
      .from("omnisend_campaign_metrics")
      .select("conversion_value, recipients, opened, clicked")
      .eq("store_id", storeId)
      .gte("send_time", thirtyAgo.toISOString())

    const totalRevenue =
      campaigns?.reduce((s, c) => s + Number(c.conversion_value ?? 0), 0) ?? 0
    const totalRecipients = campaigns?.reduce((s, c) => s + (c.recipients ?? 0), 0) ?? 0
    const totalOpened = campaigns?.reduce((s, c) => s + (c.opened ?? 0), 0) ?? 0
    const openRate =
      totalRecipients > 0
        ? ((totalOpened / totalRecipients) * 100).toFixed(1)
        : "0"

    const { data: flows } = await admin
      .from("omnisend_flow_metrics")
      .select("flow_name, conversion_value")
      .eq("store_id", storeId)
      .gte("period_start", thirtyAgo.toISOString())
      .order("conversion_value", { ascending: false })
      .limit(3)

    const topFlows =
      (flows ?? [])
        .map((f) => `${f.flow_name} (${fmtBRL(Number(f.conversion_value ?? 0))})`)
        .join(", ") || "nenhum flow com dados"

    return `LOJA EM CONTEXTO:
- Nome: ${store.store_name}
- Plataforma: ${store.platform ?? "—"}
- Nicho: ${store.niche ?? "—"} · País: ${store.country ?? "BR"}
- MRR: ${store.mrr_cents ? fmtBRL(store.mrr_cents / 100) : "não informado"}
- Health score: ${store.health_score ?? "—"}/100
- Audiencia: ${store.target_audience ?? "—"}

ÚLTIMOS 30 DIAS:
- Receita atribuida (campanhas): ${fmtBRL(totalRevenue)}
- ${campaigns?.length ?? 0} campanhas enviadas a ${totalRecipients} destinatarios
- Taxa de abertura: ${openRate}%
- Top flows: ${topFlows}`
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
