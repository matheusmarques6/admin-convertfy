import { describe, it, expect } from "vitest"
import {
  computeGoalProgress,
  resolvePeriod,
  buildForecast,
  computeStageDurations,
  computeOwnerStats,
  type ForecastDeal,
  type StageHistoryEvent,
  type OwnerDeal,
} from "./crm-performance"

const d = (iso: string) => new Date(iso)

describe("computeGoalProgress", () => {
  const base = {
    periodStart: d("2026-07-01T00:00:00Z"),
    periodEnd: d("2026-08-01T00:00:00Z"),
  }

  it("calcula percentual, restante e ritmo no meio do periodo", () => {
    const p = computeGoalProgress({
      ...base,
      target: 100_000,
      achieved: 40_000,
      now: d("2026-07-16T12:00:00Z"),
    })
    expect(p.daysTotal).toBe(31)
    expect(p.daysElapsed).toBe(16)
    expect(p.daysRemaining).toBe(15)
    expect(p.percent).toBeCloseTo(40)
    expect(p.remaining).toBe(60_000)
    expect(p.paceNeeded).toBeCloseTo(4000)
    expect(p.projected).toBeCloseTo((40_000 / 16) * 31)
    expect(p.onTrack).toBe(false)
  })

  it("primeiro dia do periodo nao divide por zero", () => {
    const p = computeGoalProgress({
      ...base,
      target: 50_000,
      achieved: 0,
      now: d("2026-07-01T09:00:00Z"),
    })
    expect(p.daysElapsed).toBe(1)
    expect(Number.isFinite(p.projected ?? 0)).toBe(true)
    expect(p.projected).toBe(0)
  })

  it("marca on track quando a projecao alcanca a meta", () => {
    const p = computeGoalProgress({
      ...base,
      target: 100_000,
      achieved: 60_000,
      now: d("2026-07-16T00:00:00Z"),
    })
    expect(p.projected).toBeGreaterThan(100_000)
    expect(p.onTrack).toBe(true)
  })

  it("meta batida passa de 100% e zera o ritmo necessario", () => {
    const p = computeGoalProgress({
      ...base,
      target: 100_000,
      achieved: 130_000,
      now: d("2026-07-20T00:00:00Z"),
    })
    expect(p.percent).toBeCloseTo(130)
    expect(p.remaining).toBe(0)
    expect(p.paceNeeded).toBe(0)
    expect(p.onTrack).toBe(true)
  })

  it("periodo encerrado sem bater a meta nao tem ritmo possivel", () => {
    const p = computeGoalProgress({
      ...base,
      target: 100_000,
      achieved: 80_000,
      now: d("2026-08-05T00:00:00Z"),
    })
    expect(p.daysRemaining).toBe(0)
    expect(p.paceNeeded).toBeNull()
  })

  it("meta zero nao gera percentual infinito", () => {
    const p = computeGoalProgress({
      ...base,
      target: 0,
      achieved: 5_000,
      now: d("2026-07-10T00:00:00Z"),
    })
    expect(p.percent).toBe(0)
    expect(Number.isFinite(p.percent)).toBe(true)
  })
})

