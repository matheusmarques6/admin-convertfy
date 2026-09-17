/**
 * Diagnóstico — as lacunas que estão travando o conteúdo, com o número que
 * as produziu, o custo e a saída.
 *
 * O desenho copia a tela da referência e corrige duas coisas nela:
 *
 * 1. **Quem decide que a lacuna existe é o CÓDIGO, não o modelo.** Lá a
 *    lista inteira sai de uma chamada de IA sobre a bio e os últimos posts —
 *    e diagnóstico inventado é pior que diagnóstico nenhum, porque manda
 *    consertar o que não está quebrado. Aqui cada lacuna nasce de uma conta
 *    sobre o nosso dado medido e carrega a `evidencia` na cara. A prosa da
 *    IA (a leitura do perfil) existe à parte, é opcional e não decide nada.
 * 2. **Nem toda lacuna se resolve publicando.** Lá TODO card termina em
 *    "Gerar carrossel disso", inclusive "cadência irregular" — onde o que
 *    falta é rotina, não peça. Aqui a lacuna carrega `acao` (o que fazer no
 *    sistema), `pauta` (o que publicar) ou as duas, e o card só oferece o
 *    que de fato resolve.
 *
 * A pauta, quando existe, é semeada com o ASSUNTO do melhor post do próprio
 * perfil — não com um tema genérico. É o que separa "escreva sobre
 * constância" de uma pauta que a pessoa realmente publicaria.
 */

import { porAlcance } from "../metricas/sinais"
import type { Formato, PilarMix, Post } from "../types"

export type LacunaId = "cadencia" | "classificacao" | "formato" | "gate" | "alcance" | "referencia" | "brand_kit" | "insights"

export interface Acao {
  rotulo: string
  href: string
}

export interface Lacuna {
  id: LacunaId
  titulo: string
  /** O número que produziu a lacuna — sem ele é opinião. */
  evidencia: string
  /** O que ela custa. */
  custo: string
  /** A saída, concreta. */
  saida: string
  gravidade: "alta" | "media"
  /** O que fazer no sistema. Ausente quando publicar é a única saída. */
  acao?: Acao
  /** Pauta pronta para o Estúdio. Ausente quando publicar não resolve. */
  pauta?: string
}

/** Quantos posts com alcance um formato precisa para ser comparável. */
const MINIMO_POR_FORMATO = 3
/** Abaixo disto o formato campeão está sub-publicado. */
const SHARE_MINIMO_DO_CAMPEAO = 0.35
/** Queda de alcance que vira lacuna. */
const QUEDA_RELEVANTE = -20

const pct = (n: number) => `${n.toFixed(2).replace(".", ",")}%`
const um = (n: number) => n.toFixed(1).replace(".", ",")
const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR")

export interface DesempenhoDeFormato {
  fmt: Formato
  posts: number
  /** Fatia do formato no total de posts do período (0..1). */
  share: number
  /** Sends ÷ alcance do formato, em percentual. `null` sem alcance. */
  retencao: number | null
  /** Posts do formato que têm alcance — o piso de amostra. */
  amostra: number
  /** Assunto do melhor post do formato, para semear a pauta. */
  melhorAssunto: string | null
}

/**
 * Desempenho por formato, medido.
 *
 * A referência afirma que "carrossel é o formato que mais salva e retém" —
 * o que é verdade de mercado e pode ser MENTIRA neste perfil. Aqui a
 * afirmação é substituída pela medição do próprio perfil, e um formato só
 * entra na comparação com amostra suficiente.
 */
export function desempenhoPorFormato(posts: readonly Post[]): DesempenhoDeFormato[] {
  const porFmt = new Map<Formato, Post[]>()
  for (const p of posts) porFmt.set(p.fmt, [...(porFmt.get(p.fmt) ?? []), p])

  const saida: DesempenhoDeFormato[] = []
  for (const [fmt, ps] of porFmt) {
    let sh = 0
    let alc = 0
    let amostra = 0
    let melhor: { razao: number; head: string } | null = null
    for (const p of ps) {
      if (p.alc == null || p.alc <= 0 || p.sh == null) continue
      amostra++
      sh += p.sh
      alc += p.alc
      const r = porAlcance(p.sh, p.alc)
      if (r != null && (melhor == null || r > melhor.razao)) melhor = { razao: r, head: p.head }
    }
    saida.push({
      fmt,
      posts: ps.length,
      share: posts.length ? ps.length / posts.length : 0,
      retencao: alc > 0 ? (sh / alc) * 100 : null,
      amostra,
      melhorAssunto: melhor?.head ?? null,
    })
  }
  return saida.sort((a, b) => b.posts - a.posts)
}

