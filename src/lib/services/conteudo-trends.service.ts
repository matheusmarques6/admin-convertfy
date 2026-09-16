/**
 * Assuntos em alta do painel de Reels — e a classificação de uma ideia crua.
 *
 * **Não existe integração com API de trends do TikTok.** O que alimenta o
 * painel é a ConvertIA com BUSCA NA INTERNET: a rota busca, serve os
 * resultados ao modelo com a lista fechada de URLs, e cada `fonteUrl` que
 * volta é conferida contra o que foi servido (`verificarFontes`, o mesmo
 * módulo da triagem). Link que o modelo inventar é removido antes de
 * gravar — assunto "em alta" com fonte falsa é pior que painel vazio,
 * porque parece conferido.
 *
 * Sem provedor de busca configurado o painel ainda funciona: a IA gera do
 * contexto da casa e a tela DIZ que rodou sem fato externo.
 */

import type { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { buscarNaWeb, escolherProvedor } from "@/lib/ai/web/web-search"
import { blocoDeFontes, verificarFontes, type FonteServida } from "@/lib/conteudo/editorial/evidencias"
import { executarIA } from "@/lib/conteudo/ia/service"
import { VALIDADE_DIAS, expirados, ordenarParaOPainel, precisaRodar } from "@/lib/conteudo/trends/validade"
import type { Formato, Trend, TrendsStatus } from "@/lib/conteudo/types"
import type { EtapaFunil } from "@/lib/conteudo/types"

const log = logger.child("ConteudoTrends")
type Admin = ReturnType<typeof createAdminClient>

const TREND_COLS = "id, titulo, score, dificuldade, categoria, como_usar, fonte, fonte_url, fonte_titulo, gerado_em"

interface TrendRow {
  id: string
  titulo: string
  score: number
  dificuldade: Trend["dificuldade"]
  categoria: Trend["categoria"]
  como_usar: string
  fonte: Trend["fonte"]
  fonte_url: string | null
  fonte_titulo: string | null
  gerado_em: string
}

const rowToTrend = (r: TrendRow): Trend => ({
  id: r.id,
  titulo: r.titulo,
  score: r.score,
  dificuldade: r.dificuldade,
  categoria: r.categoria,
  comoUsar: r.como_usar,
  fonte: r.fonte,
  fonteUrl: r.fonte_url,
  fonteTitulo: r.fonte_titulo,
  geradoEm: r.gerado_em,
})

/**
 * Os assuntos vigentes, já na ordem do painel.
 *
 * A leitura ordena por `gerado_em` porque é ela que decide quem SOBREVIVE ao
 * `limit`: com o cron diário acrescentando 6 por dia, um top-40 por score
 * cortaria justamente a rodada de hoje se ela viesse com notas baixas. A
 * ordem que a tela usa é a do módulo puro (`ordenarParaOPainel`), que põe a
 * rodada mais recente na frente.
 */
export async function listarTrends(admin: Admin, orgId: string): Promise<Trend[]> {
  const { data, error } = await admin
    .from("conteudo_trends")
    .select(TREND_COLS)
    .eq("org_id", orgId)
    .eq("ativo", true)
    .order("gerado_em", { ascending: false })
    .order("score", { ascending: false })
    .limit(40)
  if (error) throw error
  return ordenarParaOPainel(((data ?? []) as unknown as TrendRow[]).map(rowToTrend))
}

/**
 * Quando o radar rodou pela última vez — arquivadas INCLUSIVE.
 *
 * Derivar isso da lista ativa fazia "tudo expirou" aparecer como "nunca
 * gerado", que é o contrário do que o operador precisa saber.
 */
export async function ultimaRodada(admin: Admin, orgId: string): Promise<string | null> {
  const { data } = await admin
    .from("conteudo_trends")
    .select("gerado_em")
    .eq("org_id", orgId)
    .order("gerado_em", { ascending: false })
    .limit(1)
  return ((data ?? []) as Array<{ gerado_em: string }>)[0]?.gerado_em ?? null
}

/** O rodapé honesto do painel: quando rodou e se a busca está configurada. */
export async function statusTrends(admin: Admin, orgId: string, trends: Trend[]): Promise<TrendsStatus> {
  // Pergunta pelo PROVEDOR, não por uma busca de mentirinha: `buscarNaWeb("")`
  // sai em "consulta vazia" ANTES de olhar a chave, então uma instalação sem
  // provedor nenhum era reportada como configurada — a tela diria que o
  // painel tem fato externo quando nunca teve.
  const buscaConfigurada = escolherProvedor() !== null
  return { geradoEm: await ultimaRodada(admin, orgId), buscaConfigurada, total: trends.length, validadeDias: VALIDADE_DIAS }
}

/**
 * Arquiva o que passou da validade. Devolve quantos saíram.
 *
 * Arquiva, não apaga: quem virou ideia mantém o vínculo
 * (`conteudo_ideias.trend_id`) e o histórico responde "o que o radar já
 * propôs". Roda ANTES de gerar, para o `jaTem` do prompt não pedir ao modelo
 * que evite assuntos que já saíram do painel.
 */
export async function expirarTrends(admin: Admin, orgId: string): Promise<number> {
  const { data } = await admin.from("conteudo_trends").select("id, gerado_em, score").eq("org_id", orgId).eq("ativo", true).limit(200)
  const linhas = ((data ?? []) as Array<{ id: string; gerado_em: string; score: number }>).map((r) => ({ id: r.id, geradoEm: r.gerado_em, score: r.score }))
  const ids = expirados(linhas)
  if (ids.length === 0) return 0
  const { error } = await admin.from("conteudo_trends").update({ ativo: false }).in("id", ids).eq("org_id", orgId)
  if (error) {
    log.warn("conteudo_trends.expirar_falhou", { erro: error.message, quantos: ids.length })
    return 0
  }
  return ids.length
}

/** Contexto da casa servido ao modelo: nicho e o que já performou. */
async function contextoDaOrg(admin: Admin, orgId: string): Promise<string> {
  const { data } = await admin
    .from("conteudo_ig_media")
    .select("caption, saved, shares")
    .eq("org_id", orgId)
    .order("saved", { ascending: false, nullsFirst: false })
    .limit(5)
  const linhas = ((data ?? []) as Array<{ caption: string | null; saved: number | null }>)
    .map((m) => (m.caption ?? "").split("\n")[0]?.trim())
    .filter((t): t is string => Boolean(t) && t.length > 8)
    .slice(0, 5)
  const base =
    "Agência de e-mail marketing e retenção para e-commerce (Convertfy). O público é dono de loja e gestor de tráfego; os assuntos giram em torno de segmentação, LTV, carrinho abandonado, pós-compra e o que fazer com a base que já comprou."
  return linhas.length > 0 ? `${base}\n\nPosts da casa que mais salvaram:\n${linhas.map((l) => `- ${l}`).join("\n")}` : base
}

export interface GerarTrendsResultado {
  trends: Trend[]
  /** Quantos links a IA citou fora do que a busca serviu (removidos). */
  fontesDescartadas: number
  /** Por que rodou sem fato externo, quando foi o caso. */
  buscaIndisponivel: string | null
  /** Quantos assuntos saíram do painel por validade nesta rodada. */
  expirados: number
}

/**
 * Quantos títulos entram no "não repita" do prompt.
 *
 * Sem teto, duas semanas de rodadas diárias mandariam ~80 títulos ao modelo
 * com a instrução de evitá-los — e ele começaria a raspar o fundo do barril
 * para não repetir nada. "Não repita" quer dizer "não repita o que está
 * fresco no painel", não "nunca mais toque nesses assuntos".
 */
const TETO_JA_TEM = 24

export async function gerarTrends(admin: Admin, orgId: string, userId: string | null, perfil: { handle: string | null; nome: string }): Promise<GerarTrendsResultado> {
  // Expira ANTES de listar: assunto vencido não deve entrar no "não repita".
  const quantosExpiraram = await expirarTrends(admin, orgId)
  const contexto = await contextoDaOrg(admin, orgId)
  const jaTem = (await listarTrends(admin, orgId)).slice(0, TETO_JA_TEM).map((t) => t.titulo)

  let fontes: FonteServida[] = []
  let buscaIndisponivel: string | null = null
  const busca = await buscarNaWeb("tendencias reels instagram e-commerce marketing brasil 2026", { limite: 6 })
  if (busca.ok) fontes = busca.resultados.map((r) => ({ titulo: r.titulo, url: r.url, trecho: r.trecho }))
  else if (busca.naoConfigurado) {
    buscaIndisponivel = "a busca na internet ainda não está configurada nesta instalação (falta SERPER_API_KEY, TAVILY_API_KEY ou BRAVE_SEARCH_API_KEY no ambiente)."
  } else buscaIndisponivel = busca.motivo

  const r = await executarIA(
    { acao: "trends", perfil: { handle: perfil.handle, nome: perfil.nome }, contexto, jaTem, quantidade: 6 },
    { blocoFontes: blocoDeFontes(fontes) },
  )

  // Mesma régua da triagem: URL fora do que foi servido não é fonte.
  const conferidos = verificarFontes(
    r.dados.assuntos.map((a) => ({ rotulo: "A", texto: a.titulo, fonte: a.fonteUrl })),
    fontes,
  )
  const urlPorTitulo = new Map(fontes.map((f) => [f.url, f.titulo]))

  const linhas = r.dados.assuntos.map((a, i) => {
    const fonteUrl = conferidos.evidencias[i]?.fonte ?? null
    return {
      org_id: orgId,
      titulo: a.titulo.trim(),
      score: a.score,
      dificuldade: a.dificuldade,
      categoria: a.categoria,
      como_usar: a.comoUsar.trim(),
      // A procedência é da LINHA, não do ambiente de quem lê: o rodapé do
      // painel diz se a busca está configurada AGORA, e uma rodada de três
      // dias atrás pode ter acontecido sem ela.
      fonte: (buscaIndisponivel ? "interno" : "web") as "web" | "interno",
      fonte_url: fonteUrl,
      fonte_titulo: fonteUrl ? (urlPorTitulo.get(fonteUrl) ?? null) : null,
      ativo: true,
      gerado_em: new Date().toISOString(),
      criado_por: userId,
    }
  })

  // Mesmo assunto gerado de novo é ATUALIZAÇÃO (o índice único é por
  // lower(titulo)); duplicar encheria o painel de sinônimos do mesmo tema.
  const { error } = await admin.from("conteudo_trends").upsert(linhas, { onConflict: "org_id, titulo" })
  if (error) {
    // O índice é sobre `lower(titulo)`, fora do alcance do onConflict do
    // PostgREST: cai para inserir só o que ainda não existe.
    log.warn("conteudo_trends.upsert_fallback", { erro: error.message })
    const existentes = new Set((await listarTrends(admin, orgId)).map((t) => t.titulo.toLowerCase()))
    const novas = linhas.filter((l) => !existentes.has(l.titulo.toLowerCase()))
    if (novas.length > 0) {
      const { error: erroInsert } = await admin.from("conteudo_trends").insert(novas)
      if (erroInsert) throw erroInsert
    }
  }

  if (conferidos.descartadas.length > 0) {
    log.warn("conteudo_trends.fonte_inventada", { quantas: conferidos.descartadas.length, urls: conferidos.descartadas })
  }

  return {
    trends: await listarTrends(admin, orgId),
    fontesDescartadas: conferidos.descartadas.length,
    buscaIndisponivel,
    expirados: quantosExpiraram,
  }
}

// ── Radar diário ───────────────────────────────────────────────────────────

export interface RodadaDoRadar {
  orgId: string
  /** `false` quando a org foi pulada — `motivo` diz por quê. */
  rodou: boolean
  motivo?: "rodou_ha_pouco" | "sem_orcamento" | "erro"
  assuntos?: number
  expirados?: number
  semFatoExterno?: boolean
  erro?: string
}

/**
 * Uma rodada do radar por org com canal de Instagram ativo.
 *
 * **Só quem usa o módulo.** Rodar para toda org gastaria uma busca e uma
 * chamada de modelo por dia para quem nunca abre o painel.
 *
 * Fail-open por org: uma que falhe não pode levar as outras junto — e a
 * varredura que ficou pela metade deixa `expirarTrends` já aplicado, que é
 * trabalho aproveitado.
 */
export async function varrerRadar(admin: Admin, opts: { budgetMs?: number; forcar?: boolean } = {}): Promise<RodadaDoRadar[]> {
  const inicio = Date.now()
  const budget = opts.budgetMs ?? 240_000
  const { data } = await admin.from("crm_channels").select("org_id, display_name, external_id").eq("type", "instagram").eq("is_active", true)

  // Trend é por ORG, não por canal: org com duas contas de Instagram tem um
  // radar só. O primeiro canal serve de perfil para o prompt.
  const porOrg = new Map<string, { handle: string | null; nome: string }>()
  for (const c of (data ?? []) as Array<{ org_id: string; display_name: string | null }>) {
    if (!porOrg.has(c.org_id)) {
      const nome = c.display_name ?? "Convertfy"
      porOrg.set(c.org_id, { handle: nome.startsWith("@") ? nome.slice(1) : null, nome })
    }
  }

  const saida: RodadaDoRadar[] = []
  for (const [orgId, perfil] of porOrg) {
    // A chamada de modelo é a parte lenta; começar uma sem tempo para
    // terminar deixaria a org sem rodada E sem registro do porquê.
    if (Date.now() - inicio > budget - 45_000) {
      saida.push({ orgId, rodou: false, motivo: "sem_orcamento" })
      continue
    }
    if (!opts.forcar && !precisaRodar(await ultimaRodada(admin, orgId))) {
      saida.push({ orgId, rodou: false, motivo: "rodou_ha_pouco" })
      continue
    }
    try {
      const r = await gerarTrends(admin, orgId, null, perfil)
      saida.push({ orgId, rodou: true, assuntos: r.trends.length, expirados: r.expirados, semFatoExterno: r.buscaIndisponivel != null })
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e)
      log.error("radar.org_falhou", { orgId, erro })
      saida.push({ orgId, rodou: false, motivo: "erro", erro })
    }
  }
  return saida
}

