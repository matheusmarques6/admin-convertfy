/**
 * Helpers puros do banner de geracao de relatorio. Extraidos pra um
 * modulo sem JSX porque o test importa apenas estas funcoes — manter
 * tudo em report-generation-banner.tsx forcava o vitest a parsear o
 * componente inteiro, e um ternario aninhado em template literal com
 * em-dash unicode quebrava o parser do esbuild.
 */

export function formatTimeRemaining(
  completedCount: number,
  totalCount: number,
  elapsedMs: number,
): string {
  if (completedCount === totalCount) return ""
  if (completedCount === 0) return "calculando..."

  const avgMs = elapsedMs / completedCount
  const remainingStores = totalCount - completedCount
  const estimatedSeconds = Math.ceil((avgMs * remainingStores) / 1000)

  if (estimatedSeconds < 60) return "<1 min"
  return `~${Math.ceil(estimatedSeconds / 60)} min`
}

export interface BannerTextArgs {
  isAllDone: boolean
  isPartial: boolean
  startDate: string
  endDate: string
  completedCount: number
  failedCount: number
  totalCount: number
  timeStr: string
}

export function buildBannerText({
  isAllDone,
  isPartial,
  startDate,
  endDate,
  completedCount,
  failedCount,
  totalCount,
  timeStr,
}: BannerTextArgs): string {
  const dateRange = `${startDate} — ${endDate}`
  if (isAllDone && isPartial) {
    return `Relatorio parcial: ${dateRange} | ${completedCount - failedCount} de ${totalCount} lojas`
  }
  if (isAllDone) {
    return `Relatorio completo: ${dateRange} | ${totalCount} lojas`
  }
  const suffix = timeStr ? ` | ${timeStr} restante` : ""
  return `Gerando relatorio: ${dateRange} | ${completedCount} de ${totalCount} lojas${suffix}`
}
