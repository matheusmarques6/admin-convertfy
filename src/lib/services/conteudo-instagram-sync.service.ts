/**
 * Sincronização do Instagram para o módulo Conteúdo.
 *
 * Lê da Graph API (v20) as mídias da conta com insights por post e a série
 * diária da conta (alcance, seguidores) e grava em `conteudo_ig_media` /
 * `conteudo_ig_daily`. O dashboard lê SEMPRE do banco: a Graph API entra só
 * aqui, com orçamento de tempo, e cada falha fica registrada na linha
 * (`insights_error`) em vez de derrubar a página.
 *
 * Métricas por tipo (a Meta muda o conjunto aceito por mídia — o fetch tenta
 * do conjunto mais rico para o mais básico):
 *   FEED (IMAGE/CAROUSEL): reach, saved, shares, total_interactions, follows, profile_visits
 *   REELS/VIDEO:           reach, saved, shares, total_interactions, views
 *
 * O histórico é trazido POR INTEIRO (backfill com cursor retomável): o
 * dashboard permite qualquer período, e limitar a coleta a uma janela fixa
 * faria período antigo aparecer vazio como se não houvesse post.
 */

import type { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { resolveAndHealInstagramChannel } from "./instagram-activity.service"
import type { InstagramChannelConfig } from "./instagram-graph.service"

const log = logger.child("ConteudoIgSync")

const API_VERSION = "v20.0"
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`
const DIA_MS = 86_400_000

/** Insights de post recente (≤ 30 dias) renovam a cada 6 h; antigos, 1x/dia. */
const INSIGHTS_TTL_RECENTE_MS = 6 * 3600_000
const INSIGHTS_TTL_ANTIGO_MS = 24 * 3600_000
/** Sync geral considerado fresco por 30 min (o dashboard não re-sincroniza antes). */
export const SYNC_TTL_MS = 30 * 60_000

type Admin = ReturnType<typeof createAdminClient>

export interface ChannelRow {
  id: string
  org_id: string
  type: string
  display_name: string
  external_id: string
  config: Record<string, unknown> | null
  is_active: boolean
}

export interface IgErro {
  code: string
  message: string
  /** Código numérico da Meta (190 token, 100 campo/permissão…). */
  meta?: number
}

type Res<T> = { ok: true; data: T } | { ok: false; error: IgErro }

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number; type?: string }
}

async function graph<T>(config: InstagramChannelConfig, path: string): Promise<Res<T>> {
  if (!config.access_token) return { ok: false, error: { code: "config_missing", message: "Canal sem access_token" } }
  try {
    const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${config.access_token}` }, cache: "no-store" })
    const body = (await res.json().catch(() => ({}))) as T & GraphErrorBody
    if (!res.ok || body.error) {
      const meta = body.error?.code
      const msg = body.error?.message || `HTTP ${res.status}`
      const message =
        meta === 190
          ? `A Meta recusou o token do canal (190): ${msg}. Reconecte o canal em Comercial → Canais.`
          : meta === 100
            ? `Consulta não reconhecida (#100): ${msg}`
            : msg
      return { ok: false, error: { code: `graph_${meta ?? res.status}`, message, meta } }
    }
    return { ok: true, data: body }
  } catch (e) {
    return { ok: false, error: { code: "network_error", message: e instanceof Error ? e.message : "Erro de rede" } }
  }
}

export function channelIgConfig(channel: ChannelRow): InstagramChannelConfig {
  const c = channel.config ?? {}
  return {
    instagram_business_account_id:
      (typeof c.instagram_business_account_id === "string" ? c.instagram_business_account_id : null) || channel.external_id,
    access_token: typeof c.access_token === "string" ? c.access_token : "",
    facebook_page_id: typeof c.facebook_page_id === "string" ? c.facebook_page_id : null,
  }
}

export async function loadIgChannels(admin: Admin, orgId: string, onlyActive = true): Promise<ChannelRow[]> {
  let q = admin
    .from("crm_channels")
    .select("id, org_id, type, display_name, external_id, config, is_active")
    .eq("org_id", orgId)
    .eq("type", "instagram")
    .order("created_at", { ascending: true })
  if (onlyActive) q = q.eq("is_active", true)
  const { data, error } = await q.returns<ChannelRow[]>()
  if (error) throw error
  return data ?? []
}

// ── Mídias ──────────────────────────────────────────────────────────────

interface RawMedia {
  id: string
  caption?: string
  media_type?: string
  media_product_type?: string
  permalink?: string
  media_url?: string
  thumbnail_url?: string
  timestamp?: string
  like_count?: number
  comments_count?: number
  children?: { data?: Array<{ id: string }> }
}

