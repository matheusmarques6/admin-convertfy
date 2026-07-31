/**
 * Cálculos do painel de performance comercial: progresso de meta,
 * projeção, forecast ponderado e tempo por etapa.
 *
 * Fora da rota porque é aritmética com armadilha — projeção que divide
 * por zero no primeiro dia do mês, tempo de etapa reconstruído a partir
 * de um histórico que pode vir fora de ordem, meta batida contando duas
 * vezes o mesmo deal. Tudo aqui é puro e testado.
 */

// ─── Metas ───────────────────────────────────────────────────────

export type GoalPeriodType = "month" | "quarter" | "year"
export type GoalType = "revenue_won" | "deals_won"

export interface GoalProgress {
  target: number
  achieved: number
  /** 0–100+, sem teto: bater 120% da meta precisa aparecer. */
  percent: number
  remaining: number
  daysTotal: number
  daysElapsed: number
  daysRemaining: number
  /** Quanto falta por dia restante para bater a meta. */
  paceNeeded: number | null
  /** Onde termina no ritmo atual. */
  projected: number | null
  /** No ritmo atual, bate a meta? */
  onTrack: boolean
}

/**
 * Progresso de uma meta no período. `now` explícito para testar.
 *
 * O dia corrente conta como decorrido — no dia 1 já se vendeu algo, e
 * dividir por zero daria projeção infinita.
 */
export function computeGoalProgress(params: {
  target: number
  achieved: number
  periodStart: Date
  periodEnd: Date
  now: Date
}): GoalProgress {
  const { target, achieved } = params
  const startMs = params.periodStart.getTime()
  const endMs = params.periodEnd.getTime()
  const nowMs = params.now.getTime()

  const daysTotal = Math.max(1, Math.round((endMs - startMs) / 86_400_000))
  const elapsedRaw = Math.floor((nowMs - startMs) / 86_400_000) + 1
  const daysElapsed = Math.min(Math.max(elapsedRaw, 1), daysTotal)
  const daysRemaining = Math.max(0, daysTotal - daysElapsed)

  const percent = target > 0 ? (achieved / target) * 100 : 0
  const remaining = Math.max(0, target - achieved)

  // Meta batida não precisa de ritmo; período encerrado não tem para onde correr.
  const paceNeeded =
    remaining <= 0 ? 0 : daysRemaining > 0 ? remaining / daysRemaining : null

  const projected = daysElapsed > 0 ? (achieved / daysElapsed) * daysTotal : null

  return {
    target,
    achieved,
    percent,
    remaining,
    daysTotal,
    daysElapsed,
    daysRemaining,
    paceNeeded,
    projected,
    onTrack: projected != null && target > 0 ? projected >= target : achieved >= target,
  }
}

/** Início e fim (exclusivo) do período que contém `ref`. */
export function resolvePeriod(
  periodType: GoalPeriodType,
  ref: Date,
): { start: Date; end: Date } {
  const y = ref.getUTCFullYear()
  const m = ref.getUTCMonth()

  if (periodType === "year") {
    return {
      start: new Date(Date.UTC(y, 0, 1)),
      end: new Date(Date.UTC(y + 1, 0, 1)),
    }
  }
  if (periodType === "quarter") {
    const q = Math.floor(m / 3)
    return {
      start: new Date(Date.UTC(y, q * 3, 1)),
      end: new Date(Date.UTC(y, q * 3 + 3, 1)),
    }
  }
  return {
    start: new Date(Date.UTC(y, m, 1)),
    end: new Date(Date.UTC(y, m + 1, 1)),
  }
}

// ─── Forecast ────────────────────────────────────────────────────

export interface ForecastDeal {
  id: string
  value: number | null
  probability: number | null
  expected_close_date: string | null
  status: string
}

export interface ForecastBucket {
  /** YYYY-MM */
  month: string
  count: number
  /** Soma bruta do valor dos negócios previstos. */
  value: number
  /** Soma ponderada pela probabilidade — o número honesto. */
  weighted: number
}

/**
 * Agrupa negócios abertos por mês de fechamento previsto.
 *
 * Sem data prevista o negócio fica de fora: entrar num mês arbitrário
 * inflaria a previsão daquele mês. A UI mostra quantos ficaram fora.
 */
export function buildForecast(
  deals: ForecastDeal[],
  opts: { months: number; from: Date },
): { buckets: ForecastBucket[]; withoutDate: number; withoutDateValue: number } {
  const start = new Date(
    Date.UTC(opts.from.getUTCFullYear(), opts.from.getUTCMonth(), 1),
  )
  const buckets = new Map<string, ForecastBucket>()
  for (let i = 0; i < opts.months; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    buckets.set(key, { month: key, count: 0, value: 0, weighted: 0 })
  }

  let withoutDate = 0
  let withoutDateValue = 0

  for (const d of deals) {
    if (d.status !== "open") continue
    const value = d.value ?? 0
    if (!d.expected_close_date) {
      withoutDate++
      withoutDateValue += value
      continue
    }
    const key = d.expected_close_date.slice(0, 7)
    const bucket = buckets.get(key)
    // Fora da janela (passado ou além do horizonte) não entra na previsão
    if (!bucket) continue
    const prob = d.probability == null ? 50 : Math.min(Math.max(d.probability, 0), 100)
    bucket.count++
    bucket.value += value
    bucket.weighted += (value * prob) / 100
  }

  return {
    buckets: Array.from(buckets.values()),
    withoutDate,
    withoutDateValue,
  }
}

