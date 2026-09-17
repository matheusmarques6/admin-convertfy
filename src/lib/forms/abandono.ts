/**
 * O que conta como abandono, e o que o vendedor precisa ler sobre ele.
 *
 * Puro e testado porque as três decisões aqui erram em silêncio:
 *
 * 1. **Quando.** Cedo demais e o telefone toca enquanto a pessoa ainda
 *    está na terceira pergunta. Tarde demais e o lead esfria. A janela é
 *    por formulário, com piso e teto — um zero digitado no editor viraria
 *    "ligue agora para quem acabou de abrir a página".
 * 2. **Quem.** Sessão que só VIU a página não é abandono de formulário, é
 *    visita — e o formulário já conta visitas. Quem respondeu mas não
 *    deixou contato também não vira lead: não há como falar com ele. Os
 *    dois casos saem da fila mesmo assim, senão o cron os reprocessa para
 *    sempre.
 * 3. **O quê.** O texto que chega na timeline é o produto: sem a pergunta
 *    onde a pessoa parou e o que ela já tinha respondido, o vendedor liga
 *    sem saber de nada e queima o contato.
 */

import type { FormAnswers, FormBlock, FormSchema } from "@/types/forms-conversational"
import { TIPOS_SEM_RESPOSTA } from "@/types/forms-conversational"
import { respostaComoTexto } from "./recall"
import { respostaVazia } from "./validacao"

/** Piso e teto da janela. Fora disso é erro de cadastro, não escolha. */
export const JANELA_MIN_MINUTOS = 5
export const JANELA_MAX_MINUTOS = 24 * 60
export const JANELA_PADRAO_MINUTOS = 20

export function janelaDeAbandonoMs(settings: unknown): number {
  const bruto = (settings as { abandono_minutos?: unknown } | null)?.abandono_minutos
  const n = typeof bruto === "number" && Number.isFinite(bruto) ? bruto : JANELA_PADRAO_MINUTOS
  const clamp = Math.min(Math.max(n, JANELA_MIN_MINUTOS), JANELA_MAX_MINUTOS)
  return clamp * 60_000
}

export type ClasseDeAbandono = "com_contato" | "sem_contato" | "so_visita"

export interface SessaoParaAbandono {
  status: string
  answers: FormAnswers
  last_activity_at: string
  completed_at: string | null
  abandon_processed_at: string | null
}

/** Status que já terminaram: nunca são abandono. */
const TERMINAIS = new Set(["completed", "disqualified", "abandoned"])

export function ehAbandono(s: SessaoParaAbandono, agoraMs: number, janelaMs: number): boolean {
  if (s.completed_at || s.abandon_processed_at) return false
  if (TERMINAIS.has(s.status)) return false
  const ultima = Date.parse(s.last_activity_at)
  if (!Number.isFinite(ultima)) return false
  return agoraMs - ultima >= janelaMs
}

/**
 * O que dá para fazer com esta sessão.
 *
 * `so_visita` é quem abriu e não respondeu nada — é métrica de funil, não
 * lead. `sem_contato` respondeu alguma coisa mas não deixou como falar
 * com ele: vira registro, não lead, porque lead sem email nem telefone
 * enche o CRM de linha morta.
 */
export function classificarAbandono(
  schema: FormSchema,
  answers: FormAnswers,
  contato: { email: string | null; phone: string | null },
): ClasseDeAbandono {
  const respondeu = schema.blocks.some(
    (b) => !b.hidden && !TIPOS_SEM_RESPOSTA.has(b.type) && !respostaVazia(answers[b.ref]),
  )
  if (!respondeu) return "so_visita"
  return contato.email || contato.phone ? "com_contato" : "sem_contato"
}

export interface ResumoDoAbandono {
  /** A pergunta onde parou, já com o label legível. */
  parouEm: string | null
  respondidas: number
  total: number
  /** Pares "pergunta: resposta" na ordem do formulário. */
  respostas: Array<{ pergunta: string; resposta: string }>
}

export function resumirAbandono(
  schema: FormSchema,
  answers: FormAnswers,
  blocoParado: FormBlock | null,
): ResumoDoAbandono {
  const perguntaveis = schema.blocks.filter((b) => !b.hidden && !TIPOS_SEM_RESPOSTA.has(b.type))
  const respostas = perguntaveis
    .filter((b) => !respostaVazia(answers[b.ref]))
    .map((b) => ({ pergunta: b.label || b.ref, resposta: respostaComoTexto(answers[b.ref]) }))

  return {
    parouEm: blocoParado ? blocoParado.label || blocoParado.ref : null,
    respondidas: respostas.length,
    total: perguntaveis.length,
    respostas,
  }
}

/**
 * O texto da atividade na timeline do negócio.
 *
 * Escrito para ser lido em dois segundos antes de uma ligação: a pergunta
 * que travou primeiro, o que a pessoa já disse, e desde quando ela sumiu.
 */
export function textoDaTimeline(
  r: ResumoDoAbandono,
  form: { name: string },
  opts: { quandoParou?: string | null; linkDeRetomada?: string | null } = {},
): string {
  const linhas: string[] = []
  linhas.push(
    `Abandonou o formulário "${form.name}" em ${r.respondidas} de ${r.total} ${
      r.total === 1 ? "pergunta" : "perguntas"
    }.`,
  )
  if (r.parouEm) linhas.push(`Parou em: ${r.parouEm}`)
  if (opts.quandoParou) linhas.push(`Última atividade: ${opts.quandoParou}`)
  if (r.respostas.length > 0) {
    linhas.push("")
    linhas.push("O que respondeu:")
    for (const x of r.respostas) linhas.push(`• ${x.pergunta} → ${x.resposta}`)
  }
  if (opts.linkDeRetomada) {
    linhas.push("")
    linhas.push(`Link para ele continuar de onde parou: ${opts.linkDeRetomada}`)
  }
  return linhas.join("\n")
}

/**
 * O título do negócio.
 *
 * Leva o marcador do abandono no NOME, não só na etapa: o card aparece em
 * busca, em relatório e em lista fora da etapa, e ali "Bruno" sozinho é
 * indistinguível de quem preencheu tudo.
 */
export function tituloDoNegocio(
  contato: { name: string | null; email: string | null; phone: string | null },
  form: { name: string },
): string {
  const quem = contato.name?.trim() || contato.email?.trim() || contato.phone?.trim() || "Sem nome"
  return `${quem} — abandonou ${form.name}`
}
