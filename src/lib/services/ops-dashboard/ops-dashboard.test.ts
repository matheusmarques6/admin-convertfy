import { describe, expect, it } from "vitest"
import { resolveWindow, previousWindow, computeDeltaPct } from "./period-window"
import {
  buildOpsSeries,
  dailyPointsFromCampaignRows,
  fillDays,
  totalsFromPoints,
} from "./series"
import {
  computeStoreTrends,
  midDate,
  monthlyValue,
  storesWithoutRecentSend,
  summarizeChurn,
} from "./portfolio"
import { summarizeOnboardings } from "./onboarding"
import type { EmailDailyPoint } from "@/lib/services/store-daily-metrics.service"

const NOW = new Date("2026-08-25T15:00:00.000Z")

function point(date: string, over: Partial<EmailDailyPoint> = {}): EmailDailyPoint {
  return {
    date,
    recipients: 1000,
    delivered: 900,
    opened: 180,
    clicked: 18,
    conversions: 3,
    conversion_value: 500,
    bounced: 10,
    unsubscribed: 2,
    openRate: 20,
    clickRate: 2,
    ctor: 10,
    placedOrderRate: 0.33,
    ...over,
  }
}

describe("resolveWindow / previousWindow", () => {
  it("preset 30d termina hoje e tem 30 dias", () => {
    const w = resolveWindow("30d", null, null, NOW)
    expect(w).toEqual({ from: "2026-07-27", to: "2026-08-25", days: 30 })
  })

  it("custom com start/end usa as datas exatas (inclusivas)", () => {
    const w = resolveWindow("custom", "2026-08-01", "2026-08-10", NOW)
    expect(w).toEqual({ from: "2026-08-01", to: "2026-08-10", days: 10 })
  })

  it("custom SEM datas cai no default de 30d (defensivo, como normalizePeriodLabel)", () => {
    const w = resolveWindow("custom", null, null, NOW)
    expect(w.days).toBe(30)
  })

  it("today/1d = só hoje", () => {
    expect(resolveWindow("today", null, null, NOW)).toEqual({
      from: "2026-08-25",
      to: "2026-08-25",
      days: 1,
    })
  })

  it("janela anterior tem o mesmo comprimento e termina 1 dia antes", () => {
    const prev = previousWindow({ from: "2026-08-01", to: "2026-08-10", days: 10 })
    expect(prev).toEqual({ from: "2026-07-22", to: "2026-07-31", days: 10 })
  })

  it("delta % vs anterior; base zero → null (nunca +100% mentiroso)", () => {
    expect(computeDeltaPct(110, 100)).toBe(10)
    expect(computeDeltaPct(90, 100)).toBe(-10)
    expect(computeDeltaPct(50, 0)).toBeNull()
  })
})

describe("série diária (buildOpsSeries)", () => {
  const win = { from: "2026-08-01", to: "2026-08-03", days: 3 }
  const prevWin = { from: "2026-07-29", to: "2026-07-31", days: 3 }

  it("taxas dos totais são ponderadas por volume, não média de médias", () => {
    const totals = totalsFromPoints([
      point("2026-08-01", { delivered: 100, opened: 50 }), // 50%
      point("2026-08-02", { delivered: 900, opened: 90 }), // 10%
    ])
    // (50+90)/(100+900) = 14% — média de médias daria 30%
    expect(totals.openRate).toBe(14)
  })

  it("fillDays preenche buracos com zero (eixo contínuo) mas devolve [] sem dados", () => {
    const filled = fillDays([point("2026-08-01"), point("2026-08-03")], win)
    expect(filled.map((p) => p.date)).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"])
    expect(filled[1].revenue).toBe(0)
    expect(fillDays([], win)).toEqual([])
  })

  it("collecting=true quando a janela atual não tem coleta", () => {
    const payload = buildOpsSeries([], [], win, prevWin)
    expect(payload.collecting).toBe(true)
    expect(payload.deltas.revenue).toBeNull()
  })

  it("janela atual vazia com histórico anterior → TODOS os deltas null (coleta parada não vira ↓100pp)", () => {
    const payload = buildOpsSeries([], [point("2026-07-29")], win, prevWin)
    expect(payload.collecting).toBe(true)
    for (const v of Object.values(payload.deltas)) expect(v).toBeNull()
  })

  it("fallback por campanhas: dedup por sync mais recente, bucket por dia de envio, fora da janela cai", () => {
    const row = (over: Record<string, unknown>) => ({
      store_id: "s1",
      campaign_id: "c1",
      send_time: "2026-08-01T14:00:00Z",
      recipients: 1000,
      delivered: 900,
      opened: 90,
      clicked: 9,
      conversions: 2,
      conversion_value: 300,
      bounced: 5,
      unsubscribed: 1,
      fetched_at: "2026-08-20T00:00:00Z",
      ...over,
    })
    const points = dailyPointsFromCampaignRows(
      [
        row({}), // versão antiga da MESMA campanha…
        row({ fetched_at: "2026-08-24T00:00:00Z", opened: 180 }), // …vence a mais recente
        row({ campaign_id: "c2", send_time: "2026-08-02T09:00:00Z" }),
        row({ campaign_id: "c3", send_time: "2026-07-20T09:00:00Z" }), // fora da janela
        row({ campaign_id: "c4", send_time: null }), // sem send_time não entra
      ],
      win,
    )
    expect(points.map((p) => p.date)).toEqual(["2026-08-01", "2026-08-02"])
    expect(points[0].opened).toBe(180) // dedup manteve o sync novo
    expect(points[0].openRate).toBe(20)
  })

  it("delta de taxa é em PONTOS PERCENTUAIS; de valor é relativo", () => {
    const cur = [point("2026-08-01", { delivered: 100, opened: 30, conversion_value: 220 })] // 30%
    const prev = [point("2026-07-29", { delivered: 100, opened: 20, conversion_value: 200 })] // 20%
    const payload = buildOpsSeries(cur, prev, win, prevWin)
    expect(payload.deltas.openRate).toBe(10) // +10 pp
    expect(payload.deltas.revenue).toBe(10) // +10 %
  })
})

