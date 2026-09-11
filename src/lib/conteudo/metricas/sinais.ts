/**
 * Os sinais que decidem alcance no Instagram em 2026 — e a régua para
 * calculá-los sem inventar número.
 *
 * Adam Mosseri confirmou três sinais de ranking: **watch time**, **sends
 * por alcance** (compartilhamento por DM) e **likes por alcance**. O envio
 * pesa de 3 a 5× mais que a curtida para alcançar quem não segue.
 *
 * O que este módulo existe para impedir:
 *
 * 1. **Taxa sem denominador virando 0%.** Post sem alcance coletado não
 *    tem taxa — tem ausência. `0%` se lê como "ninguém compartilhou",
 *    que é uma afirmação sobre o público; `null` se lê como "não medimos",
 *    que é a verdade. A tela mostra "—".
 * 2. **Watch time lido como segundos.** A API devolve
 *    `ig_reels_avg_watch_time` em MILISSEGUNDOS. Ler direto multiplica a
 *    métrica por mil e o número fica plausível o bastante para ninguém
 *    desconfiar.
 * 3. **Comparar numerador completo com numerador parcial.** A fórmula de
 *    mercado usa curtidas+comentários+compartilhamentos+salvos sobre
 *    seguidores. De um concorrente só temos curtidas e comentários — então
 *    a saída carrega `completa: false` e quem desenha a tela é obrigado a
 *    dizer isso.
 */

/** Os quatro numeradores da fórmula de mercado. */
export interface Interacoes {
  curtidas: number | null
  comentarios: number | null
  /** Só existe para post próprio — a API não dá de terceiro. */
  compartilhamentos?: number | null
  /** Só existe para post próprio. */
  salvos?: number | null
}

export interface TaxaDeEngajamento {
  /** Percentual, já ×100. `null` quando não há denominador. */
  valor: number | null
  /** Falso quando faltam compartilhamentos e salvos (caso do concorrente). */
  completa: boolean
  /** A fórmula, para a tela poder mostrar de onde veio o número. */
  formula: string
}

/**
 * Taxa de engajamento sobre seguidores — a fórmula que Socialinsider e os
 * relatórios de benchmark usam, para o número ser comparável com as
 * medianas publicadas.
 */
export function taxaDeEngajamento(i: Interacoes, seguidores: number | null): TaxaDeEngajamento {
  const completa = i.compartilhamentos != null && i.salvos != null
  const formula = completa
    ? "(curtidas + comentários + compartilhamentos + salvos) ÷ seguidores × 100"
    : "(curtidas + comentários) ÷ seguidores × 100"

  if (!seguidores || seguidores <= 0) return { valor: null, completa, formula }

  const soma =
    (i.curtidas ?? 0) +
    (i.comentarios ?? 0) +
    (i.compartilhamentos ?? 0) +
    (i.salvos ?? 0)

  return { valor: (soma / seguidores) * 100, completa, formula }
}

/**
 * Razão por alcance. Sem alcance devolve `null` — nunca zero.
 *
 * É a forma dos três sinais de ranking: `sends ÷ reach`, `likes ÷ reach`,
 * `saves ÷ reach`.
 */
export function porAlcance(parte: number | null | undefined, alcance: number | null | undefined): number | null {
  if (alcance == null || alcance <= 0) return null
  if (parte == null) return null
  return (parte / alcance) * 100
}

/**
 * Watch time médio em segundos.
 *
 * A API entrega milissegundos. Valor negativo ou não finito é descartado:
 * métrica impossível é ausência, não zero.
 */
export function segundosDeWatchTime(ms: number | null | undefined): number | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null
  return ms / 1000
}

/** O que a Graph API devolve por mídia. As chaves são os nomes da API. */
export interface InsightsDaApi {
  reach?: number | null
  saved?: number | null
  shares?: number | null
  total_interactions?: number | null
  follows?: number | null
  profile_visits?: number | null
  views?: number | null
  ig_reels_avg_watch_time?: number | null
}

