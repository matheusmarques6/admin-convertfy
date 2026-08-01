/**
 * SLA de resposta do inbox — quem está esperando e há quanto tempo.
 *
 * Uma conversa está "aguardando" quando a última mensagem é do CONTATO
 * e a conversa não foi resolvida: a bola está com o time. O tempo de
 * espera usa `last_message_at` — proxy honesto sem mudança de schema
 * (se o contato mandou 3 mensagens seguidas, conta da última; o número
 * real seria maior, nunca menor... na verdade conta da mais recente,
 * então SUBestima — preferível a inventar precisão que o dado não tem).
 *
 * Faixas pensadas para atendimento comercial em rede social, onde a
 * expectativa de resposta é minutos, não horas:
 *   ok       < 15min — dentro do combinado
 *   warn     15–60min — atenção
 *   critical > 60min — lead esfriando
 */

export interface SlaThread {
  status: string
  last_message_at: string
  last_message_direction: string | null
}

export type SlaLevel = "ok" | "warn" | "critical"

export const SLA_WARN_MINUTES = 15
export const SLA_CRITICAL_MINUTES = 60

export interface WaitingInfo {
  waiting: boolean
  minutes: number
  level: SlaLevel
}

export function waitingInfo(thread: SlaThread, now: number): WaitingInfo {
  const isWaiting =
    thread.last_message_direction === "inbound" &&
    (thread.status === "open" || thread.status === "pending")

  if (!isWaiting) return { waiting: false, minutes: 0, level: "ok" }

  const ms = now - Date.parse(thread.last_message_at)
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  const level: SlaLevel =
    minutes >= SLA_CRITICAL_MINUTES ? "critical" : minutes >= SLA_WARN_MINUTES ? "warn" : "ok"

  return { waiting: true, minutes, level }
}

/** "32m", "1h05", "3h", "2d" — curto o bastante pra caber no badge. */
export function formatWait(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  if (minutes < 600) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`
  }
  if (minutes < 2880) return `${Math.floor(minutes / 60)}h`
  return `${Math.floor(minutes / 1440)}d`
}

/**
 * Ordena como fila de atendimento: quem espera há MAIS tempo primeiro
 * (é quem está esfriando), depois as demais por atividade recente.
 * Não muta a lista.
 */
export function sortThreadsAsQueue<T extends SlaThread>(threads: T[], now: number): T[] {
  return threads.slice().sort((a, b) => {
    const wa = waitingInfo(a, now)
    const wb = waitingInfo(b, now)
    if (wa.waiting !== wb.waiting) return wa.waiting ? -1 : 1
    if (wa.waiting && wb.waiting) return wb.minutes - wa.minutes
    return Date.parse(b.last_message_at) - Date.parse(a.last_message_at)
  })
}
