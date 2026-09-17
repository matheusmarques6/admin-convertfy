/**
 * Sinais de prospecção ativa no card do negócio.
 *
 * A lista do parceiro Luan (431 negócios) carrega em `deals.custom_fields`
 * o que decide a fila do dia: prioridade, segmento de entrada, alerta de
 * dados e quantas tentativas de contato já saíram. Nada disso aparecia no
 * kanban — o operador abria o card pra descobrir se valia abrir.
 *
 * Módulo PURO porque é régua de bloqueio (quem pode ser abordado) e de
 * cor (a prioridade). Os dois erram em silêncio: valor fora do domínio
 * pintado como se fosse válido é pior que campo vazio, e um "pode
 * abordar" errado manda mensagem pra quem pediu pra não ser contatado.
 */

/** Ordinal da lista. P1 é o mais quente. */
export const PRIORIDADES = ["P1", "P2", "P3", "P4"] as const
export type Prioridade = (typeof PRIORIDADES)[number]

/** Segmentos de entrada, na ordem em que a cadência os ataca. */
export const SEGMENTOS = [
  "A · Aluno Luan",
  "B · Fez call, não comprou",
  "C · Agendou, não fez call",
  "D · MQL sem conversa",
  "Aguardando liberação Luan",
] as const
export type Segmento = (typeof SEGMENTOS)[number]

/**
 * Em que pé está a loja do lead. Só "Vendendo" tem fit para a Black
 * Friday agora; o resto é nutrição pra reabordar em janeiro.
 */
export const MATURIDADES = [
  "Sem loja",
  "Em construção",
  "No ar sem vendas",
  "Vendendo",
] as const
export type Maturidade = (typeof MATURIDADES)[number]

/** Tag que marca quem pediu pra não ser contatado. */
export const TAG_NAO_CONTATAR = "nao-contatar"

/** Etapa em que o lead está travado em negociação com o parceiro. */
export const ETAPA_AGUARDANDO = "Aguardando liberação Luan"

export interface SinaisDeProspeccao {
  prioridade: Prioridade | null
  /** Rótulo curto pro card: "A", "B", "C", "D" ou "Aguardando". */
  segmentoCurto: string | null
  /** Valor cheio, pro title e pro drawer. */
  segmento: string | null
  /** Texto do alerta de dados, já aparado. Vazio vira null. */
  alerta: string | null
  /** O alerta fala do telefone? Decide se a abordagem por WhatsApp arrisca. */
  alertaDeTelefone: boolean
  /** Quantos toques já saíram. Ausente ou ilegível vira 0. */
  tentativas: number
  /** Marcado pelo job de SLA quando o toque venceu sem resposta. */
  followupVencido: boolean
  /** Data do próximo contato (YYYY-MM-DD), quando agendada. */
  proximoContato: string | null
  /** Ângulo de abordagem escrito na importação. */
  angulo: string | null
  /** Maturidade da loja, preenchida na qualificação. */
  maturidade: string | null
}

type CamposCrus = Record<string, unknown> | null | undefined

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

/**
 * Número vindo de JSONB: o campo personalizado do tipo `number` chega
 * como number, mas uma importação por CSV grava string. `NaN` num badge
 * renderiza "NaN" na cara do operador, então o ilegível vira 0.
 */
