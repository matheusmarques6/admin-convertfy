/**
 * Agregação do Dashboard Social — funções PURAS sobre linhas já lidas do
 * banco (mídias sincronizadas da Graph API, threads/comentários do CRM,
 * negócios, histórico de seguidores). O service carrega, isto calcula, a
 * rota devolve. Nenhum número é inventado: quando a fonte não existe o
 * campo sai `null` e a UI mostra "sem dado".
 */

import type { FollowerSnapshot } from "@/lib/services/instagram-followers"
import { MIX_ALVO } from "../config"
import { ST_TEMPLATES, moldeKeyDoTemplate } from "../templates"
import type {
  Agendado,
  Cadencia,
  Formato,
  FunilEtapa,
  Kpi,
  LeadDoPost,
  MoldeKey,
  MoldeResumo,
  Perfil,
  Pilar,
  PilarMix,
  Post,
  SerieSeguidores,
} from "../types"

// ── Linhas de entrada (espelham as tabelas) ─────────────────────────────

export interface MediaRow {
  channel_id: string
  media_id: string
  media_type: string | null
  media_product_type: string | null
  caption: string | null
  permalink: string | null
  media_url: string | null
  thumbnail_url: string | null
  published_at: string | null
  children_count: number | null
  like_count: number | null
  comments_count: number | null
  reach: number | null
  saved: number | null
  shares: number | null
  follows: number | null
  profile_visits: number | null
  total_interactions: number | null
  views: number | null
  pilar: string | null
  molde: string | null
  palavra_chave: string | null
  documento_id: string | null
  documento_nome?: string | null
}

export interface ComentarioRow {
  media_id: string
  sender_id: string | null
  sender_username: string | null
  body: string | null
  created_at: string
}

export interface ThreadRow {
  id: string
  channel_id: string
  contact_external_id: string
  contact_name: string | null
  contact_avatar_url: string | null
  created_at: string
  last_message_at: string
  lead_id: string | null
  deal_id: string | null
  client_id: string | null
}

export interface DealRow {
  id: string
  lead_id: string | null
  status: string
  value: number | null
  created_at: string
  won_at: string | null
  source: string | null
  stage_name?: string | null
}

export interface DailyRow {
  channel_id: string
  day: string
  reach: number | null
  profile_views: number | null
  follower_count: number | null
}

export interface HistoricoCanal {
  channel_id: string
  history: FollowerSnapshot[]
}

// ── Datas ───────────────────────────────────────────────────────────────

const DIA_MS = 86_400_000

export function diaIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

/** Lista de dias YYYY-MM-DD entre start e end (inclusive). */
export function diasEntre(start: string, end: string): string[] {
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return []
  const out: string[] = []
  for (let t = a; t <= b; t += DIA_MS) out.push(diaIso(new Date(t)))
  return out.slice(0, 400)
}

/** Janela imediatamente anterior, com o mesmo número de dias. */
export function janelaAnterior(start: string, end: string): { start: string; end: string } {
  const n = diasEntre(start, end).length || 1
  const a = Date.parse(`${start}T00:00:00Z`)
  return { start: diaIso(new Date(a - n * DIA_MS)), end: diaIso(new Date(a - DIA_MS)) }
}

/** Dia local (America/Sao_Paulo) de um ISO. */
export function diaSp(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))
}

export function dentro(iso: string | null, start: string, end: string): boolean {
  if (!iso) return false
  const d = diaSp(iso)
  return d >= start && d <= end
}

