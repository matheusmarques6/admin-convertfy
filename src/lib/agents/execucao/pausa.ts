/**
 * pausa — o fim da pausa de uma execução manual.
 *
 * ── O que foi medido (15/09) ──────────────────────────────────────────
 *
 * A execução `8658d1a8` estava `paused` no nó `color_format` desde
 * **10/09 23:13** — cinco dias. Com ela, o e-mail `758f05de` seguia
 * `rendering` no banco e "rodando" na tela, e nada no sistema podia mudar
 * isso:
 *
 *   • `emailsComExecucaoPausada` protege o e-mail de TODOS os fronts do
 *     watchdog, sem prazo — por desenho, e o desenho está certo: "parar no
 *     nó X e sair para almoçar" não pode devolver `failed:timeout_phase2`.
 *   • `uniq_ege_manual_viva` é `WHERE status IN ('running','paused')`, então
 *     o e-mail fica TRANCADO: todo disparo manual novo tomava 409 ("cancele
 *     a execução em curso"), para sempre.
 *
 * O princípio não estava errado — faltava o outro lado dele. **Um almoço
 * tem fim; a pausa não tinha.** Quem pausa e não volta não está esperando:
 * abandonou, e o e-mail não pode ficar refém disso.
 *
 * ── A régua ──────────────────────────────────────────────────────────
 *
 * O prazo é generoso de propósito. Ele não existe para adivinhar quanto o
 * operador demora — existe para que "abandonei" pare de ser
 * indistinguível de "já volto". Cortar curto devolveria o defeito que a
 * proteção conserta (a execução morta no almoço); cortar em dias é o que
 * já acontece hoje.
 *
 * Expirar NÃO é matar a geração: é só soltar o e-mail. O que acontece com
 * ele depois é decisão dos fronts de sempre, com as réguas de sempre — a
 * pausa some da frente deles, e nada mais.
 *
 * Puro (zero I/O): quem lê e escreve é o watchdog.
 */

/**
 * Quanto tempo uma execução manual pode ficar pausada antes de o e-mail ser
 * devolvido ao watchdog.
 *
 * 12 h cobre um dia de trabalho inteiro — quem parou no nó X de manhã e
 * volta depois do almoço, ou no fim da tarde, encontra a pausa de pé. O que
 * ela não cobre é atravessar a noite, que é justamente onde "pausado" vira
 * "esquecido".
 */
export const PAUSA_MAX_MS = 12 * 60 * 60 * 1000

/** Motivo gravado na execução expirada — texto de gente, não código. */
export const MOTIVO_PAUSA_EXPIRADA =
  "pausa abandonada: ninguém retomou nem cancelou dentro do prazo, e o e-mail foi devolvido ao watchdog"

export interface ExecucaoPausada {
  id: string
  email_id: string
  /**
   * Quando a pausa começou. `updated_at` é o carimbo certo: o trigger da
   * tabela usa `clock_timestamp()` e `pausarExecucao` é a última escrita da
   * linha, então ele marca o INSTANTE da pausa — e não o início da execução,
   * que pode ter rodado meia hora antes de parar.
   */
  updated_at?: string | null
  /** Fallback quando `updated_at` não veio (linha anterior ao trigger). */
  started_at?: string | null
}

export interface TriagemDePausas {
  /** Pausas ainda válidas: continuam protegidas do watchdog. */
  vivas: ExecucaoPausada[]
  /** Pausas vencidas: devem ser fechadas e o e-mail liberado. */
  expiradas: ExecucaoPausada[]
}

/**
 * Separa as pausas que ainda valem das que venceram.
 *
 * **Carimbo ilegível conta como VIVA**, e é decisão: sem data não se sabe
 * há quanto tempo a pausa dura, e expirar no escuro derrubaria a proteção
 * justamente onde ela não pôde ser medida. O lado seguro do erro aqui é
 * proteger a mais — o operador ainda tem o botão de cancelar, e o zumbi
 * fica visível na tela como execução pausada.
 */
export function triarPausas(
  pausadas: readonly ExecucaoPausada[],
  agora: number = Date.now(),
  tetoMs: number = PAUSA_MAX_MS,
): TriagemDePausas {
  const vivas: ExecucaoPausada[] = []
  const expiradas: ExecucaoPausada[] = []
  for (const p of pausadas) {
    const idade = idadeDaPausa(p, agora)
    if (idade != null && idade > tetoMs) expiradas.push(p)
    else vivas.push(p)
  }
  return { vivas, expiradas }
}

/** Milissegundos desde o início da pausa; `null` quando não há carimbo legível. */
export function idadeDaPausa(
  p: Pick<ExecucaoPausada, "updated_at" | "started_at">,
  agora: number = Date.now(),
): number | null {
  for (const iso of [p.updated_at, p.started_at]) {
    if (!iso) continue
    const t = Date.parse(iso)
    if (Number.isFinite(t)) return agora - t
  }
  return null
}

/** "há 5 dias" / "há 3 h" / "há 40 min" — para o log e para a tela. */
export function descreverIdadeDaPausa(idadeMs: number): string {
  const min = Math.round(idadeMs / 60000)
  if (min < 60) return `há ${min} min`
  const horas = Math.round(min / 60)
  if (horas < 48) return `há ${horas} h`
  return `há ${Math.round(horas / 24)} dias`
}