/** O formato que mais retém ENTRE os que têm amostra suficiente. */
export function formatoCampeao(desempenho: readonly DesempenhoDeFormato[]): DesempenhoDeFormato | null {
  const comparaveis = desempenho.filter((d) => d.amostra >= MINIMO_POR_FORMATO && d.retencao != null)
  if (comparaveis.length < 2) return null
  return comparaveis.reduce((a, b) => ((b.retencao as number) > (a.retencao as number) ? b : a))
}

/** Percentual assinado ("-34,2%") de volta para número. */
export function deltaNumerico(delta: string | null): number | null {
  if (!delta) return null
  const n = Number(delta.replace("%", "").replace(".", "").replace(",", "."))
  return Number.isFinite(n) ? n : null
}

export interface EntradaDoDiagnostico {
  posts: Post[]
  /** Dias do período. */
  dias: number
  metaSemanal: number
  pilarMix: PilarMix
  /** O delta do KPI de alcance ("-34,2%"), como a tela já o exibe. */
  alcanceDelta: string | null
  /** Referências curadas ATIVAS da org (o exemplo que a IA lê). */
  referenciasAtivas: number
  /** Perfis conectados e quantos têm brand kit gravado. */
  perfis: number
  brandKits: number
  /** Onde cada ação leva — injetado para o módulo ficar puro. */
  rotas: { dashboard: string; estudio: string }
}

/**
 * As lacunas, ordenadas por gravidade e depois pela ordem de declaração
 * (que é a ordem em que elas costumam ser resolvidas).
 */
