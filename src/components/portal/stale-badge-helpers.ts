/**
 * Helpers puros do StaleBadge. Extraidos pra modulo sem JSX porque o
 * test importa apenas formatElapsed; manter no .tsx forcava o vitest
 * a parsear o componente, e em alguns casos o esbuild quebra (mesmo
 * problema documentado em report-generation-banner-helpers.ts).
 */

export function formatElapsed(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} minutos`
  const hours = Math.round(ms / 3_600_000)
  if (hours < 24) return `${hours} horas`
  const days = Math.round(ms / 86_400_000)
  return `${days} dias`
}