export function contarTentativas(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
  const t = texto(v)
  if (!t) return 0
  const n = Number(t.replace(",", "."))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * A prioridade é comparada contra a lista FECHADA: valor fora dela sai
 * como `null` em vez de virar um badge colorido sobre texto que ninguém
 * definiu. Tolera caixa e espaço porque a origem é planilha.
 */
export function lerPrioridade(v: unknown): Prioridade | null {
  const t = texto(v)
  if (!t) return null
  const alvo = t.toUpperCase().replace(/\s+/g, "")
  return PRIORIDADES.find((p) => p === alvo) ?? null
}

/**
 * "A · Aluno Luan" não cabe no card. O prefixo antes do "·" é o que o
 * operador usa pra falar da coluna ("estou no B"), então é ele que vai
 * no badge — com o valor cheio no `title`. Segmento sem prefixo de
 * letra (Aguardando) é encurtado pela primeira palavra.
 */
export function segmentoCurto(v: unknown): string | null {
  const t = texto(v)
  if (!t) return null
  const [antes] = t.split("·")
  const prefixo = antes.trim()
  if (prefixo.length > 0 && prefixo.length <= 2) return prefixo
  const primeira = t.split(/\s+/)[0]
  return primeira.length > 0 ? primeira : null
}

/**
 * Vale checar telefone? O alerta é texto livre escrito na importação
 * ("telefone com 8 dígitos", "sem telefone"). A busca é por radical,
 * sem acento, porque quem escreveu digitou à mão.
 */
export function alertaFalaDeTelefone(alerta: string | null): boolean {
  if (!alerta) return false
  const limpo = alerta
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
  return /(telefone|celular|whatsapp|whats|fone|ddd)/.test(limpo)
}

/** Lê os sinais de um negócio. Campo ausente nunca vira valor inventado. */
export function sinaisDoNegocio(custom: CamposCrus): SinaisDeProspeccao {
  const c = custom ?? {}
  const alerta = texto(c.alerta_dados)
  return {
    prioridade: lerPrioridade(c.prioridade),
    segmentoCurto: segmentoCurto(c.segmento_parceiro),
    segmento: texto(c.segmento_parceiro),
    alerta,
    alertaDeTelefone: alertaFalaDeTelefone(alerta),
    tentativas: contarTentativas(c.tentativas_contato),
    followupVencido: c.followup_vencido === true || c.followup_vencido === "true",
    proximoContato: texto(c.proximo_contato),
    angulo: texto(c.angulo_abordagem),
    maturidade: texto(c.maturidade_loja),
  }
}

/** Por que a abordagem está bloqueada. `null` = pode abordar. */
export type MotivoDeBloqueio = "aguardando_parceiro" | "nao_contatar" | "sem_telefone"

export interface ContextoDeAbordagem {
  /** Nome da etapa em que o card está. */
  etapa?: string | null
  tags?: string[] | null
  /** Telefone efetivo do contato, como vier. */
  telefone?: string | null
}

/**
 * Pode mandar o toque? Três bloqueios, e nenhum é opinião:
 *
 * - `aguardando_parceiro`: o lead está em negociação ativa com o Luan.
 *   Abordar por fora queima a relação com o parceiro.
 * - `nao_contatar`: a pessoa pediu pra parar. É o único que é decisão
 *   dela, e o mais caro de furar.
 * - `sem_telefone`: sem número não existe wa.me nenhum — o botão só
 *   saberia falhar.
 *
 * A comparação de tag é sem caixa porque a origem é planilha, e a etapa
 * é comparada pelo nome porque é o que o board entrega ao card.
 */
export function motivoDeBloqueio(ctx: ContextoDeAbordagem): MotivoDeBloqueio | null {
  const tags = (ctx.tags ?? []).map((t) => String(t).trim().toLowerCase())
  if (tags.includes(TAG_NAO_CONTATAR)) return "nao_contatar"
  if (texto(ctx.etapa) === ETAPA_AGUARDANDO) return "aguardando_parceiro"
  const digitos = (ctx.telefone ?? "").replace(/\D/g, "")
  if (digitos.length < 10) return "sem_telefone"
  return null
}

export const EXPLICACAO_DO_BLOQUEIO: Record<MotivoDeBloqueio, string> = {
  aguardando_parceiro: "Em negociação com o Luan — não abordar até ele liberar",
  nao_contatar: "Pediu para não ser contatado",
  sem_telefone: "Sem telefone válido para WhatsApp",
}

export function podeAbordar(ctx: ContextoDeAbordagem): boolean {
  return motivoDeBloqueio(ctx) === null
}
