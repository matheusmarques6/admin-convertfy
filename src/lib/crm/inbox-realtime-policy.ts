/**
 * Política de tempo do realtime do inbox — lógica pura, testável.
 *
 * Nasceu do incidente set/2026: com o realtime caído, DOIS intervalos de
 * 30s chamavam a mesma revalidação (lista + detalhe), sem backoff e sem
 * olhar a visibilidade da aba — 165-285 statements/min por aba. E, quando
 * a lista de threads falhava, o canal era assinado SEM filtro de org
 * (falha aberta): quanto pior o banco, maior o raio de explosão.
 *
 * Referências: o realtime-js reconecta em [1s, 2s, 5s, 10s] fixos e SEM
 * jitter, então todas as abas voltam juntas — o jitter tem de ser nosso
 * (full jitter, AWS/Brooker; o Discord atrasa o 1º heartbeat pelo mesmo
 * motivo).
 */

/** Espera base do fallback quando o realtime está fora. */
export const FALLBACK_BASE_MS = 30_000
/** Teto da espera — 5 min de conversa parada é aceitável; hammering não. */
export const FALLBACK_MAX_MS = 300_000

/**
 * Backoff exponencial com FULL JITTER: sorteia em [base, base + 30%].
 * Mantém um piso (nunca revalida mais rápido que a base) e espalha as
 * abas no tempo, que é o ponto do jitter.
 *
 * @param attempt tentativas consecutivas já feitas (0 = primeira)
 * @param random  injetável para teste determinístico
 */
export function nextBackoffMs(attempt: number, random: () => number = Math.random): number {
  const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0
  const raw = FALLBACK_BASE_MS * Math.pow(2, Math.min(safeAttempt, 10))
  const base = Math.min(raw, FALLBACK_MAX_MS)
  const jitter = base * 0.3 * random()
  return Math.round(base + jitter)
}

/**
 * FAIL-CLOSED: sem org resolvida não existe filtro possível, e assinar
 * `crm_threads` sem filtro entrega a atividade de TODAS as organizações a
 * esta aba — e faz cada mensagem de qualquer cliente acordar este inbox.
 * Preferimos ficar sem realtime (o fallback cobre) a assinar tudo.
 */
export function shouldSubscribeThreads(opts: {
  enabled: boolean
  orgId?: string | null
}): boolean {
  return Boolean(opts.enabled && opts.orgId)
}

/** Aba oculta não precisa de dado fresco: revalida ao voltar ao foco. */
export function shouldRefetchNow(visibility?: string | null): boolean {
  return visibility !== "hidden"
}

/**
 * Quantas tentativas o fallback já fez, dado o estado do canal. Zera
 * quando conecta — reconexão curta não herda a espera longa da anterior.
 */
export function nextAttempt(connected: boolean, current: number): number {
  if (connected) return 0
  return Math.min(current + 1, 10)
}