const MEDIA_FIELDS =
  "id,caption,media_type,media_product_type,permalink,media_url,thumbnail_url,timestamp,like_count,comments_count,children{id}"

export function primeiraPaginaMedia(config: InstagramChannelConfig): string {
  return `/${config.instagram_business_account_id}/media?fields=${encodeURIComponent(MEDIA_FIELDS)}&limit=50`
}

/** `paging.next` é URL absoluta; guardamos só o path relativo à versão. */
export function pathDoNext(next: string | undefined): string | null {
  if (!next) return null
  const i = next.indexOf(`/${API_VERSION}`)
  return i >= 0 ? next.slice(i + API_VERSION.length + 1) : null
}

export interface PaginaMedia {
  midias: RawMedia[]
  /** Path da próxima página; null quando chegou ao fim do perfil. */
  proxima: string | null
  paginas: number
  /** Publicação mais antiga vista nesta varredura. */
  maisAntiga: string | null
}

/**
 * Varre mídias a partir de um cursor (ou do topo do perfil), respeitando um
 * teto de páginas e um `desdeIso` opcional.
 *
 * O histórico inteiro pode ter centenas de posts, e uma request de rota tem
 * orçamento curto: por isso a varredura DEVOLVE o cursor em vez de insistir.
 * Quem chama grava o cursor e continua no próximo tick — é o que faz o
 * backfill terminar sem estourar timeout.
 */
export async function varrerMedia(
  config: InstagramChannelConfig,
  opts: { cursor?: string | null; maxPaginas?: number; desdeIso?: string | null; ateMs?: number } = {},
): Promise<Res<PaginaMedia>> {
  const out: RawMedia[] = []
  let path: string | null = opts.cursor || primeiraPaginaMedia(config)
  let paginas = 0
  const max = opts.maxPaginas ?? 6

  while (path && paginas < max) {
    if (opts.ateMs && Date.now() > opts.ateMs) break
    const res: Res<{ data?: RawMedia[]; paging?: { next?: string } }> = await graph(config, path)
    if (!res.ok) {
      // Falha no meio da varredura não descarta o que já veio: grava o lote e
      // mantém o cursor para retomar.
      return out.length ? { ok: true, data: { midias: out, proxima: path, paginas, maisAntiga: maisAntigaDe(out) } } : res
    }
    const lote = res.data.data ?? []
    out.push(...lote)
    paginas++
    const ultima = lote[lote.length - 1]?.timestamp
    path = pathDoNext(res.data.paging?.next)
    if (!lote.length) break
    if (opts.desdeIso && ultima && ultima < opts.desdeIso) {
      // Alcançou a borda da janela pedida: não é fim de perfil, mas basta.
      return { ok: true, data: { midias: out.filter((m) => !m.timestamp || m.timestamp >= opts.desdeIso!), proxima: null, paginas, maisAntiga: maisAntigaDe(out) } }
    }
  }
  return { ok: true, data: { midias: out, proxima: path, paginas, maisAntiga: maisAntigaDe(out) } }
}

function maisAntigaDe(m: RawMedia[]): string | null {
  return m.reduce<string | null>((a, x) => (x.timestamp && (!a || x.timestamp < a) ? x.timestamp : a), null)
}

export interface MediaInsights {
  reach: number | null
  saved: number | null
  shares: number | null
  total_interactions: number | null
  follows: number | null
  profile_visits: number | null
  views: number | null
}

const SETS_FEED = [
  ["reach", "saved", "shares", "total_interactions", "follows", "profile_visits"],
  ["reach", "saved", "shares", "total_interactions"],
  ["reach", "saved"],
]
const SETS_VIDEO = [
  ["reach", "saved", "shares", "total_interactions", "views"],
  ["reach", "saved", "shares"],
  ["reach", "saved"],
]

interface RawInsight {
  name: string
  values?: Array<{ value?: number | Record<string, number>; end_time?: string }>
  total_value?: { value?: number }
}

function valorInsight(i: RawInsight): number | null {
  const tv = i.total_value?.value
  if (typeof tv === "number") return tv
  const v = i.values?.[0]?.value
  return typeof v === "number" ? v : null
}