// ─── Tempo por etapa ─────────────────────────────────────────────

export interface StageHistoryEvent {
  deal_id: string
  /** stage de onde saiu (JSONB gravado como texto). */
  old_value: string | null
  /** stage para onde foi. */
  new_value: string | null
  changed_at: string
}

export interface StageDurationStat {
  stage_id: string
  /** Média de dias que os negócios passam nesta etapa. */
  avgDays: number
  /** Mediana — resiste a outlier (um deal parado há 2 anos). */
  medianDays: number
  /** Quantas passagens foram medidas. */
  samples: number
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

/**
 * Reconstrói quanto tempo cada negócio passou em cada etapa a partir do
 * histórico de mudanças.
 *
 * Uma "passagem" fecha quando o negócio sai da etapa — o tempo é a
 * diferença entre duas mudanças consecutivas. A permanência na etapa
 * ATUAL não entra: ela ainda não terminou, e incluí-la faria a etapa
 * onde tudo está parado parecer a mais rápida.
 */
export function computeStageDurations(
  events: StageHistoryEvent[],
): StageDurationStat[] {
  const byDeal = new Map<string, StageHistoryEvent[]>()
  for (const e of events) {
    if (!e.changed_at) continue
    const list = byDeal.get(e.deal_id)
    if (list) list.push(e)
    else byDeal.set(e.deal_id, [e])
  }

  const durations = new Map<string, number[]>()

  for (const list of byDeal.values()) {
    // O histórico pode chegar fora de ordem; ordenar aqui é barato e
    // evita duração negativa.
    const sorted = list
      .slice()
      .sort((a, b) => Date.parse(a.changed_at) - Date.parse(b.changed_at))

    for (let i = 0; i < sorted.length - 1; i++) {
      const enteredAt = Date.parse(sorted[i].changed_at)
      const leftAt = Date.parse(sorted[i + 1].changed_at)
      const stage = sorted[i].new_value
      if (!stage || Number.isNaN(enteredAt) || Number.isNaN(leftAt)) continue
      const days = (leftAt - enteredAt) / 86_400_000
      if (days < 0) continue
      const arr = durations.get(stage)
      if (arr) arr.push(days)
      else durations.set(stage, [days])
    }
  }

  return Array.from(durations.entries())
    .map(([stage_id, values]) => ({
      stage_id,
      avgDays: values.reduce((a, b) => a + b, 0) / values.length,
      medianDays: median(values),
      samples: values.length,
    }))
    .sort((a, b) => b.avgDays - a.avgDays)
}

// ─── Performance por vendedor ────────────────────────────────────

export interface OwnerDeal {
  owner_id: string | null
  status: string
  value: number | null
  created_at: string
  won_at: string | null
}

export interface OwnerStat {
  owner_id: string
  wonValue: number
  wonCount: number
  lostCount: number
  openValue: number
  openCount: number
  /** Ganhos sobre fechados. null quando nada fechou — 0% seria mentira. */
  winRate: number | null
  avgTicket: number | null
  avgCycleDays: number | null
}

export function computeOwnerStats(deals: OwnerDeal[]): OwnerStat[] {
  const map = new Map<string, OwnerStat & { cycles: number[] }>()

  const ensure = (id: string) => {
    let s = map.get(id)
    if (!s) {
      s = {
        owner_id: id,
        wonValue: 0,
        wonCount: 0,
        lostCount: 0,
        openValue: 0,
        openCount: 0,
        winRate: null,
        avgTicket: null,
        avgCycleDays: null,
        cycles: [],
      }
      map.set(id, s)
    }
    return s
  }

  for (const d of deals) {
    if (!d.owner_id) continue
    const s = ensure(d.owner_id)
    const value = d.value ?? 0

    if (d.status === "won") {
      s.wonValue += value
      s.wonCount++
      if (d.won_at && d.created_at) {
        const days = (Date.parse(d.won_at) - Date.parse(d.created_at)) / 86_400_000
        if (Number.isFinite(days) && days >= 0) s.cycles.push(days)
      }
    } else if (d.status === "lost") {
      s.lostCount++
    } else if (d.status === "open") {
      s.openValue += value
      s.openCount++
    }
  }

  return Array.from(map.values())
    .map(({ cycles, ...s }) => ({
      ...s,
      winRate:
        s.wonCount + s.lostCount > 0
          ? (s.wonCount / (s.wonCount + s.lostCount)) * 100
          : null,
      avgTicket: s.wonCount > 0 ? s.wonValue / s.wonCount : null,
      avgCycleDays:
        cycles.length > 0 ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null,
    }))
    .sort((a, b) => b.wonValue - a.wonValue)
}
