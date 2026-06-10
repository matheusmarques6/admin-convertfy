/**
 * Seed: Central de Campanhas — dados de desenvolvimento.
 *
 * Cria um ciclo `ready` + 6 sugestões (espelho do mockup) + 4 trends,
 * usando as lojas reais da org (targets apontam pra store_ids válidos).
 * Permite desenvolver a UI sem gastar chamadas de IA.
 *
 * Uso: node scripts/seed-campaign-central.mjs [org_id]
 *
 * Sem org_id, usa a org da primeira loja ativa.
 * Requer: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"

config({ path: ".env.local" })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local")
  process.exit(1)
}

const sb = createClient(supabaseUrl, serviceKey)

async function main() {
  let orgId = process.argv[2]

  const { data: stores, error: storesErr } = await sb
    .from("client_stores")
    .select("id, store_name, country, org_id, niche")
    .eq("is_active", true)
    .limit(20)
  if (storesErr) throw storesErr
  if (!stores?.length) throw new Error("Nenhuma loja ativa encontrada")

  if (!orgId) orgId = stores.find((s) => s.org_id)?.org_id
  if (!orgId) throw new Error("Nenhuma org_id encontrada — passe como argumento")

  const orgStores = stores.filter((s) => s.org_id === orgId)
  const pick = (i) => orgStores[i % orgStores.length]
  const target = (s) => ({
    store_id: s.id,
    store_name: s.store_name,
    country: (s.country || "BR").toUpperCase().slice(0, 2),
  })

  const today = new Date()
  const iso = (d) => d.toISOString().slice(0, 10)
  const plusDays = (n) => iso(new Date(today.getTime() + n * 86_400_000))

  // Ciclo
  const { data: lastCycle } = await sb
    .from("campaign_cycles")
    .select("number")
    .eq("org_id", orgId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: cycle, error: cycleErr } = await sb
    .from("campaign_cycles")
    .insert({
      org_id: orgId,
      number: (lastCycle?.number ?? 0) + 1,
      range_start: iso(today),
      range_end: plusDays(7),
      status: "ready",
      triggered_by: "manual",
      generated_at: new Date().toISOString(),
      next_run_at: plusDays(7) + "T01:00:00Z",
      context: {
        stores_scanned: orgStores.length,
        countries: [...new Set(orgStores.map((s) => (s.country || "BR").toUpperCase()))],
        seed: true,
      },
    })
    .select("id, number")
    .single()
  if (cycleErr) throw cycleErr
  console.log(`Ciclo ${cycle.number} criado (${cycle.id})`)

  // Trends
  const { data: trends, error: trendsErr } = await sb
    .from("campaign_trends")
    .insert([
      { org_id: orgId, cycle_id: cycle.id, title: "Clean girl aesthetic", source: "Google Trends", delta_label: "+180%", tag: "Beleza · skincare", niche: "beleza", country: "BR" },
      { org_id: orgId, cycle_id: cycle.id, title: "Presentes experienciais", source: "TikTok", delta_label: "+95%", tag: "Namorados · gifting", niche: "moda", country: "BR" },
      { org_id: orgId, cycle_id: cycle.id, title: "Dupes acessíveis", source: "TikTok", delta_label: "+140%", tag: "Cosméticos", niche: "beleza", country: "BR" },
      { org_id: orgId, cycle_id: cycle.id, title: "Coastal grandmother", source: "Pinterest", delta_label: "+60%", tag: "Moda · verão EU", niche: "moda", country: "UK" },
    ])
    .select("id, title")
  if (trendsErr) throw trendsErr
  console.log(`${trends.length} trends criadas`)

  // Sugestões (espelho do mockup)
  const suggestions = [
    {
      type: "data", confidence: 92, title: "Last call · Dia dos Namorados",
      trigger: { label: "Dia dos Namorados", detail: `em 2 dias · ${plusDays(2)}`, source: "Calendário BR" },
      targets: [target(pick(0)), target(pick(1))],
      target_summary: "2 lojas · Brasil",
      est_revenue: "R$ 42k",
      angle: "Urgência de entrega antes da data + curadoria de presentes até R$ 200. Bloco de 'ainda dá tempo' com prazo de entrega por CEP.",
      subject: "⏳ Ainda dá tempo: presentes que chegam até dia 12",
      channel: "Email + SMS", low_perf: false, send_date: plusDays(1),
    },
    {
      type: "performance", confidence: 85, title: "Reativação segmentada + A/B de subject",
      trigger: { label: "Receita −23% em 2 semanas", detail: "welcome flow desgastado · abertura −15%", source: "admin.metrics" },
      targets: [target(pick(2))],
      target_summary: `${pick(2).store_name}`,
      est_revenue: "R$ 12k",
      angle: "Atacar o welcome desgastado: A/B de subject (curiosidade vs benefício) + onda de reativação só nos engajados 30d para proteger reputação.",
      subject: "A gente sumiu? Tem novidade pra você 👀",
      channel: "Email", low_perf: true, send_date: plusDays(3),
    },
    {
      type: "tema", confidence: 78, title: "Clean girl: rotina de skincare mínima",
      trigger: { label: "Clean girl aesthetic", detail: "+180% buscas", source: "Google Trends" },
      trend_id: trends[0].id,
      targets: [target(pick(3))],
      target_summary: `${pick(3).store_name} · beleza`,
      est_revenue: "R$ 18k",
      angle: "Kit '3 passos clean girl' com bundle de margem alta. Educacional no topo, oferta de combo no rodapé.",
      subject: "A rotina de 3 passos que tá em todo lugar",
      channel: "Email", low_perf: false, send_date: plusDays(4),
    },
    {
      type: "data", confidence: 81, title: "Father's Day gift guide",
      trigger: { label: "Father's Day", detail: `em 11 dias · ${plusDays(11)}`, source: "Calendário UK/US" },
      targets: [target(pick(4))],
      target_summary: `${pick(4).store_name}`,
      est_revenue: "R$ 9k",
      angle: "Guia de presentes por faixa de preço. Enviar 7-10 dias antes converte melhor. CTA para coleção masculina.",
      subject: "The Father's Day edit — sorted in 2 clicks",
      channel: "Email", low_perf: false, send_date: plusDays(4),
    },
    {
      type: "email", confidence: 74, title: 'Replicar "Gift guide: últimas 48h"',
      trigger: { label: "Campanha campeã na rede", detail: "41,2% abertura · +12pp", source: "Benchmark Convertfy" },
      targets: [target(pick(5)), target(pick(6))],
      target_summary: "2 lojas · moda",
      est_revenue: "R$ 15k",
      angle: "Estrutura que performou em 6 lojas de moda: assunto de urgência + grid de 6 produtos + selo de prazo. Adaptar curadoria por loja.",
      subject: "Gift guide: últimas 48h ⏳",
      channel: "Email", low_perf: false, send_date: plusDays(5),
    },
    {
      type: "performance", confidence: 80, title: "Win-back da lista quente (limpeza + oferta)",
      trigger: { label: "1.847 inativos na lista quente", detail: "reputação de domínio em risco", source: "omnisend.lists" },
      targets: [target(pick(7))],
      target_summary: `${pick(7).store_name}`,
      est_revenue: "R$ 8k",
      angle: "Última tentativa de reengajar antes de limpar: oferta forte só pros inativos, depois sunset automático de quem não abrir.",
      subject: "Sua última chance (a gente vai sentir saudade)",
      channel: "Email", low_perf: true, send_date: plusDays(2),
    },
  ]

  const { error: suggErr } = await sb.from("campaign_suggestions").insert(
    suggestions.map((s) => ({ org_id: orgId, cycle_id: cycle.id, source: "ai", status: "suggested", ...s })),
  )
  if (suggErr) throw suggErr
  console.log(`${suggestions.length} sugestões criadas`)
  console.log("Seed concluído ✓")
}

main().catch((err) => {
  console.error("Seed falhou:", err.message || err)
  process.exit(1)
})