/** Insights de uma mídia, do conjunto mais rico ao mais básico. */
export async function fetchMediaInsights(config: InstagramChannelConfig, mediaId: string, mediaType: string | null): Promise<Res<MediaInsights>> {
  const sets = mediaType === "VIDEO" ? SETS_VIDEO : SETS_FEED
  let ultimo: IgErro | null = null
  for (const set of sets) {
    const res = await graph<{ data?: RawInsight[] }>(config, `/${mediaId}/insights?metric=${set.join(",")}`)
    if (res.ok) {
      const out: MediaInsights = { reach: null, saved: null, shares: null, total_interactions: null, follows: null, profile_visits: null, views: null }
      for (const i of res.data.data ?? []) {
        if (i.name in out) (out as unknown as Record<string, number | null>)[i.name] = valorInsight(i)
      }
      return { ok: true, data: out }
    }
    ultimo = res.error
    // #100 "metric[x] must be one of…" → tenta o conjunto menor; outro erro (token, permissão) não adianta insistir.
    if (res.error.meta !== 100) break
  }
  return { ok: false, error: ultimo ?? { code: "unknown", message: "Sem insights" } }
}

// ── Série diária da conta ───────────────────────────────────────────────

export interface DiaConta {
  day: string
  reach: number | null
  follower_count: number | null
}

const unix = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000)

/**
 * `reach` e `follower_count` por dia (period=day, janela ≤ 30 dias). O
 * `follower_count` falha em conta com menos de 100 seguidores — fica null.
 */
export async function fetchContaDiaria(config: InstagramChannelConfig, startIso: string, endIso: string): Promise<Res<DiaConta[]>> {
  const since = unix(startIso)
  const until = unix(endIso) + 86_399
  const porDia = new Map<string, DiaConta>()
  const aplicar = (name: "reach" | "follower_count", raw: RawInsight[] | undefined) => {
    for (const i of raw ?? []) {
      if (i.name !== name) continue
      for (const v of i.values ?? []) {
        if (!v.end_time || typeof v.value !== "number") continue
        // end_time é o fim do dia em UTC-7 (Pacific); o dia do dado é o anterior.
        const day = new Date(Date.parse(v.end_time) - DIA_MS).toISOString().slice(0, 10)
        const row = porDia.get(day) ?? { day, reach: null, follower_count: null }
        row[name] = v.value
        porDia.set(day, row)
      }
    }
  }
  const reach = await graph<{ data?: RawInsight[] }>(config, `/${config.instagram_business_account_id}/insights?metric=reach&period=day&since=${since}&until=${until}`)
  if (!reach.ok) return reach
  aplicar("reach", reach.data.data)
  const fc = await graph<{ data?: RawInsight[] }>(config, `/${config.instagram_business_account_id}/insights?metric=follower_count&period=day&since=${since}&until=${until}`)
  if (fc.ok) aplicar("follower_count", fc.data.data)
  return { ok: true, data: [...porDia.values()].sort((a, b) => a.day.localeCompare(b.day)) }
}

/** Total de visitas ao perfil no intervalo (metric_type=total_value, blocos de ≤ 30 dias). */
export async function fetchVisitasPerfil(config: InstagramChannelConfig, startIso: string, endIso: string): Promise<Res<number>> {
  let total = 0
  let a = Date.parse(`${startIso}T00:00:00Z`)
  const fim = Date.parse(`${endIso}T00:00:00Z`)
  let blocos = 0
  while (a <= fim && blocos < 6) {
    const b = Math.min(fim, a + 29 * DIA_MS)
    const res = await graph<{ data?: RawInsight[] }>(
      config,
      `/${config.instagram_business_account_id}/insights?metric=profile_views&period=day&metric_type=total_value&since=${Math.floor(a / 1000)}&until=${Math.floor(b / 1000) + 86_399}`,
    )
    if (!res.ok) return res
    total += valorInsight(res.data.data?.[0] ?? { name: "profile_views" }) ?? 0
    a = b + DIA_MS
    blocos++
  }
  return { ok: true, data: total }
}

// ── Sync ────────────────────────────────────────────────────────────────

export interface SyncResultado {
  channel_id: string
  ok: boolean
  midias: number
  insights_atualizados: number
  dias: number
  /** Estado do backfill do histórico neste canal. */
  backfill: { completo: boolean; paginas: number; restante: boolean }
  erro?: string
}

interface MediaLinha {
  media_id: string
  media_type: string | null
  published_at: string | null
  insights_at: string | null
}

function linhaDaMedia(channel: ChannelRow, m: RawMedia, agoraIso: string) {
  return {
    org_id: channel.org_id,
    channel_id: channel.id,
    media_id: m.id,
    media_type: m.media_type ?? null,
    media_product_type: m.media_product_type ?? null,
    caption: m.caption ?? null,
    permalink: m.permalink ?? null,
    media_url: m.media_url ?? null,
    thumbnail_url: m.thumbnail_url ?? m.media_url ?? null,
    published_at: m.timestamp ?? null,
    children_count: m.children?.data?.length ?? null,
    like_count: typeof m.like_count === "number" ? m.like_count : null,
    comments_count: typeof m.comments_count === "number" ? m.comments_count : null,
    synced_at: agoraIso,
  }
}

