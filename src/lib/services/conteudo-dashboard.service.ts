/**
 * Dashboard Social — carrega as fontes (mídias sincronizadas, série diária,
 * comentários e conversas do CRM, negócios, agenda, histórico de seguidores)
 * e entrega ao módulo puro `lib/conteudo/dashboard/agregacao`.
 *
 * Nada aqui inventa número: fonte ausente vira `null` + aviso.
 */

import type { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  atribuirLeads,
  contarComentariosChave,
  dentro,
  diasEntre,
  diaSp,
  janelaAnterior,
  leadsDoPost,
  mediaParaPost,
  montarCadencia,
  montarFunil,
  montarKpis,
  montarMoldes,
  montarPilarMix,
  ordenarAgendados,
  seguidoresNoDia,
  serieSeguidores,
  seriePorDia,
  totais,
  type ComentarioRow,
  type DailyRow,
  type DealRow,
  type MediaRow,
  type ThreadRow,
} from "@/lib/conteudo/dashboard/agregacao"
import { PERFIL_CONSOLIDADO, type Agendado, type DashboardData, type DocStatus, type LeadDoPost, type Post } from "@/lib/conteudo/types"
import { spDayKey } from "./instagram-followers"
import { channelIgConfig, ensureChannelsSynced, fetchVisitasPerfil, type ChannelRow } from "./conteudo-instagram-sync.service"
import { historicoDoCanal, loadPerfis } from "./conteudo-perfis.service"

const log = logger.child("ConteudoDashboard")

type Admin = ReturnType<typeof createAdminClient>

const DIA_MS = 86_400_000
const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/

export function normalizarPeriodo(start?: string | null, end?: string | null): { start: string; end: string } {
  const hoje = spDayKey()
  const e = end && ISO_DIA.test(end) ? end : hoje
  const s = start && ISO_DIA.test(start) && start <= e ? start : new Date(Date.parse(`${e}T00:00:00Z`) - 29 * DIA_MS).toISOString().slice(0, 10)
  // teto de 400 dias (diasEntre também corta)
  return { start: s, end: e }
}

const IG_SOURCES = ["instagram", "inbox:instagram"]

interface ThreadDb extends ThreadRow {
  metadata?: Record<string, unknown> | null
}

interface MsgDb {
  thread_id: string
  body: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

interface DealDb {
  id: string
  lead_id: string | null
  status: string
  value: number | null
  created_at: string
  won_at: string | null
  source: string | null
  stage: { name: string | null } | null
}

interface AgendaDb {
  id: string
  documento_id: string
  channel_id: string | null
  data: string
  hora: string
  documento: { nome: string; status: string } | null
}

function menosDias(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - n * DIA_MS).toISOString().slice(0, 10)
}

/**
 * Negócios ligados ao Instagram: os das conversas do canal (por `deal_id` ou
 * `lead_id` da thread) e os criados com origem Instagram.
 *
 * `pipelines` NÃO tem org_id — o CRM inteiro escopa por `scope`/`is_archived`
 * (ver /api/crm/performance). Filtrar por uma coluna inexistente devolvia
 * erro, e erro silenciado aqui viraria receita zero sem aviso: por isso a
 * falha sobe como `erro` e a rota mostra no painel.
 */
