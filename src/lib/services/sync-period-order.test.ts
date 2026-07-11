import { describe, expect, it } from "vitest"
import { orderPeriodsByStaleness } from "./sync-period-order"

const HOUR = 60 * 60_000
const NOW = 1_800_000_000_000

const fresh = (entries: Array<[string, number | null]>) =>
  new Map(entries.map(([p, agoMs]) => [p, agoMs === null ? null : new Date(NOW - agoMs)]))

describe("orderPeriodsByStaleness", () => {
  it("período sem dado nenhum fura a fila (prioridade máxima)", () => {
    const order = orderPeriodsByStaleness(
      ["30d", "7d", "90d"],
      fresh([["30d", 4 * HOUR], ["7d", 4 * HOUR]]), // 90d ausente
      NOW,
    )
    expect(order[0]).toBe("90d")
  })

  it("REGRESSÃO starvation: 90d com semanas de atraso vence 30d recém-vencido", () => {
    const order = orderPeriodsByStaleness(
      ["30d", "7d", "15d", "90d", "12m"],
      fresh([
        ["30d", 4 * HOUR],        // razão ~1.3 (threshold 3h)
        ["7d", 4 * HOUR],         // razão ~1.3 (threshold 3h)
        ["15d", 5 * HOUR],        // razão ~1.25 (threshold 4h)
        ["90d", 21 * 24 * HOUR],  // 3 semanas → razão 42 (threshold 12h)
        ["12m", 10 * 24 * HOUR],  // 10 dias → razão 10 (threshold 24h)
      ]),
      NOW,
    )
    expect(order[0]).toBe("90d")
    expect(order[1]).toBe("12m")
  })

  it("tudo igualmente fresco → preserva a ordem original (sort estável)", () => {
    const order = orderPeriodsByStaleness(
      ["30d", "7d", "15d"],
      fresh([["30d", 4 * HOUR], ["7d", 4 * HOUR], ["15d", 4 * HOUR * (4 / 3)]]),
      NOW,
    )
    // razões idênticas (idade/threshold) → ordem de entrada mantida
    expect(order).toEqual(["30d", "7d", "15d"])
  })

  it("fetched_at null (linha de erro) conta como nunca sincronizado", () => {
    const order = orderPeriodsByStaleness(
      ["30d", "90d"],
      fresh([["30d", 1 * HOUR], ["90d", null]]),
      NOW,
    )
    expect(order[0]).toBe("90d")
  })

  it("não muta o array de entrada", () => {
    const input = ["30d", "90d"]
    orderPeriodsByStaleness(input, fresh([["90d", null]]), NOW)
    expect(input).toEqual(["30d", "90d"])
  })
})