/**
 * Sincroniza um canal: mídias + insights + série diária da conta.
 *
 * Duas passadas de mídia, sempre nesta ordem:
 *  1. TOPO — as páginas mais recentes, que também atualizam curtidas e
 *     comentários dos posts já conhecidos.
 *  2. BACKFILL — enquanto o canal não tiver o histórico inteiro, continua
 *     paginando do cursor salvo. O perfil pode ter centenas de posts e a
 *     request tem orçamento curto, então o cursor é persistido e a próxima
 *     execução (botão ou cron) retoma exatamente de onde parou.
 */
export async function syncChannelConteudo(
  admin: Admin,
  channel: ChannelRow,
  opts: { budgetMs?: number; agora?: Date } = {},
): Promise<SyncResultado> {
  const inicio = Date.now()
  const budget = opts.budgetMs ?? 20_000
  const ateMs = inicio + budget
  const agora = opts.agora ?? new Date()
  const agoraIso = agora.toISOString()
  const resultado: SyncResultado = {
    channel_id: channel.id,
    ok: true,
    midias: 0,
    insights_atualizados: 0,
    dias: 0,
    backfill: { completo: false, paginas: 0, restante: false },
  }

  const storedConfig = channel.config ?? {}
  const healed = await resolveAndHealInstagramChannel(admin, channel, storedConfig, channelIgConfig(channel))
  const config = healed.config
  const rawConfig = healed.rawConfig
  const conteudoAtual = (typeof rawConfig.conteudo === "object" && rawConfig.conteudo ? rawConfig.conteudo : {}) as Record<string, unknown>
  let cursor = typeof conteudoAtual.media_cursor === "string" ? conteudoAtual.media_cursor : null
  let backfillCompleto = conteudoAtual.backfill_done === true
  let maisAntiga = typeof conteudoAtual.media_oldest_at === "string" ? conteudoAtual.media_oldest_at : null

  const gravarMidias = async (lista: RawMedia[]): Promise<string | null> => {
    if (!lista.length) return null
    const { error } = await admin
      .from("conteudo_ig_media")
      .upsert(lista.map((m) => linhaDaMedia(channel, m, agoraIso)), { onConflict: "channel_id,media_id" })
    if (error) {
      log.error("[ConteudoIgSync] upsert mídias", { channel: channel.id, error: error.message })
      return error.message
    }
    resultado.midias += lista.length
    return null
  }

  // 1. Topo do perfil (novidades + contadores atualizados).
  const topo = await varrerMedia(config, { maxPaginas: 2, ateMs })
  if (!topo.ok) {
    log.warn("[ConteudoIgSync] mídias indisponíveis", { channel: channel.id, error: topo.error })
    return { ...resultado, ok: false, erro: topo.error.message }
  }
  const erroTopo = await gravarMidias(topo.data.midias)
  if (erroTopo) return { ...resultado, ok: false, erro: erroTopo }
  if (topo.data.maisAntiga && (!maisAntiga || topo.data.maisAntiga < maisAntiga)) maisAntiga = topo.data.maisAntiga
  // Perfil curto: o topo já alcançou o fim, então o histórico está completo.
  if (!topo.data.proxima) backfillCompleto = true

  // 2. Backfill do histórico, retomando do cursor.
  if (!backfillCompleto && Date.now() < ateMs) {
    const passo = await varrerMedia(config, { cursor, maxPaginas: 20, ateMs })
    if (passo.ok) {
      const erro = await gravarMidias(passo.data.midias)
      if (erro) return { ...resultado, ok: false, erro }
      resultado.backfill.paginas = passo.data.paginas
      if (passo.data.maisAntiga && (!maisAntiga || passo.data.maisAntiga < maisAntiga)) maisAntiga = passo.data.maisAntiga
      cursor = passo.data.proxima
      if (!cursor) backfillCompleto = true
    } else {
      log.warn("[ConteudoIgSync] backfill interrompido", { channel: channel.id, error: passo.error.message })
    }
  }
  resultado.backfill.completo = backfillCompleto
  resultado.backfill.restante = !backfillCompleto

  // Insights: sem insight primeiro, depois os mais defasados. O histórico
  // inteiro pode levar várias rodadas — o cron continua de onde parou.
  const { data: pendentes } = await admin
    .from("conteudo_ig_media")
    .select("media_id, media_type, published_at, insights_at")
    .eq("channel_id", channel.id)
    .order("insights_at", { ascending: true, nullsFirst: true })
    .order("published_at", { ascending: false })
    .limit(200)
    .returns<MediaLinha[]>()

  for (const m of pendentes ?? []) {
    if (Date.now() - inicio > budget) break
    const idade = m.published_at ? agora.getTime() - Date.parse(m.published_at) : Infinity
    const ttl = idade <= 30 * DIA_MS ? INSIGHTS_TTL_RECENTE_MS : INSIGHTS_TTL_ANTIGO_MS
    if (m.insights_at && agora.getTime() - Date.parse(m.insights_at) < ttl) continue
    const ins = await fetchMediaInsights(config, m.media_id, m.media_type)
    const patch = ins.ok
      ? { ...ins.data, insights_at: agora.toISOString(), insights_error: null }
      : { insights_at: agora.toISOString(), insights_error: ins.error.message }
    const { error } = await admin.from("conteudo_ig_media").update(patch).eq("channel_id", channel.id).eq("media_id", m.media_id)
    if (!error && ins.ok) resultado.insights_atualizados++
    if (!ins.ok && ins.error.meta === 190) {
      resultado.ok = false
      resultado.erro = ins.error.message
      break
    }
  }

  // Série diária (últimos 30 dias) — best-effort.
  if (Date.now() - inicio < budget) {
    const fim = agora.toISOString().slice(0, 10)
    const ini = new Date(agora.getTime() - 29 * DIA_MS).toISOString().slice(0, 10)
    const diaria = await fetchContaDiaria(config, ini, fim)
    if (diaria.ok && diaria.data.length) {
      const { error } = await admin.from("conteudo_ig_daily").upsert(
        diaria.data.map((d) => ({ org_id: channel.org_id, channel_id: channel.id, day: d.day, reach: d.reach, follower_count: d.follower_count, synced_at: agora.toISOString() })),
        { onConflict: "channel_id,day" },
      )
      if (!error) resultado.dias = diaria.data.length
    } else if (!diaria.ok) {
      log.warn("[ConteudoIgSync] série diária indisponível", { channel: channel.id, error: diaria.error.message })
    }
  }

  // Carimbo do sync + estado do backfill no config (sem tocar no resto).
  await admin
    .from("crm_channels")
    .update({
      config: {
        ...rawConfig,
        conteudo: {
          ...conteudoAtual,
          last_media_sync_at: agoraIso,
          last_media_sync_error: resultado.ok ? null : resultado.erro ?? null,
          media_cursor: backfillCompleto ? null : cursor,
          backfill_done: backfillCompleto,
          ...(maisAntiga ? { media_oldest_at: maisAntiga } : {}),
        },
      },
    })
    .eq("id", channel.id)

  log.info("[ConteudoIgSync] canal sincronizado", { ...resultado, ms: Date.now() - inicio })
  return resultado
}

