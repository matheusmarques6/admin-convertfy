/**
 * Normalização da reunião do Fathom para o formato que a casa guarda
 * (puro, testável, client-safe).
 *
 * A API devolve muita coisa e em formatos que variam por plano/versão
 * (`default_summary` pode vir como objeto ou string, `action_items`
 * pode não vir). Aqui tudo vira um digest previsível — e o que não
 * veio fica ausente em vez de virar string "undefined" no banco.
 *
 * `transcript` é achatado em texto porque o consumo é por leitura
 * humana e por prompt de IA; guardar o array cru só inflaria a linha.
 */

export interface FathomActionItem {
  description: string
  completed: boolean
  assignee: string | null
  playback_url: string | null
  timestamp: string | null
}

export interface FathomParticipant {
  name: string | null
  email: string | null
  is_external: boolean
}

export interface FathomDigest {
  recording_id: string
  title: string | null
  url: string | null
  share_url: string | null
  /** Início da gravação (fallback: agendado, depois criado). */
  started_at: string | null
  duration_minutes: number | null
  summary_markdown: string | null
  action_items: FathomActionItem[]
  participants: FathomParticipant[]
  transcript: string | null
}

/** Shape parcial do meeting da API — só o que consumimos. */
export interface FathomMeetingRaw {
  recording_id?: number | string | null
  title?: string | null
  meeting_title?: string | null
  url?: string | null
  share_url?: string | null
  created_at?: string | null
  scheduled_start_time?: string | null
  scheduled_end_time?: string | null
  recording_start_time?: string | null
  recording_end_time?: string | null
  default_summary?: { markdown_formatted?: string | null } | string | null
  action_items?: Array<{
    description?: string | null
    completed?: boolean | null
    recording_playback_url?: string | null
    recording_timestamp?: string | number | null
    assignee?: { name?: string | null; email?: string | null } | string | null
  }> | null
  calendar_invitees?: Array<{
    name?: string | null
    email?: string | null
    is_external?: boolean | null
  }> | null
  transcript?: Array<{
    speaker?: { display_name?: string | null } | string | null
    text?: string | null
  }> | string | null
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t ? t : null
}

function minutesBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const a = Date.parse(start)
  const b = Date.parse(end)
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null
  return Math.max(1, Math.round((b - a) / 60_000))
}

function summaryOf(raw: FathomMeetingRaw["default_summary"]): string | null {
  if (typeof raw === "string") return str(raw)
  if (raw && typeof raw === "object") return str(raw.markdown_formatted)
  return null
}

function transcriptOf(raw: FathomMeetingRaw["transcript"]): string | null {
  if (typeof raw === "string") return str(raw)
  if (!Array.isArray(raw)) return null
  const lines = raw
    .map((item) => {
      const speaker =
        typeof item?.speaker === "string"
          ? str(item.speaker)
          : str(item?.speaker?.display_name)
      const text = str(item?.text)
      if (!text) return null
      return speaker ? `${speaker}: ${text}` : text
    })
    .filter((l): l is string => l !== null)
  return lines.length > 0 ? lines.join("\n") : null
}

export function buildFathomDigest(raw: FathomMeetingRaw): FathomDigest | null {
  const recordingId =
    raw.recording_id === 0 || raw.recording_id
      ? String(raw.recording_id).trim()
      : ""
  if (!recordingId) return null

  const startedAt =
    str(raw.recording_start_time) ?? str(raw.scheduled_start_time) ?? str(raw.created_at)

  return {
    recording_id: recordingId,
    title: str(raw.meeting_title) ?? str(raw.title),
    url: str(raw.url),
    share_url: str(raw.share_url),
    started_at: startedAt,
    duration_minutes:
      minutesBetween(str(raw.recording_start_time), str(raw.recording_end_time)) ??
      minutesBetween(str(raw.scheduled_start_time), str(raw.scheduled_end_time)),
    summary_markdown: summaryOf(raw.default_summary),
    action_items: (raw.action_items ?? [])
      .map((item) => {
        const description = str(item?.description)
        if (!description) return null
        const assignee =
          typeof item?.assignee === "string"
            ? str(item.assignee)
            : (str(item?.assignee?.name) ?? str(item?.assignee?.email))
        return {
          description,
          completed: item?.completed === true,
          assignee,
          playback_url: str(item?.recording_playback_url),
          timestamp:
            item?.recording_timestamp == null ? null : String(item.recording_timestamp),
        }
      })
      .filter((i): i is FathomActionItem => i !== null),
    participants: (raw.calendar_invitees ?? [])
      .map((p) => ({
        name: str(p?.name),
        email: str(p?.email),
        is_external: p?.is_external === true,
      }))
      .filter((p) => p.name !== null || p.email !== null),
    transcript: transcriptOf(raw.transcript),
  }
}

/**
 * Texto de `notes` derivado do digest — o que aparece no card da call
 * e no histórico quando o operador não escreveu nada à mão. Resumo do
 * Fathom primeiro; itens de ação viram lista logo abaixo.
 */
export function digestToNotes(digest: FathomDigest, manualNote?: string | null): string {
  const parts: string[] = []
  const manual = str(manualNote ?? null)
  if (manual) parts.push(manual)
  if (digest.summary_markdown) parts.push(digest.summary_markdown)
  if (digest.action_items.length > 0) {
    parts.push(
      ["**Itens de ação**", ...digest.action_items.map((i) => `- ${i.description}`)].join("\n"),
    )
  }
  return parts.join("\n\n").trim()
}

/** Itens de ação em TEXTO (coluna legada action_items). */
export function digestToActionItemsText(digest: FathomDigest): string | null {
  if (digest.action_items.length === 0) return null
  return digest.action_items.map((i) => `- ${i.description}`).join("\n")
}