function ddmm(iso: string): string {
  const d = diaSp(iso)
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`
}

// ── Formatação ──────────────────────────────────────────────────────────

export const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR")
export const fmtMoney = (n: number) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`

/** "+6,2%" / "−3,1%" / "+0,0%"; null quando a base é zero ou não existe. */
export function deltaPct(atual: number | null, anterior: number | null): string | null {
  if (atual == null || anterior == null || anterior === 0) return null
  const p = ((atual - anterior) / Math.abs(anterior)) * 100
  const s = Math.abs(p).toFixed(1).replace(".", ",")
  return `${p < 0 ? "−" : "+"}${s}%`
}

// ── Posts ───────────────────────────────────────────────────────────────

export function formatoDaMidia(media_type: string | null, product_type: string | null): Formato {
  if (media_type === "CAROUSEL_ALBUM") return "Carrossel"
  if (media_type === "VIDEO") return product_type === "REELS" || product_type == null ? "Reels" : "Vídeo"
  return "Imagem"
}

const PILARES: Pilar[] = ["Case", "Educacional", "Bastidor", "Benchmark"]
const MOLDES: MoldeKey[] = ["Turbo", "MEC", "Benchmark", "Lista", "Bastidor"]

export function pilarValido(v: string | null): Pilar | null {
  return PILARES.includes(v as Pilar) ? (v as Pilar) : null
}
export function moldeValido(v: string | null): MoldeKey | null {
  return MOLDES.includes(v as MoldeKey) ? (v as MoldeKey) : null
}

/** Primeira linha da legenda, sem hashtags soltas, até 120 caracteres. */
export function headDaLegenda(caption: string | null, fallback: string): string {
  const linha = (caption ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !/^#/.test(l))
  if (!linha) return fallback
  return linha.length > 120 ? `${linha.slice(0, 117).trimEnd()}…` : linha
}

export function mediaParaPost(m: MediaRow, leads: number): Post {
  const publicadoEm = m.published_at ?? new Date(0).toISOString()
  return {
    id: m.media_id,
    perfil: m.channel_id,
    publicadoEm,
    data: ddmm(publicadoEm),
    head: headDaLegenda(m.caption, m.documento_nome ?? "(sem legenda)"),
    fmt: formatoDaMidia(m.media_type, m.media_product_type),
    pilar: pilarValido(m.pilar),
    molde: moldeValido(m.molde),
    kw: m.palavra_chave,
    permalink: m.permalink,
    thumb: m.thumbnail_url ?? m.media_url,
    alc: m.reach,
    sav: m.saved,
    sh: m.shares,
    seg: m.follows,
    com: m.comments_count ?? 0,
    curtidas: m.like_count,
    interacoes: m.total_interactions,
    visitasPerfil: m.profile_visits,
    views: m.views,
    leads,
    slides: m.media_type === "CAROUSEL_ALBUM" ? m.children_count : null,
    legenda: m.caption,
    documentoId: m.documento_id,
  }
}

// ── Atribuição comentário → direct (comment gate) ───────────────────────

const JANELA_ATRIBUICAO_MS = 14 * DIA_MS

function chaveContato(id: string | null, username: string | null): string[] {
  const out: string[] = []
  if (id) out.push(`id:${id}`)
  if (username) out.push(`user:${username.replace(/^@/, "").toLowerCase()}`)
  return out
}

export interface Atribuicao {
  /** media_id → threads atribuídas (ordem: mais recente primeiro). */
  porMidia: Map<string, ThreadRow[]>
  /** thread.id → media_id */
  porThread: Map<string, string>
}

/**
 * Um contato que COMENTOU num post e depois (até 14 dias) mandou direct é
 * um lead daquele post. O comentário mais recente antes da última mensagem
 * ganha. Casa por id do remetente e, na falta, pelo username (o CRM grava o
 * username do IG como nome do contato).
 */
export function atribuirLeads(comentarios: ComentarioRow[], threads: ThreadRow[]): Atribuicao {
  const porContato = new Map<string, ComentarioRow[]>()
  for (const c of comentarios) {
    for (const k of chaveContato(c.sender_id, c.sender_username)) {
      const arr = porContato.get(k) ?? []
      arr.push(c)
      porContato.set(k, arr)
    }
  }
  const porMidia = new Map<string, ThreadRow[]>()
  const porThread = new Map<string, string>()
  for (const t of threads) {
    if (t.contact_external_id.startsWith("comment:")) continue
    const ultima = Date.parse(t.last_message_at)
    const cands = [...chaveContato(t.contact_external_id, t.contact_name)].flatMap((k) => porContato.get(k) ?? [])
    let melhor: ComentarioRow | null = null
    for (const c of cands) {
      const tc = Date.parse(c.created_at)
      if (tc > ultima + 60_000 || tc < ultima - JANELA_ATRIBUICAO_MS) continue
      if (!melhor || tc > Date.parse(melhor.created_at)) melhor = c
    }
    if (!melhor) continue
    porThread.set(t.id, melhor.media_id)
    const arr = porMidia.get(melhor.media_id) ?? []
    arr.push(t)
    porMidia.set(melhor.media_id, arr)
  }
  for (const arr of porMidia.values()) arr.sort((a, b) => Date.parse(b.last_message_at) - Date.parse(a.last_message_at))
  return { porMidia, porThread }
}

export function estagioDaThread(t: ThreadRow, deals: Map<string, DealRow>): string {
  const deal = t.deal_id ? deals.get(t.deal_id) : null
  if (deal) {
    if (deal.status === "won") return "Cliente fechado"
    if (deal.status === "lost") return "Negócio perdido"
    return deal.stage_name ? `Negócio · ${deal.stage_name}` : "Negócio aberto"
  }
  if (t.client_id) return "Cliente"
  if (t.lead_id) return "Lead no CRM"
  return "Conversa no direct"
}

export function leadsDoPost(threads: ThreadRow[], deals: Map<string, DealRow>): LeadDoPost[] {
  return threads.map((t) => ({
    threadId: t.id,
    nome: t.contact_name ?? "Contato do Instagram",
    handle: t.contact_name ? `@${t.contact_name.replace(/^@/, "")}` : null,
    avatar: t.contact_avatar_url,
    data: t.last_message_at,
    estagio: estagioDaThread(t, deals),
    dealId: t.deal_id,
    leadId: t.lead_id,
  }))
}

// ── Seguidores ──────────────────────────────────────────────────────────

/**
 * Série diária somando os canais: dia sem snapshot herda o último valor
 * conhecido do canal (carry-forward); antes do primeiro snapshot fica null.
 */
export function serieSeguidores(historicos: HistoricoCanal[], dias: string[]): SerieSeguidores {
  const valores = dias.map((dia) => {
    let soma = 0
    let algum = false
    for (const h of historicos) {
      let ultimo: number | null = null
      for (const s of h.history) {
        if (s.day <= dia) ultimo = s.followers
        else break
      }
      if (ultimo != null) {
        soma += ultimo
        algum = true
      }
    }
    return algum ? soma : null
  })
  return { dias, valores }
}

/** Total de seguidores no fim do dia (soma dos canais) — null sem snapshot. */
export function seguidoresNoDia(historicos: HistoricoCanal[], dia: string): number | null {
  return serieSeguidores(historicos, [dia]).valores[0]
}

// ── KPIs ────────────────────────────────────────────────────────────────

export interface Totais {
  alcance: number | null
  interacoes: number | null
  salvamentos: number | null
  leads: number
  receita: number
  /** Origem do alcance: "conta" (insights diários) ou "posts" (soma das mídias). */
  alcanceFonte: "conta" | "posts" | null
}

function soma(vals: Array<number | null>): number | null {
  const v = vals.filter((x): x is number => typeof x === "number")
  return v.length ? v.reduce((a, b) => a + b, 0) : null
}

export function totais(posts: Post[], daily: DailyRow[], dealsGanhos: DealRow[]): Totais {
  const alcanceConta = soma(daily.map((d) => d.reach))
  const alcancePosts = soma(posts.map((p) => p.alc))
  return {
    alcance: alcanceConta ?? alcancePosts,
    alcanceFonte: alcanceConta != null ? "conta" : alcancePosts != null ? "posts" : null,
    interacoes: soma(posts.map((p) => p.interacoes ?? (p.curtidas != null ? p.curtidas + p.com + (p.sav ?? 0) + (p.sh ?? 0) : null))),
    salvamentos: soma(posts.map((p) => p.sav)),
    leads: posts.reduce((a, p) => a + p.leads, 0),
    receita: dealsGanhos.reduce((a, d) => a + (d.value ?? 0), 0),
  }
}

/** Série diária de uma métrica dos posts (soma por dia de publicação). */
export function seriePorDia(posts: Post[], dias: string[], pick: (p: Post) => number | null): number[] {
  const idx = new Map(dias.map((d, i) => [d, i]))
  const out = dias.map(() => 0)
  for (const p of posts) {
    const i = idx.get(diaSp(p.publicadoEm))
    const v = pick(p)
    if (i != null && v != null) out[i] += v
  }
  return out
}

/** Reduz uma série diária a até `n` pontos (soma por bloco) para o sparkline. */
export function comprimirSerie(serie: number[], n = 10): number[] {
  if (serie.length <= n) return serie
  const bloco = Math.ceil(serie.length / n)
  const out: number[] = []
  for (let i = 0; i < serie.length; i += bloco) out.push(serie.slice(i, i + bloco).reduce((a, b) => a + b, 0))
  return out
}

export function montarKpis(args: {
  dias: string[]
  seguidoresFim: number | null
  seguidoresInicio: number | null
  serieSeg: SerieSeguidores
  atual: Totais
  anterior: Totais
  posts: Post[]
  receitaSerie: number[]
}): Kpi[] {
  const { atual, anterior, dias, posts } = args
  const segSerie = comprimirSerie(
    args.serieSeg.valores.map((v) => v ?? 0),
    10,
  )
  const val = (n: number | null, money = false) => (n == null ? "—" : money ? fmtMoney(n) : fmtInt(n))
  return [
    {
      label: "Seguidores",
      valor: val(args.seguidoresFim),
      delta: deltaPct(args.seguidoresFim, args.seguidoresInicio),
      serie: segSerie,
      nota: args.seguidoresFim == null ? "sem snapshot ainda" : "vs. início do período",
    },
    {
      label: "Alcance",
      valor: val(atual.alcance),
      delta: deltaPct(atual.alcance, anterior.alcance),
      serie: comprimirSerie(seriePorDia(posts, dias, (p) => p.alc)),
      nota: atual.alcanceFonte === "conta" ? "insights da conta · vs. período anterior" : atual.alcanceFonte === "posts" ? "soma dos posts · vs. período anterior" : "insights indisponíveis",
    },
    {
      label: "Interações",
      valor: val(atual.interacoes),
      delta: deltaPct(atual.interacoes, anterior.interacoes),
      serie: comprimirSerie(seriePorDia(posts, dias, (p) => p.interacoes)),
      nota: "vs. período anterior",
    },
    {
      label: "Salvamentos",
      valor: val(atual.salvamentos),
      delta: deltaPct(atual.salvamentos, anterior.salvamentos),
      serie: comprimirSerie(seriePorDia(posts, dias, (p) => p.sav)),
      nota: "vs. período anterior",
    },
    {
      label: "Leads do conteúdo",
      valor: fmtInt(atual.leads),
      delta: deltaPct(atual.leads, anterior.leads),
      serie: comprimirSerie(seriePorDia(posts, dias, (p) => p.leads)),
      money: true,
      nota: "comentou e abriu conversa no direct",
    },
    {
      label: "Receita atribuída",
      valor: fmtMoney(atual.receita),
      delta: deltaPct(atual.receita, anterior.receita),
      serie: comprimirSerie(args.receitaSerie),
      money: true,
      nota: "negócios ganhos de contatos do Instagram",
    },
  ]
}

// ── Funil ───────────────────────────────────────────────────────────────

export function montarFunil(args: {
  alcance: number | null
  visitasPerfil: number | null
  comentariosChave: number
  comentariosWebhook: number
  comentariosGraph: number
  conversas: number
  negocios: number
  clientes: number
}): FunilEtapa[] {
  const semWebhook = args.comentariosWebhook === 0 && args.comentariosGraph > 0
  return [
    { label: "Alcance", valor: args.alcance, nota: args.alcance == null ? "insights indisponíveis" : undefined },
    { label: "Visitas ao perfil", valor: args.visitasPerfil, nota: args.visitasPerfil == null ? "insight indisponível" : undefined },
    {
      label: "Comentários com palavra-chave",
      valor: semWebhook ? null : args.comentariosChave,
      nota: semWebhook ? "webhook de comentários sem eventos" : undefined,
    },
    { label: "Conversas no direct", valor: args.conversas },
    { label: "Negócios criados", valor: args.negocios },
    { label: "Clientes fechados", valor: args.clientes },
  ]
}

/** Comentários (do webhook) cujo texto contém a palavra-chave do post. */
export function contarComentariosChave(comentarios: ComentarioRow[], kwPorMidia: Map<string, string | null>): number {
  let n = 0
  for (const c of comentarios) {
    const kw = kwPorMidia.get(c.media_id)
    if (!kw || !c.body) continue
    if (c.body.toLowerCase().includes(kw.toLowerCase())) n++
  }
  return n
}

// ── Mix, cadência, moldes ───────────────────────────────────────────────

export function montarPilarMix(posts: Post[]): PilarMix {
  const cont: Partial<Record<Pilar, number>> = {}
  let classificados = 0
  for (const p of posts) {
    if (!p.pilar) continue
    classificados++
    cont[p.pilar] = (cont[p.pilar] ?? 0) + 1
  }
  const real: Partial<Record<Pilar, number>> = {}
  const chaves = new Set<Pilar>([...(Object.keys(MIX_ALVO) as Pilar[]), ...(Object.keys(cont) as Pilar[])])
  for (const k of chaves) real[k] = classificados ? Math.round(((cont[k] ?? 0) / classificados) * 100) : 0
  return { alvo: MIX_ALVO, real, semClassificacao: posts.length - classificados, classificados }
}

/** Segunda-feira (YYYY-MM-DD) da semana do dia dado. */
export function inicioDaSemana(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7
  return diaIso(new Date(d.getTime() - dow * DIA_MS))
}

export function montarCadencia(posts: Post[], perfis: Perfil[], hoje: string): Cadencia[] {
  const ini = inicioDaSemana(hoje)
  return perfis.map((p) => ({
    perfil: p.id,
    feitos: posts.filter((x) => x.perfil === p.id && diaSp(x.publicadoEm) >= ini && diaSp(x.publicadoEm) <= hoje).length,
    meta: p.metaSemanal,
  }))
}

export function montarMoldes(posts: Post[]): MoldeResumo[] {
  return ST_TEMPLATES.map((t) => {
    const k = moldeKeyDoTemplate(t)
    const ps = posts.filter((p) => p.molde === k)
    const alc = ps.map((p) => p.alc).filter((v): v is number => v != null)
    return {
      k,
      nome: t.nome,
      descricao: t.descricao,
      slides: `${t.frames.length}`,
      posts: ps.length,
      leads: ps.length ? ps.reduce((a, p) => a + p.leads, 0) / ps.length : null,
      alcanceMedio: alc.length ? Math.round(alc.reduce((a, b) => a + b, 0) / alc.length) : null,
    }
  }).sort((a, b) => (b.leads ?? -1) - (a.leads ?? -1))
}

export function ordenarAgendados(itens: Agendado[], hoje: string): Agendado[] {
  return [...itens].filter((a) => a.data >= hoje).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))
}