async function carregarDeals(
  admin: Admin,
  threads: ThreadRow[],
  desdeIso: string,
): Promise<{ deals: DealDb[]; erro: string | null }> {
  const { data: pipes, error: pipeErr } = await admin.from("pipelines").select("id").eq("is_archived", false)
  if (pipeErr) {
    log.warn("pipelines indisponíveis", { error: pipeErr.message })
    return { deals: [], erro: `Negócios não puderam ser lidos: ${pipeErr.message}` }
  }
  const pipeIds = (pipes ?? []).map((p: { id: string }) => p.id)
  if (!pipeIds.length) return { deals: [], erro: null }

  const leadIds = [...new Set(threads.map((t) => t.lead_id).filter((x): x is string => Boolean(x)))]
  const dealIds = [...new Set(threads.map((t) => t.deal_id).filter((x): x is string => Boolean(x)))]
  const ors = [`source.in.(${IG_SOURCES.join(",")})`]
  if (leadIds.length) ors.push(`lead_id.in.(${leadIds.slice(0, 500).join(",")})`)
  if (dealIds.length) ors.push(`id.in.(${dealIds.slice(0, 500).join(",")})`)

  const { data, error } = await admin
    .from("deals")
    .select("id, lead_id, status, value, created_at, won_at, source, stage:pipeline_stages(name)")
    .in("pipeline_id", pipeIds)
    .neq("status", "archived")
    .gte("created_at", `${desdeIso}T00:00:00Z`)
    .or(ors.join(","))
    .limit(5000)
  if (error) {
    log.warn("deals indisponíveis", { error: error.message })
    return { deals: [], erro: `Negócios não puderam ser lidos: ${error.message}` }
  }
  return { deals: (data ?? []) as unknown as DealDb[], erro: null }
}

export interface DashboardOpts {
  perfil?: string | null
  start?: string | null
  end?: string | null
  /** Força a sincronização com a Graph API antes de montar. */
  force?: boolean
  /** Orçamento total de sync inline (ms). 0 = não sincroniza. */
  syncBudgetMs?: number
}

