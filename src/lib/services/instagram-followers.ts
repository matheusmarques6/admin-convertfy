/**
 * Histórico de seguidores do Instagram — lógica pura.
 *
 * A API oficial (Graph) NÃO expõe a lista de quem seguiu/deixou de
 * seguir; só o total (`followers_count`). O painel acompanha o
 * crescimento guardando um snapshot diário desse total no config JSONB
 * do canal (`follower_history`) — sem migration — e derivando deltas
 * (1d/7d/30d) por comparação entre snapshots.
 *
 * Client-safe (sem imports de servidor) para a página reusar os deltas.
 */

export interface FollowerSnapshot {
  /** Dia local (America/Sao_Paulo) no formato YYYY-MM-DD. */
  day: string
  followers: number
  follows: number | null
  media: number | null
}

/** ~4 meses de histórico — o suficiente pro delta de 30d com folga. */
export const FOLLOWER_HISTORY_MAX = 120

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Dia local de São Paulo (fuso da operação) — chave dos snapshots. */
export function spDayKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

/** Sanitiza o JSONB vindo do banco (pode ter lixo/formatos antigos). */
export function normalizeFollowerHistory(raw: unknown): FollowerSnapshot[] {
  if (!Array.isArray(raw)) return []
  const byDay = new Map<string, FollowerSnapshot>()
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const e = entry as Record<string, unknown>
    const day = typeof e.day === "string" && DAY_RE.test(e.day) ? e.day : null
    const followers = typeof e.followers === "number" && Number.isFinite(e.followers) ? e.followers : null
    if (!day || followers === null) continue
    byDay.set(day, {
      day,
      followers,
      follows: typeof e.follows === "number" && Number.isFinite(e.follows) ? e.follows : null,
      media: typeof e.media === "number" && Number.isFinite(e.media) ? e.media : null,
    })
  }
  return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day))
}

/**
 * Acrescenta o snapshot do dia. Mesmo dia = substitui (a última leitura
 * do dia vence); mantém no máximo FOLLOWER_HISTORY_MAX dias.
 */
export function appendFollowerSnapshot(
  history: FollowerSnapshot[],
  snap: FollowerSnapshot,
): FollowerSnapshot[] {
  const merged = history.filter((h) => h.day !== snap.day)
  merged.push(snap)
  merged.sort((a, b) => a.day.localeCompare(b.day))
  return merged.slice(-FOLLOWER_HISTORY_MAX)
}

export interface FollowerDelta {
  /** Variação de seguidores no período (positivo = ganhou). */
  delta: number
  /** Dia do snapshot usado como base da comparação. */
  since: string
}

function shiftDay(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - days)
  return dt.toISOString().slice(0, 10)
}

/**
 * Delta de seguidores vs. `days` atrás. Base = snapshot mais recente com
 * day <= alvo. Sem base (histórico curto demais) devolve null — a UI
 * mostra "coletando" em vez de um número inventado.
 */
export function followerDelta(
  history: FollowerSnapshot[],
  days: number,
  todayDay: string = spDayKey(),
): FollowerDelta | null {
  if (history.length < 2) return null
  const latest = history[history.length - 1]
  const target = shiftDay(todayDay, days)
  let base: FollowerSnapshot | null = null
  for (const snap of history) {
    if (snap.day <= target) base = snap
    else break
  }
  if (!base || base.day === latest.day) return null
  return { delta: latest.followers - base.followers, since: base.day }
}