describe("carteira (churn / sem envio)", () => {
  it("MRR normaliza por ciclo com a régua do CS (YEARLY/12, SEMIANNUALLY/6...)", () => {
    expect(monthlyValue(1200, "YEARLY")).toBe(100)
    expect(monthlyValue(600, "SEMIANNUALLY")).toBe(100)
    expect(monthlyValue(300, "QUARTERLY")).toBe(100)
    expect(monthlyValue(50, "BIWEEKLY")).toBe(100)
    expect(monthlyValue(100, null)).toBe(100)
  })

  it("churn agrupa por cliente (2 subs do mesmo cliente = 1 churn)", () => {
    const out = summarizeChurn([
      { client_id: "a", value: 1200, cycle: "YEARLY" },
      { client_id: "a", value: 100, cycle: "MONTHLY" },
      { client_id: "b", value: "50.50", cycle: "MONTHLY" },
    ])
    expect(out.clients).toBe(2)
    expect(out.mrr_cents).toBe(Math.round((100 + 100 + 50.5) * 100))
  })

  it("sem envio inclui loja que NUNCA enviou", () => {
    const stores = [
      { id: "s1", store_name: "A" },
      { id: "s2", store_name: "B" },
      { id: "s3", store_name: "C" },
    ]
    const out = storesWithoutRecentSend(stores, new Set(["s2"]))
    expect(out.map((s) => s.id)).toEqual(["s1", "s3"])
  })

  it("trend por loja: 2ª metade vs 1ª, com piso de volume e faixa estável", () => {
    const mk = (store_id: string, metric_date: string, delivered: number, opened: number) => ({
      store_id, metric_date, delivered, opened,
    })
    const rows = [
      // subiu: 10% → 20%
      mk("up", "2026-08-01", 1000, 100), mk("up", "2026-08-20", 1000, 200),
      // caiu: 20% → 10%
      mk("down", "2026-08-01", 1000, 200), mk("down", "2026-08-20", 1000, 100),
      // estável: 15% → 15,2% (< 0,5 pp)
      mk("flat", "2026-08-01", 1000, 150), mk("flat", "2026-08-20", 1000, 152),
      // volume insuficiente na 1ª metade
      mk("thin", "2026-08-01", 10, 5), mk("thin", "2026-08-20", 1000, 300),
    ]
    const trends = computeStoreTrends(rows, "2026-08-15")
    expect(trends.get("up")).toBe("up")
    expect(trends.get("down")).toBe("down")
    expect(trends.get("flat")).toBeNull()
    expect(trends.get("thin")).toBeNull()
  })

  it("midDate divide a janela ao meio", () => {
    expect(midDate({ from: "2026-08-01", to: "2026-08-30", days: 30 })).toBe("2026-08-16")
  })
})

describe("onboarding (summarizeOnboardings)", () => {
  const columns = [
    { id: "c1", name: "Entrada", slug: "entrada", position: 0, color: "#999", sla_hours: 2 },
    { id: "c2", name: "Formulário", slug: "cliente_formulario", position: 1, color: "#4E62D8", sla_hours: 72 },
  ]

  it("conta por fase, calcula atrasados por SLA e tempo médio", () => {
    const out = summarizeOnboardings(
      [
        // 5 dias na Entrada (SLA 2h) → atrasado
        { id: "o1", current_column_id: "c1", entered_at: "2026-08-10T00:00:00Z", last_column_change_at: "2026-08-20T00:00:00Z", store_name: "Loja 1" },
        // 1h no Formulário (SLA 72h) → ok
        { id: "o2", current_column_id: "c2", entered_at: "2026-08-20T00:00:00Z", last_column_change_at: "2026-08-25T14:00:00Z", store_name: "Loja 2" },
      ],
      columns,
      NOW,
    )
    expect(out.in_progress).toBe(2)
    expect(out.overdue).toBe(1)
    expect(out.phases.map((p) => p.count)).toEqual([1, 1])
    // idades: 15.6d e 5.6d → média ~10-11d
    expect(out.avg_days).toBeGreaterThanOrEqual(10)
    expect(out.avg_days).toBeLessThanOrEqual(11)
  })

  it("mais antigos na fase, ordenado desc e limitado", () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      id: `o${i}`,
      current_column_id: "c2",
      entered_at: "2026-08-01T00:00:00Z",
      last_column_change_at: `2026-08-${String(10 + i).padStart(2, "0")}T00:00:00Z`,
      store_name: `Loja ${i}`,
    }))
    const out = summarizeOnboardings(rows, columns, NOW, 3)
    expect(out.oldest).toHaveLength(3)
    expect(out.oldest[0].store_name).toBe("Loja 0") // mais tempo parado
    expect(out.oldest[0].days_in_phase).toBeGreaterThan(out.oldest[2].days_in_phase)
  })

  it("vazio: avg null, zero fases contadas", () => {
    const out = summarizeOnboardings([], columns, NOW)
    expect(out.in_progress).toBe(0)
    expect(out.avg_days).toBeNull()
    expect(out.overdue).toBe(0)
  })
})