/** O que vai para as colunas de `conteudo_ig_media`. */
export interface ColunasDeInsight {
  reach: number | null
  saved: number | null
  shares: number | null
  total_interactions: number | null
  follows: number | null
  profile_visits: number | null
  views: number | null
  avg_watch_time_ms: number | null
}

/**
 * Traduz o nome da API para o nome da coluna.
 *
 * Existe porque `ig_reels_avg_watch_time` é o único nome que não serve
 * como coluna, e espalhar essa tradução pelo serviço é como se perde a
 * métrica na fronteira — o modo de falha do `usageOf`, que copia campo a
 * campo e deixa sumir o que não foi copiado.
 */
export function colunasDeInsight(api: InsightsDaApi): ColunasDeInsight {
  return {
    reach: api.reach ?? null,
    saved: api.saved ?? null,
    shares: api.shares ?? null,
    total_interactions: api.total_interactions ?? null,
    follows: api.follows ?? null,
    profile_visits: api.profile_visits ?? null,
    views: api.views ?? null,
    avg_watch_time_ms: api.ig_reels_avg_watch_time ?? null,
  }
}

/** Medianas publicadas para 2026, com a fonte — a tela nomeia as duas. */
export const MEDIANAS_DE_MERCADO = [
  { fonte: "Rival IQ", valor: 0.3, nota: "18 setores, mediana por post sobre seguidores" },
  { fonte: "Socialinsider", valor: 0.48, nota: "70 milhões de posts, mesma fórmula" },
] as const

/**
 * Onde a nossa taxa cai contra as medianas publicadas.
 *
 * Devolve `null` sem taxa: dizer "abaixo do mercado" sobre um número que
 * não existe é o alarme falso que ensina a ignorar o alarme.
 */
export function contraMercado(taxa: number | null): { fonte: string; diferenca: number }[] | null {
  if (taxa == null) return null
  return MEDIANAS_DE_MERCADO.map((m) => ({ fonte: m.fonte, diferenca: taxa - m.valor }))
}

// ── Agregação no período ────────────────────────────────────────────────

export interface PostParaSinais {
  alc: number | null
  sh: number | null
  curtidas: number | null
  watchTimeS: number | null
}

export interface SinaisDoPeriodo {
  /** Sends ÷ alcance do período, em percentual. `null` sem alcance. */
  sendsPorAlcance: number | null
  /** Likes ÷ alcance do período, em percentual. */
  curtidasPorAlcance: number | null
  /** Média de tempo assistido, em segundos, entre os que TÊM a métrica. */
  watchTimeMedioS: number | null
  /** Quantos posts entraram na média de watch time — o piso de amostra. */
  postsComWatchTime: number
  /** Quantos posts têm alcance; sem isso as razões não existem. */
  postsComAlcance: number
}

/**
 * Sinais do período inteiro.
 *
 * A razão é **soma ÷ soma**, nunca média das razões por post: média de
 * médias dá peso igual ao post de 50 de alcance e ao de 5.000, e o número
 * passa a descrever uma conta que não existe.
 *
 * Watch time é o oposto — ali a média É por peça, porque a pergunta é
 * "quanto tempo o espectador típico fica", não "quantos segundos no
 * total". Post sem a métrica fica FORA da conta em vez de entrar como
 * zero, e `postsComWatchTime` diz sobre quantos a média foi feita.
 */
export function sinaisDoPeriodo(posts: readonly PostParaSinais[]): SinaisDoPeriodo {
  let alcance = 0
  let sends = 0
  let curtidas = 0
  let comAlcance = 0

  const watch: number[] = []

  for (const p of posts) {
    if (p.alc != null && p.alc > 0) {
      alcance += p.alc
      comAlcance++
      if (p.sh != null) sends += p.sh
      if (p.curtidas != null) curtidas += p.curtidas
    }
    if (p.watchTimeS != null) watch.push(p.watchTimeS)
  }

  return {
    sendsPorAlcance: alcance > 0 ? (sends / alcance) * 100 : null,
    curtidasPorAlcance: alcance > 0 ? (curtidas / alcance) * 100 : null,
    watchTimeMedioS: watch.length > 0 ? watch.reduce((a, b) => a + b, 0) / watch.length : null,
    postsComWatchTime: watch.length,
    postsComAlcance: comAlcance,
  }
}