export async function carregarDashboard(admin: Admin, orgId: string, opts: DashboardOpts = {}): Promise<DashboardData> {
  const avisos: string[] = []
  const periodo = normalizarPeriodo(opts.start, opts.end)
  const anterior = janelaAnterior(periodo.start, periodo.end)
  const dias = diasEntre(periodo.start, periodo.end)
  const hoje = spDayKey()

  const { perfis, channels } = await loadPerfis(admin, orgId, { refresh: Boolean(opts.force) })
  const perfilSel = opts.perfil && opts.perfil !== PERFIL_CONSOLIDADO && channels.some((c) => c.id === opts.perfil) ? opts.perfil : PERFIL_CONSOLIDADO
  const canais: ChannelRow[] = perfilSel === PERFIL_CONSOLIDADO ? channels : channels.filter((c) => c.id === perfilSel)
  const canalIds = canais.map((c) => c.id)

  if (canais.length && (opts.syncBudgetMs ?? 0) > 0) {
    const r = await ensureChannelsSynced(admin, canais, { force: opts.force, budgetMs: opts.syncBudgetMs })
    for (const x of r) if (!x.ok && x.erro) avisos.push(`${canais.find((c) => c.id === x.channel_id)?.display_name ?? "Canal"}: ${x.erro}`)
  }
  for (const p of perfis) if (p.erro && canalIds.includes(p.id) && !avisos.some((a) => a.includes(p.erro!))) avisos.push(`${p.nome}: ${p.erro}`)

  if (!canais.length) {
    return {
      perfil: perfilSel,
      periodo,
      perfis,
      kpis: [],
      serieSeguidores: { dias, valores: dias.map(() => null) },
      posts: [],
      funil: [],
      pilarMix: { alvo: {}, real: {}, semClassificacao: 0, classificados: 0 },
      cadencia: [],
      agendados: [],
      moldes: montarMoldes([]),
      derivados: { postsPublicados: 0, comentarios: 0, comentariosChave: 0, alcanceParaLead: null, ticketMedio: null, negocios: 0, clientes: 0, receita: 0 },
      sincronizadoEm: null,
      avisos: ["Nenhum canal Instagram conectado. Conecte em Comercial → Canais."],
    }
  }

  const desdeAtrib = menosDias(anterior.start, 14)

  const [mediaRes, dailyRes, threadsRes, agendaRes] = await Promise.all([
    admin
      .from("conteudo_ig_media")
      .select(
        "channel_id, media_id, media_type, media_product_type, caption, permalink, media_url, thumbnail_url, published_at, children_count, like_count, comments_count, reach, saved, shares, follows, profile_visits, total_interactions, views, pilar, molde, palavra_chave, documento_id, documento:conteudo_documentos(nome)",
      )
      .in("channel_id", canalIds)
      .gte("published_at", `${anterior.start}T00:00:00Z`)
      .lte("published_at", `${periodo.end}T23:59:59Z`)
      .order("published_at", { ascending: false })
      .limit(1000),
    admin.from("conteudo_ig_daily").select("channel_id, day, reach, profile_views, follower_count").in("channel_id", canalIds).gte("day", anterior.start).lte("day", periodo.end),
    admin
      .from("crm_threads")
      .select("id, channel_id, contact_external_id, contact_name, contact_avatar_url, created_at, last_message_at, lead_id, deal_id, client_id, metadata")
      .in("channel_id", canalIds)
      .gte("last_message_at", `${desdeAtrib}T00:00:00Z`)
      .limit(5000),
    admin
      .from("conteudo_agenda")
      .select("id, documento_id, channel_id, data, hora, documento:conteudo_documentos(nome, status)")
      .eq("org_id", orgId)
      .gte("data", hoje)
      .order("data", { ascending: true })
      .limit(20),
  ])

  if (mediaRes.error) throw mediaRes.error
  const mediaRows: MediaRow[] = ((mediaRes.data ?? []) as unknown as Array<MediaRow & { documento: { nome: string } | null }>).map((m) => ({ ...m, documento_nome: m.documento?.nome ?? null }))
  const daily = (dailyRes.data ?? []) as DailyRow[]
  const threadsAll = ((threadsRes.data ?? []) as ThreadDb[]).filter((t) => canalIds.includes(t.channel_id))
  const commentThreads = threadsAll.filter((t) => t.contact_external_id.startsWith("comment:"))
  const dmThreads: ThreadRow[] = threadsAll.filter((t) => !t.contact_external_id.startsWith("comment:"))

  // Comentários do webhook (mensagens das threads "comment:<media>")
  let comentarios: ComentarioRow[] = []
  if (commentThreads.length) {
    const { data: msgs } = await admin
      .from("crm_messages")
      .select("thread_id, body, created_at, metadata")
      .in("thread_id", commentThreads.map((t) => t.id).slice(0, 1000))
      .gte("created_at", `${desdeAtrib}T00:00:00Z`)
      .limit(10000)
    const mediaPorThread = new Map(commentThreads.map((t) => [t.id, t.contact_external_id.slice("comment:".length)]))
    comentarios = ((msgs ?? []) as MsgDb[]).map((m) => ({
      media_id: (typeof m.metadata?.media_id === "string" ? m.metadata.media_id : mediaPorThread.get(m.thread_id)) ?? "",
      sender_id: typeof m.metadata?.sender_id === "string" ? m.metadata.sender_id : null,
      sender_username: typeof m.metadata?.sender_username === "string" ? m.metadata.sender_username : null,
      body: m.body,
      created_at: m.created_at,
    }))
  }

  const dealsRes = await carregarDeals(admin, dmThreads, anterior.start)
  if (dealsRes.erro) avisos.push(dealsRes.erro)
  const deals: DealRow[] = dealsRes.deals.map((d) => ({ id: d.id, lead_id: d.lead_id, status: d.status, value: d.value == null ? null : Number(d.value), created_at: d.created_at, won_at: d.won_at, source: d.source, stage_name: d.stage?.name ?? null }))

  const atrib = atribuirLeads(comentarios, dmThreads)
  const leadsNoPeriodo = (mediaId: string, s: string, e: string) => (atrib.porMidia.get(mediaId) ?? []).filter((t) => dentro(t.last_message_at, s, e)).length

  const posts: Post[] = mediaRows.filter((m) => dentro(m.published_at, periodo.start, periodo.end)).map((m) => mediaParaPost(m, leadsNoPeriodo(m.media_id, periodo.start, periodo.end)))
  const postsAnt: Post[] = mediaRows.filter((m) => dentro(m.published_at, anterior.start, anterior.end)).map((m) => mediaParaPost(m, leadsNoPeriodo(m.media_id, anterior.start, anterior.end)))

  const dealsGanhos = (s: string, e: string) => deals.filter((d) => d.status === "won" && dentro(d.won_at, s, e))
  const dailyAtual = daily.filter((d) => d.day >= periodo.start && d.day <= periodo.end)
  const dailyAnt = daily.filter((d) => d.day >= anterior.start && d.day <= anterior.end)
  const totAtual = totais(posts, dailyAtual, dealsGanhos(periodo.start, periodo.end))
  const totAnt = totais(postsAnt, dailyAnt, dealsGanhos(anterior.start, anterior.end))

  const historicos = canais.map((c) => ({ channel_id: c.id, history: historicoDoCanal(c) }))
  const serieSeg = serieSeguidores(historicos, dias)
  const seguidoresFim = seguidoresNoDia(historicos, periodo.end) ?? (perfis.filter((p) => canalIds.includes(p.id)).some((p) => p.seguidores != null) ? perfis.filter((p) => canalIds.includes(p.id)).reduce((a, p) => a + (p.seguidores ?? 0), 0) : null)
  const seguidoresInicio = seguidoresNoDia(historicos, menosDias(periodo.start, 1)) ?? seguidoresNoDia(historicos, periodo.start)
  if (serieSeg.valores.every((v) => v == null)) avisos.push("Histórico de seguidores ainda em coleta: o gráfico preenche a partir do primeiro snapshot diário.")

  const receitaSerie = dias.map((d) => dealsGanhos(d, d).reduce((a, x) => a + (x.value ?? 0), 0))
  const kpis = montarKpis({ dias, seguidoresFim, seguidoresInicio, serieSeg, atual: totAtual, anterior: totAnt, posts, receitaSerie })

  // Visitas ao perfil: total_value direto da Graph API (não há série por dia).
  let visitas: number | null = null
  if ((opts.syncBudgetMs ?? 0) > 0) {
    const rs = await Promise.all(canais.map((c) => fetchVisitasPerfil(channelIgConfig(c), periodo.start, periodo.end)))
    const ok = rs.filter((r) => r.ok)
    if (ok.length) visitas = ok.reduce((a, r) => a + (r.ok ? r.data : 0), 0)
    const falhas = rs.filter((r) => !r.ok)
    if (falhas.length && !ok.length) avisos.push(`Visitas ao perfil indisponíveis: ${falhas[0].ok ? "" : falhas[0].error.message}`)
  }

  const comentariosPeriodo = comentarios.filter((c) => dentro(c.created_at, periodo.start, periodo.end) && posts.some((p) => p.id === c.media_id))
  const kwPorMidia = new Map(posts.map((p) => [p.id, p.kw]))
  const comentariosChave = contarComentariosChave(comentariosPeriodo, kwPorMidia)
  const comentariosGraph = posts.reduce((a, p) => a + p.com, 0)
  const conversas = dmThreads.filter((t) => dentro(t.created_at, periodo.start, periodo.end)).length
  const negocios = deals.filter((d) => dentro(d.created_at, periodo.start, periodo.end)).length
  const ganhos = dealsGanhos(periodo.start, periodo.end)

  const funil = montarFunil({
    alcance: totAtual.alcance,
    visitasPerfil: visitas,
    comentariosChave,
    comentariosWebhook: comentariosPeriodo.length,
    comentariosGraph,
    conversas,
    negocios,
    clientes: ganhos.length,
  })

  const agendados: Agendado[] = ordenarAgendados(
    ((agendaRes.data ?? []) as unknown as AgendaDb[]).map((a) => ({
      id: a.id,
      documentoId: a.documento_id,
      nome: a.documento?.nome ?? "Carrossel",
      perfil: a.channel_id,
      data: a.data,
      hora: String(a.hora).slice(0, 5),
      status: ((a.documento?.status as DocStatus | undefined) ?? "agendado"),
    })),
    hoje,
  )

  const syncs = canais.map((c) => {
    const cc = c.config?.conteudo as { last_media_sync_at?: string } | undefined
    return cc?.last_media_sync_at ?? null
  })
  const sincronizadoEm = syncs.every((s) => s) ? syncs.sort()[0] : null
  if (!sincronizadoEm) avisos.push("Primeira sincronização com o Instagram ainda não concluiu. Clique em Atualizar dados.")

  return {
    perfil: perfilSel,
    periodo,
    perfis,
    kpis,
    serieSeguidores: serieSeg,
    posts,
    funil,
    pilarMix: montarPilarMix(posts),
    cadencia: montarCadencia(posts, perfis.filter((p) => canalIds.includes(p.id)), hoje),
    agendados,
    moldes: montarMoldes(posts),
    derivados: {
      postsPublicados: posts.length,
      comentarios: comentariosGraph,
      comentariosChave,
      alcanceParaLead: totAtual.alcance ? (totAtual.leads / totAtual.alcance) * 100 : null,
      ticketMedio: ganhos.length ? totAtual.receita / ganhos.length : null,
      negocios,
      clientes: ganhos.length,
      receita: totAtual.receita,
    },
    sincronizadoEm,
    avisos,
  }
}

