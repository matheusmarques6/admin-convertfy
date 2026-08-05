/**
 * Formatação da conversa: agrupamento por dia e autoria da mensagem.
 *
 * Duas perguntas que o inbox não respondia e que são o essencial da
 * leitura de um atendimento:
 *
 * 1. QUANDO foi dito. As mensagens eram uma pilha plana com só HH:MM em
 *    cada bolha — uma conversa de três semanas virava uma parede sem
 *    nenhuma marca de tempo. Agora cada dia ganha um separador.
 * 2. QUEM disse. Toda mensagem enviada era idêntica, viesse do atendente
 *    pelo inbox, de uma automação ou do celular pareado. Num time com
 *    vários atendentes isso torna a conversa impossível de auditar.
 *
 * Módulo puro (sem React, sem I/O) para poder ser testado direto.
 */

/**
 * Valores conhecidos: contact | agent | automation | system. Tipado
 * como string porque a coluna é livre no banco e um valor novo não
 * pode quebrar o build da tela.
 */
export type InboxSenderKind = string | null | undefined

export interface FormatMessage {
  id: string
  created_at: string
  direction: string
  sent_by_kind?: InboxSenderKind
  sender?: { id: string; name: string | null; avatar_url?: string | null } | null
}

export interface DayGroup<T> {
  /** Chave estável (YYYY-MM-DD na hora local) — serve de React key. */
  key: string
  label: string
  messages: T[]
}

const WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "long" })
const FULL_DATE = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" })
const FULL_DATE_YEAR = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
})

/** YYYY-MM-DD na hora LOCAL (não UTC — senão a virada do dia erra). */
export function localDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function daysBetween(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((db - da) / 86_400_000)
}

/**
 * "Hoje" / "Ontem" / dia da semana (últimos 7 dias) / "12 de março" /
 * com ano quando for de outro ano.
 */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const diff = daysBetween(d, now)
  if (diff === 0) return "Hoje"
  if (diff === 1) return "Ontem"
  if (diff > 1 && diff < 7) {
    const w = WEEKDAY.format(d)
    return w.charAt(0).toUpperCase() + w.slice(1)
  }
  return d.getFullYear() === now.getFullYear() ? FULL_DATE.format(d) : FULL_DATE_YEAR.format(d)
}

/**
 * Agrupa mensagens já ordenadas cronologicamente em blocos por dia.
 * Mensagem com data inválida entra no grupo anterior em vez de sumir —
 * perder mensagem da conversa é sempre pior que um rótulo errado.
 */
export function groupMessagesByDay<T extends FormatMessage>(
  messages: T[],
  now: Date = new Date(),
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const m of messages) {
    const d = new Date(m.created_at)
    if (Number.isNaN(d.getTime())) {
      if (groups.length > 0) groups[groups.length - 1].messages.push(m)
      else groups.push({ key: "sem-data", label: "", messages: [m] })
      continue
    }
    const key = localDayKey(d)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.messages.push(m)
    else groups.push({ key, label: dayLabel(m.created_at, now), messages: [m] })
  }
  return groups
}

export interface AuthorInfo {
  /** Rótulo curto exibido acima da bolha; null = não mostrar nada. */
  label: string | null
  kind: "agent" | "automation" | "device" | "contact" | "unknown"
}

/**
 * Quem mandou a mensagem enviada. Regras:
 * - inbound → é o contato, nada a rotular.
 * - `sender.name` → o atendente que respondeu pelo inbox.
 * - `automation` → veio de um fluxo, não de uma pessoa.
 * - `system` sem remetente no WhatsApp pareado → foi digitada no
 *   CELULAR (o Evolution marca assim o `fromMe`), e distinguir isso é o
 *   que evita a pergunta "quem respondeu esse cliente?".
 */
export function messageAuthor(m: FormatMessage): AuthorInfo {
  if (m.direction === "inbound") return { label: null, kind: "contact" }
  if (m.sent_by_kind === "automation") return { label: "Automação", kind: "automation" }
  const name = m.sender?.name?.trim()
  if (name) return { label: name, kind: "agent" }
  if (m.sent_by_kind === "system") return { label: "Pelo celular", kind: "device" }
  return { label: null, kind: "unknown" }
}

/**
 * Mostra o rótulo de autoria só quando ele MUDA dentro do mesmo bloco —
 * repetir "Bruno" em quinze bolhas seguidas é ruído, não informação.
 */
export function shouldShowAuthor(current: FormatMessage, previous: FormatMessage | undefined): boolean {
  const author = messageAuthor(current)
  if (!author.label) return false
  if (!previous) return true
  if (previous.direction !== current.direction) return true
  const prevAuthor = messageAuthor(previous)
  return prevAuthor.label !== author.label
}