// ── Que métricas pedir à Meta, por tipo de mídia ────────────────────────

/**
 * A escada de conjuntos de insight, do mais rico ao mais básico.
 *
 * **Medido em produção (11/09), não suposto.** A Media Insights API
 * RECUSA `follows` e `profile_visits` para reels — inclusive pedindo
 * `follows` sozinho, o que descarta "é problema de combinação":
 *
 * > (#100) The Media Insights API does not support the follows metric
 * > for this media product type.
 *
 * Consequência que a base confirma: dos 69 reels da org, ZERO têm
 * `follows`; dos 19 do feed, 19/19 têm. A escada de vídeo sempre caiu
 * dois degraus para reels — e `ig_reels_avg_watch_time` morava só no
 * degrau de cima, então **nunca teria sido coletado**, com a coluna, o
 * KPI e os testes todos corretos e o número em "—" para sempre.
 *
 * Daí a regra: **métrica que só existe no degrau mais alto é métrica
 * que pode nunca ser coletada.** O watch time anda em DOIS degraus, e
 * pedir para reels o que a Meta declara não servir é gastar a chamada
 * para garantir a queda.
 */
export const SETS_REELS: readonly (readonly string[])[] = [
  ["reach", "saved", "shares", "total_interactions", "views", "ig_reels_avg_watch_time"],
  ["reach", "saved", "shares", "views", "ig_reels_avg_watch_time"],
  ["reach", "saved", "shares", "total_interactions", "views"],
  ["reach", "saved", "shares"],
  ["reach", "saved"],
]

/** Vídeo que NÃO é reel (feed/IGTV): aceita follows, e watch time é de reel. */
export const SETS_VIDEO_FEED: readonly (readonly string[])[] = [
  ["reach", "saved", "shares", "total_interactions", "views", "follows", "profile_visits"],
  ["reach", "saved", "shares", "total_interactions", "views"],
  ["reach", "saved", "shares"],
  ["reach", "saved"],
]

/** Imagem e carrossel — medido: 19/19 respondem ao conjunto cheio. */
export const SETS_FEED: readonly (readonly string[])[] = [
  ["reach", "saved", "shares", "total_interactions", "follows", "profile_visits"],
  ["reach", "saved", "shares", "total_interactions"],
  ["reach", "saved"],
]

/**
 * `productType` decide antes de `mediaType`: o erro da Meta fala em
 * "media product type", e é REELS que recusa follows. Product type
 * desconhecido com mídia de vídeo cai na escada de reels — hoje todo
 * vídeo da base é reel, e pedir follows garantiria a queda do degrau.
 */
export function conjuntosDeInsight(mediaType: string | null, productType?: string | null): readonly (readonly string[])[] {
  if (productType === "REELS") return SETS_REELS
  if (mediaType !== "VIDEO") return SETS_FEED
  return productType ? SETS_VIDEO_FEED : SETS_REELS
}

/** A métrica é pedida em ALGUM degrau desta escada? */
export function escadaPede(escada: readonly (readonly string[])[], metrica: string): boolean {
  return escada.some((s) => s.includes(metrica))
}

/**
 * Por que este campo está vazio neste post.
 *
 * A Media Insights API recusa `follows` e `profile_visits` para reels —
 * medido em 11/09, pedindo cada um sozinho. Como 78% da base é reel, a
 * coluna "Seguidores" mostra "—" na maioria das linhas: sem esta frase o
 * operador lê como "este reel não trouxe ninguém", que é o contrário de
 * "a Meta não conta isso por reel".
 */
export function motivoDaAusencia(campo: "seg" | "visitasPerfil" | "watchTimeS", ehReel: boolean): string | null {
  if (campo === "watchTimeS") return ehReel ? null : "watch time só existe em reel"
  return ehReel ? "a Meta não informa esta métrica por reel" : null
}
