/**
 * Validade do radar editorial — o que "em alta" significa passados uns dias.
 *
 * O painel "Em alta" existia e nunca rodou: `conteudo_trends` tinha **zero
 * linhas** em produção, porque a única entrada era um botão e ninguém clicou.
 * Ligar um cron diário resolve o vazio e cria o problema oposto: rodada que
 * só ACRESCENTA transforma o painel num arquivo, e um assunto de três semanas
 * atrás passa a disputar espaço com o de hoje sob o rótulo "em alta". É
 * mentira, e é a mentira mais fácil de não perceber — o card continua com a
 * mesma cara.
 *
 * ## As regras
 *
 * 1. **"Em alta" é a RODADA MAIS RECENTE, não uma janela de horas.** Todas as
 *    linhas de uma rodada compartilham o mesmo `gerado_em` (é um
 *    `new Date()` só), então o grupo é exato e não depende de escolher um
 *    horizonte. Um número de horas seria chute; isto é medição.
 * 2. **Assunto expira, e expirar é ARQUIVAR (`ativo = false`), não apagar.**
 *    Quem virou ideia mantém o vínculo (`conteudo_ideias.trend_id`), e o
 *    histórico responde "o que o radar já propôs".
 * 3. **Painel vazio depois de uma rodada NÃO é "nunca gerado".** São estados
 *    diferentes e pedem ações opostas: um diz "ligue o radar", o outro diz
 *    "a última rodada foi há N dias e tudo já venceu". Por isso a idade da
 *    última rodada é lida INCLUSIVE das linhas arquivadas.
 */

/** A forma mínima de que as regras precisam — serve à linha do banco e à da tela. */
export interface AssuntoDatado {
  id: string
  geradoEm: string
  score: number
}

/**
 * Dias que um assunto fica no painel.
 *
 * DECISÃO, não medição: duas voltas do ciclo semanal do pipeline de Reels
 * (ideia → roteiro → gravar → editar → agendar leva dias). Passadas duas
 * semanas sem ninguém pegar o assunto, ele não foi recusado por falta de
 * tempo — e mantê-lo no painel é mostrar ao time o que ele já declinou.
 */
export const VALIDADE_DIAS = 14

/**
 * Margem que agrupa as linhas de uma mesma rodada.
 *
 * Dentro de uma org os inserts nascem com o mesmo instante; a folga existe
 * para o relógio do banco e para um `upsert` que atravesse o segundo. Longe
 * o bastante de um dia para nunca fundir duas rodadas diárias.
 */
export const JANELA_DA_RODADA_MS = 10 * 60 * 1000

/** Abaixo disto o cron pula a org: uma rodada por dia, e o dia é do cron. */
export const INTERVALO_MINIMO_HORAS = 20

const ms = (iso: string): number | null => {
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : null
}

/** Idade em horas. `null` quando a data não é legível — nunca 0. */
export function idadeEmHoras(geradoEm: string | null, agora: number = Date.now()): number | null {
  if (!geradoEm) return null
  const t = ms(geradoEm)
  if (t == null) return null
  return (agora - t) / 3_600_000
}

/**
 * Ids que passaram da validade.
 *
 * Data ilegível NÃO expira: apagar do painel o que não se conseguiu medir é
 * a mesma família de erro que contar não medido como zero.
 */
export function expirados(assuntos: readonly AssuntoDatado[], agora: number = Date.now()): string[] {
  const limite = VALIDADE_DIAS * 24
  return assuntos
    .filter((a) => {
      const h = idadeEmHoras(a.geradoEm, agora)
      return h != null && h > limite
    })
    .map((a) => a.id)
}

/** Os ids da rodada mais recente — o que o painel pode chamar de "em alta". */
export function daRodadaMaisRecente<T extends AssuntoDatado>(assuntos: readonly T[]): Set<string> {
  let topo: number | null = null
  for (const a of assuntos) {
    const t = ms(a.geradoEm)
    if (t != null && (topo == null || t > topo)) topo = t
  }
  if (topo == null) return new Set()
  const corte = topo - JANELA_DA_RODADA_MS
  return new Set(assuntos.filter((a) => (ms(a.geradoEm) ?? -Infinity) >= corte).map((a) => a.id))
}

/**
 * Ordem do painel: a rodada mais recente primeiro, score dentro de cada faixa.
 *
 * Ordenar só por score deixaria um 92 de três dias atrás acima do 88 de hoje
 * para sempre — e o painel se chama "em alta". Um decaimento por idade
 * resolveria também, mas a curva seria inventada; a faixa é dado.
 */
export function ordenarParaOPainel<T extends AssuntoDatado>(assuntos: readonly T[]): T[] {
  const recentes = daRodadaMaisRecente(assuntos)
  return [...assuntos].sort((a, b) => {
    const fa = recentes.has(a.id) ? 0 : 1
    const fb = recentes.has(b.id) ? 0 : 1
    if (fa !== fb) return fa - fb
    if (b.score !== a.score) return b.score - a.score
    const ta = ms(a.geradoEm) ?? 0
    const tb = ms(b.geradoEm) ?? 0
    if (tb !== ta) return tb - ta
    return a.id.localeCompare(b.id) // estável entre renders
  })
}

/**
 * O cron deve rodar para esta org?
 *
 * Nunca rodou ⇒ sim. Rodou há pouco ⇒ não: invocar o cron duas vezes no
 * mesmo dia (retry da plataforma, disparo manual) não pode custar duas
 * chamadas de modelo. Data ilegível ⇒ sim, porque não saber quando rodou é
 * indistinguível de não ter rodado.
 */
export function precisaRodar(ultimaRodada: string | null, agora: number = Date.now()): boolean {
  if (!ultimaRodada) return true
  const h = idadeEmHoras(ultimaRodada, agora)
  if (h == null) return true
  return h >= INTERVALO_MINIMO_HORAS
}

/** "há 2h", "há 3 dias". `null` vira "nunca" no chamador, não aqui. */
export function idadeCurta(geradoEm: string | null, agora: number = Date.now()): string | null {
  const h = idadeEmHoras(geradoEm, agora)
  if (h == null) return null
  if (h < 0) return "agora"
  const min = Math.floor(h * 60)
  if (min < 2) return "agora"
  if (min < 60) return `há ${min} min`
  const horas = Math.floor(h)
  if (horas < 24) return `há ${horas}h`
  const d = Math.floor(horas / 24)
  return d === 1 ? "há 1 dia" : `há ${d} dias`
}