// ── Pautas: a IA propõe ideias novas ───────────────────────────────────────

export interface PautaGerada {
  titulo: string
  funil: EtapaFunil
  formato: Formato
  pilar: string | null
  tags: string[]
  molde: string | null
  score: number
  porQue: string
}

/**
 * Propõe pautas para o banco. `lacunas` é o que falta fechar na semana (vem
 * do progresso do pipeline de Reels) — com ela o pedido deixa de ser "me dá
 * ideias" e vira "me dá o que falta". Sem ela o modelo escolhe o funil.
 *
 * Não grava: quem decide o que entra é a rota, e a tela mostra o que veio.
 */
export async function gerarPautas(
  admin: Admin,
  orgId: string,
  perfil: { handle: string | null; nome: string },
  opts: { lacunas?: string[]; quantidade?: number } = {},
): Promise<PautaGerada[]> {
  const contexto = await contextoDaOrg(admin, orgId)
  // Só os títulos do banco ATIVO: repetir o que já está lá é o jeito mais
  // rápido de a lista de ideias virar cinco versões da mesma frase.
  const { data } = await admin
    .from("conteudo_ideias")
    .select("titulo")
    .eq("org_id", orgId)
    .neq("status", "arquivada")
    .order("criado_em", { ascending: false })
    .limit(40)
  const jaTem = ((data ?? []) as Array<{ titulo: string }>).map((i) => i.titulo)

  const r = await executarIA({
    acao: "pautas",
    perfil: { handle: perfil.handle, nome: perfil.nome },
    contexto,
    jaTem,
    lacunas: opts.lacunas?.slice(0, 3),
    quantidade: opts.quantidade ?? 5,
  })

  return r.dados.pautas.map((p) => ({
    titulo: p.titulo.trim(),
    funil: p.funil,
    formato: p.formato,
    pilar: p.pilar ?? null,
    tags: p.tags,
    molde: p.molde ?? null,
    score: p.score,
    porQue: p.porQue.trim(),
  }))
}

export async function arquivarTrend(admin: Admin, orgId: string, id: string): Promise<void> {
  const { error } = await admin.from("conteudo_trends").update({ ativo: false }).eq("id", id).eq("org_id", orgId)
  if (error) throw error
}

// ── Classificação de uma ideia crua ────────────────────────────────────────

export interface IdeiaClassificada {
  funil: EtapaFunil
  formato: Formato
  pilar: string | null
  tags: string[]
  molde: string | null
  score: number
  porQue: string
}

/** Uma chamada curta: o que a pessoa anotou vira ideia com funil e score. */
export async function classificarIdeia(admin: Admin, orgId: string, titulo: string): Promise<IdeiaClassificada> {
  const contexto = await contextoDaOrg(admin, orgId)
  const r = await executarIA({ acao: "classificar_ideia", titulo, contexto })
  return {
    funil: r.dados.funil,
    formato: r.dados.formato,
    pilar: r.dados.pilar ?? null,
    tags: r.dados.tags,
    molde: r.dados.molde ?? null,
    score: r.dados.score,
    porQue: r.dados.porQue,
  }
}
