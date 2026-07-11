/**
 * kpi-deltas — cálculo dos deltas "vs média 90d" do dashboard.
 *
 * Regra de honestidade (jul/2026): o delta só é calculado sobre a
 * INTERSEÇÃO de lojas presentes nas DUAS janelas (período selecionado e
 * 90d). Antes, a soma da janela atual (ex.: 60 lojas frescas no 30d) era
 * dividida pela soma da janela 90d (28 lojas, sync de semanas atrás) —
 * referência subestimada em >2× produzia deltas absurdos (+3763%).
 *
 * Guard de cobertura: se a interseção representa menos de MIN_COVERAGE
 * da receita da janela atual, o delta é `null` (a UI mostra "—") — sinal
 * de referência incompleta, não de crescimento.
 *
 * Módulo puro (zero I/O) — testável.
 */

export const MIN_DELTA_COVERAGE = 0.7

export interface IntersectionDelta {
  /** Variação % da média diária (1 casa), ou null se referência não confiável. */
  value: number | null
  /** Fração da receita da janela atual coberta pela interseção (0-1). */
  coverage: number
  /** Quantas lojas entraram no cálculo. */
  stores: number
}

/**
 * Delta de médias diárias sobre a interseção de lojas.
 * `current`/`ref`: soma por loja (mesma unidade, ex. BRL) em cada janela.
 */
export function computeIntersectionDelta(
  current: Map<string, number>,
  currentDays: number,
  ref: Map<string, number>,
  refDays: number,
  minCoverage = MIN_DELTA_COVERAGE,
): IntersectionDelta {
  let currentTotalAll = 0
  for (const v of current.values()) currentTotalAll += v

  let currentInter = 0
  let refInter = 0
  let stores = 0
  for (const [storeId, value] of current) {
    const refValue = ref.get(storeId)
    if (refValue === undefined) continue
    currentInter += value
    refInter += refValue
    stores++
  }

  const coverage = currentTotalAll > 0 ? currentInter / currentTotalAll : 0

  if (stores === 0 || refInter <= 0 || coverage < minCoverage) {
    return { value: null, coverage, stores }
  }

  const avgCurrent = currentDays > 0 ? currentInter / currentDays : 0
  const avgRef = refDays > 0 ? refInter / refDays : 0
  if (avgRef <= 0) return { value: null, coverage, stores }

  const value = Math.round(((avgCurrent - avgRef) / avgRef) * 1000) / 10
  return { value, coverage, stores }
}

/**
 * Delta de MÉDIAS (não somas/dia) sobre a interseção — usado para a taxa
 * de atribuição por loja. Cobertura aqui é por CONTAGEM de lojas.
 */
export function computeIntersectionRateDelta(
  current: Map<string, number>,
  ref: Map<string, number>,
  minCoverage = MIN_DELTA_COVERAGE,
): IntersectionDelta {
  let sumCur = 0
  let sumRef = 0
  let stores = 0
  for (const [storeId, value] of current) {
    const refValue = ref.get(storeId)
    if (refValue === undefined) continue
    sumCur += value
    sumRef += refValue
    stores++
  }

  const coverage = current.size > 0 ? stores / current.size : 0
  if (stores === 0 || coverage < minCoverage) {
    return { value: null, coverage, stores }
  }

  const meanCur = sumCur / stores
  const meanRef = sumRef / stores
  if (meanRef <= 0) return { value: null, coverage, stores }

  const value = Math.round(((meanCur - meanRef) / meanRef) * 1000) / 10
  return { value, coverage, stores }
}