export function lastSyncAt(channel: ChannelRow): string | null {
  const c = channel.config?.conteudo
  if (c && typeof c === "object" && typeof (c as Record<string, unknown>).last_media_sync_at === "string") {
    return (c as Record<string, string>).last_media_sync_at
  }
  return null
}

/** O canal já trouxe o histórico inteiro do perfil? */
export function backfillPendente(channel: ChannelRow): boolean {
  const c = channel.config?.conteudo
  return !(c && typeof c === "object" && (c as Record<string, unknown>).backfill_done === true)
}

/**
 * Sincroniza os canais defasados dentro do orçamento total. Canal com
 * histórico pendente NÃO espera o TTL: enquanto o backfill não termina, cada
 * abertura do dashboard avança mais um pedaço.
 */
export async function ensureChannelsSynced(
  admin: Admin,
  channels: ChannelRow[],
  opts: { force?: boolean; budgetMs?: number } = {},
): Promise<SyncResultado[]> {
  const inicio = Date.now()
  const budget = opts.budgetMs ?? 25_000
  const out: SyncResultado[] = []
  for (const ch of channels) {
    const restante = budget - (Date.now() - inicio)
    if (restante < 3_000) break
    const last = lastSyncAt(ch)
    const fresco = last && Date.now() - Date.parse(last) < SYNC_TTL_MS
    if (!opts.force && fresco && !backfillPendente(ch)) continue
    out.push(await syncChannelConteudo(admin, ch, { budgetMs: Math.min(restante - 1_000, 20_000) }))
  }
  return out
}