/** Leads (conversas atribuídas) de um post, com estágio no CRM. */
export async function leadsDoPostService(admin: Admin, orgId: string, mediaId: string): Promise<{ leads: LeadDoPost[]; total: number }> {
  const { data: media } = await admin.from("conteudo_ig_media").select("channel_id, published_at").eq("org_id", orgId).eq("media_id", mediaId).maybeSingle()
  if (!media) return { leads: [], total: 0 }
  const { data: cthread } = await admin.from("crm_threads").select("id").eq("channel_id", media.channel_id).eq("contact_external_id", `comment:${mediaId}`).maybeSingle()
  let comentarios: ComentarioRow[] = []
  if (cthread) {
    const { data: msgs } = await admin.from("crm_messages").select("thread_id, body, created_at, metadata").eq("thread_id", cthread.id).limit(5000)
    comentarios = ((msgs ?? []) as MsgDb[]).map((m) => ({
      media_id: mediaId,
      sender_id: typeof m.metadata?.sender_id === "string" ? m.metadata.sender_id : null,
      sender_username: typeof m.metadata?.sender_username === "string" ? m.metadata.sender_username : null,
      body: m.body,
      created_at: m.created_at,
    }))
  }
  const desde = media.published_at ?? new Date(0).toISOString()
  const { data: threads } = await admin
    .from("crm_threads")
    .select("id, channel_id, contact_external_id, contact_name, contact_avatar_url, created_at, last_message_at, lead_id, deal_id, client_id")
    .eq("channel_id", media.channel_id)
    .not("contact_external_id", "like", "comment:%")
    .gte("last_message_at", desde)
    .limit(5000)
  const dm = (threads ?? []) as ThreadRow[]
  const atrib = atribuirLeads(comentarios, dm)
  const ts = atrib.porMidia.get(mediaId) ?? []
  const { deals } = await carregarDeals(admin, ts, diaSp(desde))
  const dealsMap = new Map(deals.map((d) => [d.id, { id: d.id, lead_id: d.lead_id, status: d.status, value: d.value == null ? null : Number(d.value), created_at: d.created_at, won_at: d.won_at, source: d.source, stage_name: d.stage?.name ?? null }]))
  return { leads: leadsDoPost(ts, dealsMap), total: ts.length }
}

export { seriePorDia }