describe("resolvePeriod", () => {
  it("mes", () => {
    const p = resolvePeriod("month", d("2026-07-15T00:00:00Z"))
    expect(p.start.toISOString()).toBe("2026-07-01T00:00:00.000Z")
    expect(p.end.toISOString()).toBe("2026-08-01T00:00:00.000Z")
  })

  it("trimestre", () => {
    const p = resolvePeriod("quarter", d("2026-07-15T00:00:00Z"))
    expect(p.start.toISOString()).toBe("2026-07-01T00:00:00.000Z")
    expect(p.end.toISOString()).toBe("2026-10-01T00:00:00.000Z")
  })

  it("ano", () => {
    const p = resolvePeriod("year", d("2026-07-15T00:00:00Z"))
    expect(p.start.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(p.end.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })

  it("dezembro vira janeiro do ano seguinte", () => {
    const p = resolvePeriod("month", d("2026-12-10T00:00:00Z"))
    expect(p.end.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })
})

describe("buildForecast", () => {
  const from = d("2026-07-01T00:00:00Z")
  const deal = (o: Partial<ForecastDeal> & { id: string }): ForecastDeal => ({
    value: 1000,
    probability: 50,
    expected_close_date: "2026-07-20",
    status: "open",
    ...o,
  })

  it("agrupa por mes e pondera pela probabilidade", () => {
    const r = buildForecast(
      [
        deal({ id: "a", value: 10_000, probability: 80 }),
        deal({ id: "b", value: 20_000, probability: 25, expected_close_date: "2026-08-05" }),
      ],
      { months: 3, from },
    )
    const jul = r.buckets.find((b) => b.month === "2026-07")!
    const ago = r.buckets.find((b) => b.month === "2026-08")!
    expect(jul.value).toBe(10_000)
    expect(jul.weighted).toBe(8_000)
    expect(ago.weighted).toBe(5_000)
  })

  it("cria os meses da janela mesmo vazios", () => {
    const r = buildForecast([], { months: 3, from })
    expect(r.buckets.map((b) => b.month)).toEqual(["2026-07", "2026-08", "2026-09"])
  })

  it("separa negocios sem data prevista em vez de chutar um mes", () => {
    const r = buildForecast(
      [deal({ id: "x", expected_close_date: null, value: 7_000 })],
      { months: 3, from },
    )
    expect(r.withoutDate).toBe(1)
    expect(r.withoutDateValue).toBe(7_000)
    expect(r.buckets.every((b) => b.count === 0)).toBe(true)
  })

  it("ignora negocios fechados", () => {
    const r = buildForecast(
      [deal({ id: "w", status: "won" }), deal({ id: "l", status: "lost" })],
      { months: 3, from },
    )
    expect(r.buckets.every((b) => b.count === 0)).toBe(true)
    expect(r.withoutDate).toBe(0)
  })

  it("ignora datas fora da janela", () => {
    const r = buildForecast(
      [
        deal({ id: "passado", expected_close_date: "2026-05-10" }),
        deal({ id: "longe", expected_close_date: "2027-03-10" }),
      ],
      { months: 3, from },
    )
    expect(r.buckets.every((b) => b.count === 0)).toBe(true)
  })

  it("probabilidade ausente assume 50% e fora da faixa e limitada", () => {
    const r = buildForecast(
      [
        deal({ id: "sem", value: 1000, probability: null }),
        deal({ id: "acima", value: 1000, probability: 150 }),
      ],
      { months: 1, from },
    )
    expect(r.buckets[0].weighted).toBe(500 + 1000)
  })
})

describe("computeStageDurations", () => {
  const ev = (
    deal_id: string,
    old_value: string | null,
    new_value: string | null,
    changed_at: string,
  ): StageHistoryEvent => ({ deal_id, old_value, new_value, changed_at })

  it("mede o tempo entre entrar e sair da etapa", () => {
    const stats = computeStageDurations([
      ev("d1", "s0", "s1", "2026-07-01T00:00:00Z"),
      ev("d1", "s1", "s2", "2026-07-06T00:00:00Z"),
      ev("d1", "s2", "s3", "2026-07-08T00:00:00Z"),
    ])
    expect(stats.find((s) => s.stage_id === "s1")!.avgDays).toBeCloseTo(5)
    expect(stats.find((s) => s.stage_id === "s2")!.avgDays).toBeCloseTo(2)
  })

  it("nao conta a etapa atual — a permanencia ainda nao terminou", () => {
    const stats = computeStageDurations([
      ev("d1", "s0", "s1", "2026-07-01T00:00:00Z"),
      ev("d1", "s1", "s2", "2026-07-06T00:00:00Z"),
    ])
    // s2 e onde o deal esta agora: sem medicao
    expect(stats.find((s) => s.stage_id === "s2")).toBeUndefined()
  })

  it("ordena eventos fora de ordem em vez de gerar duracao negativa", () => {
    const stats = computeStageDurations([
      ev("d1", "s1", "s2", "2026-07-06T00:00:00Z"),
      ev("d1", "s0", "s1", "2026-07-01T00:00:00Z"),
      ev("d1", "s2", "s3", "2026-07-09T00:00:00Z"),
    ])
    expect(stats.every((s) => s.avgDays >= 0)).toBe(true)
    expect(stats.find((s) => s.stage_id === "s1")!.avgDays).toBeCloseTo(5)
  })

  it("mediana resiste a outlier que a media distorce", () => {
    const stats = computeStageDurations([
      ev("a", "s0", "s1", "2026-07-01T00:00:00Z"),
      ev("a", "s1", "s2", "2026-07-02T00:00:00Z"),
      ev("b", "s0", "s1", "2026-07-01T00:00:00Z"),
      ev("b", "s1", "s2", "2026-07-02T00:00:00Z"),
      ev("c", "s0", "s1", "2026-01-01T00:00:00Z"),
      ev("c", "s1", "s2", "2026-07-01T00:00:00Z"),
    ])
    const s1 = stats.find((s) => s.stage_id === "s1")!
    expect(s1.samples).toBe(3)
    expect(s1.medianDays).toBeCloseTo(1)
    expect(s1.avgDays).toBeGreaterThan(50)
  })

  it("mistura deals sem cruzar historico entre eles", () => {
    const stats = computeStageDurations([
      ev("a", "s0", "s1", "2026-07-01T00:00:00Z"),
      ev("b", "s0", "s1", "2026-07-10T00:00:00Z"),
      ev("a", "s1", "s2", "2026-07-03T00:00:00Z"),
      ev("b", "s1", "s2", "2026-07-12T00:00:00Z"),
    ])
    const s1 = stats.find((s) => s.stage_id === "s1")!
    expect(s1.samples).toBe(2)
    expect(s1.avgDays).toBeCloseTo(2)
  })

  it("lista vazia devolve vazio", () => {
    expect(computeStageDurations([])).toEqual([])
  })
})

describe("computeOwnerStats", () => {
  const deal = (o: Partial<OwnerDeal>): OwnerDeal => ({
    owner_id: "u1",
    status: "open",
    value: 1000,
    created_at: "2026-07-01T00:00:00Z",
    won_at: null,
    ...o,
  })

  it("agrega ganho, perdido e aberto por responsavel", () => {
    const stats = computeOwnerStats([
      deal({ status: "won", value: 10_000, won_at: "2026-07-11T00:00:00Z" }),
      deal({ status: "lost", value: 5_000 }),
      deal({ status: "open", value: 3_000 }),
    ])
    expect(stats).toHaveLength(1)
    expect(stats[0].wonValue).toBe(10_000)
    expect(stats[0].wonCount).toBe(1)
    expect(stats[0].lostCount).toBe(1)
    expect(stats[0].openValue).toBe(3_000)
    expect(stats[0].winRate).toBeCloseTo(50)
    expect(stats[0].avgTicket).toBe(10_000)
    expect(stats[0].avgCycleDays).toBeCloseTo(10)
  })

  it("win rate e null sem nada fechado — 0% seria mentira", () => {
    const stats = computeOwnerStats([deal({ status: "open" })])
    expect(stats[0].winRate).toBeNull()
    expect(stats[0].avgTicket).toBeNull()
    expect(stats[0].avgCycleDays).toBeNull()
  })

  it("ordena por valor ganho", () => {
    const stats = computeOwnerStats([
      deal({ owner_id: "a", status: "won", value: 5_000, won_at: "2026-07-05T00:00:00Z" }),
      deal({ owner_id: "b", status: "won", value: 20_000, won_at: "2026-07-05T00:00:00Z" }),
    ])
    expect(stats.map((s) => s.owner_id)).toEqual(["b", "a"])
  })

  it("ignora deals sem responsavel", () => {
    expect(computeOwnerStats([deal({ owner_id: null })])).toEqual([])
  })
})