export function diagnosticar(e: EntradaDoDiagnostico): Lacuna[] {
  const out: Lacuna[] = []
  const { posts, rotas } = e
  const semanas = Math.max(e.dias, 1) / 7
  const porSemana = posts.length / semanas
  const meta = e.metaSemanal > 0 ? e.metaSemanal : 3
  const desempenho = desempenhoPorFormato(posts)
  const campeao = formatoCampeao(desempenho)
  const melhorPost = [...posts].sort((a, b) => (b.alc ?? 0) - (a.alc ?? 0))[0] ?? null

  // 1 · Cadência. Publicar é a única saída — não existe ação de sistema aqui.
  if (posts.length > 0 && porSemana < meta) {
    out.push({
      id: "cadencia",
      titulo: "Cadência abaixo da meta do canal",
      evidencia: `${um(porSemana)} post/semana no período · meta ${meta}`,
      custo: "O alcance orgânico cai com a irregularidade, e o perfil perde a vez no feed de quem já segue.",
      saida: `Fechar a semana com ${meta} ${meta === 1 ? "publicação" : "publicações"} — uma delas pode sair daqui agora.`,
      gravidade: porSemana < meta / 2 ? "alta" : "media",
      pauta: melhorPost ? `Carrossel no assunto que mais alcançou neste perfil: ${melhorPost.head}` : undefined,
    })
  }

  // 2 · Classificação. É o que trava o painel inteiro, e publicar não
  // resolve — daí só ação, sem pauta.
  if (e.pilarMix.semClassificacao > 0) {
    const total = e.pilarMix.semClassificacao + e.pilarMix.classificados
    out.push({
      id: "classificacao",
      titulo: "Posts sem pilar e sem molde",
      evidencia: `${inteiro(e.pilarMix.semClassificacao)} de ${inteiro(total)} ${total === 1 ? "post" : "posts"} sem classificação`,
      custo: "O mix de pilar e o desempenho por molde não têm o que responder: a Meta não sabe o que é um Turbo, só quem publicou sabe.",
      saida: "Classificar em lote pela tabela do dashboard — o filtro “Sem pilar” já mostra exatamente o que falta.",
      gravidade: e.pilarMix.classificados === 0 ? "alta" : "media",
      acao: { rotulo: "Classificar no dashboard", href: rotas.dashboard },
    })
  }

  // 3 · Formato campeão sub-publicado. MEDIDO neste perfil, nunca a
  // afirmação de mercado.
  if (campeao && campeao.share < SHARE_MINIMO_DO_CAMPEAO) {
    out.push({
      id: "formato",
      titulo: `${campeao.fmt} é o que mais retém aqui e é o que menos sai`,
      evidencia: `${campeao.fmt} faz ${pct(campeao.retencao as number)} de sends ÷ alcance em ${campeao.amostra} ${campeao.amostra === 1 ? "post" : "posts"} e é só ${Math.round(campeao.share * 100)}% do feed`,
      custo: "O formato que o próprio perfil já provou ser o melhor está sub-publicado — o esforço vai para o que rende menos.",
      saida: `Subir ${campeao.fmt} para pelo menos ${Math.round(SHARE_MINIMO_DO_CAMPEAO * 100)}% das publicações do mês.`,
      gravidade: "media",
      pauta: campeao.melhorAssunto ? `${campeao.fmt} sobre: ${campeao.melhorAssunto}` : undefined,
    })
  }

  // 4 · Comment gate. Sem palavra-chave o comentário não vira conversa e o
  // post não tem como ser creditado por lead nenhum.
  const comKw = posts.filter((p) => (p.kw ?? "").trim()).length
  if (posts.length > 0 && comKw === 0) {
    out.push({
      id: "gate",
      titulo: "Nenhum post pede uma palavra no comentário",
      evidencia: `0 de ${inteiro(posts.length)} ${posts.length === 1 ? "post" : "posts"} com palavra-chave`,
      custo: "Sem a palavra não há comment gate: o comentário não vira direct e nenhum lead consegue ser creditado ao post que o trouxe.",
      saida: "Terminar o carrossel com “comente <PALAVRA>” e ligar a automação no próprio Estúdio.",
      gravidade: "alta",
      acao: { rotulo: "Abrir o Estúdio", href: rotas.estudio },
      pauta: melhorPost ? `Carrossel que termina em comment gate sobre: ${melhorPost.head}` : undefined,
    })
  }

  // 5 · Queda de alcance.
  const queda = deltaNumerico(e.alcanceDelta)
  if (queda != null && queda <= QUEDA_RELEVANTE) {
    out.push({
      id: "alcance",
      titulo: "Alcance caindo contra o período anterior",
      evidencia: `${e.alcanceDelta} de alcance`,
      custo: "Menos gente vendo é menos gente comentando, e o comment gate depende do topo do funil para existir.",
      saida: "Repetir o que funcionou: o assunto do melhor post ainda tem público e não foi esgotado.",
      gravidade: "alta",
      pauta: melhorPost ? `Novo ângulo do assunto que mais alcançou: ${melhorPost.head}` : undefined,
    })
  }

  // 6 · Sem referência curada — a IA escreve só com regra, sem nunca ter
  // visto um carrossel bom da casa.
  if (e.referenciasAtivas === 0) {
    out.push({
      id: "referencia",
      titulo: "Nenhuma referência curada para a IA ler",
      evidencia: "0 referências ativas",
      custo: "A ConvertIA escreve só com regra (pilares, moldes, limites) e nunca viu um carrossel bom desta casa — o resultado sai correto e sem voz.",
      saida: "Importar do próprio Instagram os carrosséis que mais salvaram, ou subir os slides que o time gosta.",
      gravidade: "media",
      acao: { rotulo: "Cadastrar referência", href: rotas.estudio },
    })
  }

  // 7 · Brand kit. As identidades que simulam post desenham @ e avatar —
  // sem o kit elas saem com o cartão vazio.
  if (e.perfis > 0 && e.brandKits < e.perfis) {
    const faltam = e.perfis - e.brandKits
    out.push({
      id: "brand_kit",
      titulo: "Perfil sem kit de marca no Estúdio",
      evidencia: `${faltam} de ${e.perfis} ${e.perfis === 1 ? "perfil" : "perfis"} sem kit`,
      custo: "As identidades que simulam post (Print de post, História, Thread) desenham @, nome e avatar: sem o kit elas saem com o cartão em branco.",
      saida: "Preencher o kit uma vez — arroba, nome, avatar e selo vêm do canal conectado.",
      gravidade: "media",
      acao: { rotulo: "Abrir o Estúdio", href: rotas.estudio },
    })
  }

  // 8 · Insights ausentes. Não é defeito do perfil, é medição incompleta —
  // e a tela precisa dizer isso em vez de mostrar "—" sem motivo.
  const semAlcance = posts.filter((p) => p.alc == null).length
  if (posts.length >= 5 && semAlcance / posts.length > 0.3) {
    out.push({
      id: "insights",
      titulo: "A Meta não entregou alcance em boa parte dos posts",
      evidencia: `${inteiro(semAlcance)} de ${inteiro(posts.length)} posts sem alcance`,
      custo: "Retenção, sends ÷ alcance e metade dos cards ficam em “—”, e a nota roda com menos componentes medidos.",
      saida: "Reconferir o canal em Canais: token expirado e conta sem permissão de insights são as duas causas.",
      gravidade: "media",
      acao: { rotulo: "Ver o dashboard", href: rotas.dashboard },
    })
  }

  return out.sort((a, b) => (a.gravidade === b.gravidade ? 0 : a.gravidade === "alta" ? -1 : 1))
}
