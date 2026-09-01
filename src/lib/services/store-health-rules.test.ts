import { describe, expect, it } from "vitest"
import {
  DEFAULT_STORE_HEALTH_RULES,
  sanitizeStoreHealthRules,
} from "./store-health-rules"

describe("sanitizeStoreHealthRules", () => {
  it("input vazio/lixo devolve os defaults", () => {
    expect(sanitizeStoreHealthRules(undefined)).toEqual(DEFAULT_STORE_HEALTH_RULES)
    expect(sanitizeStoreHealthRules(null)).toEqual(DEFAULT_STORE_HEALTH_RULES)
    expect(sanitizeStoreHealthRules("banana")).toEqual(DEFAULT_STORE_HEALTH_RULES)
    expect(sanitizeStoreHealthRules({ weights: { email: "x" } }).weights.email).toBe(35)
  })

  it("clampa pesos em 0-100 e arredonda", () => {
    const r = sanitizeStoreHealthRules({
      weights: { email: 150, revenue: -5, tickets: 20.6, nps: 15 },
    })
    expect(r.weights).toEqual({ email: 100, revenue: 0, tickets: 21, nps: 15 })
  })

  it("todos os pesos zerados voltam ao default (score incomputável)", () => {
    const r = sanitizeStoreHealthRules({
      weights: { email: 0, revenue: 0, tickets: 0, nps: 0 },
    })
    expect(r.weights).toEqual(DEFAULT_STORE_HEALTH_RULES.weights)
  })

  it("healthy precisa ficar acima de attention", () => {
    const r = sanitizeStoreHealthRules({ stage_thresholds: { healthy: 60, attention: 60 } })
    expect(r.stage_thresholds.healthy).toBeGreaterThan(r.stage_thresholds.attention)
    const inv = sanitizeStoreHealthRules({ stage_thresholds: { healthy: 40, attention: 70 } })
    expect(inv.stage_thresholds.healthy).toBeGreaterThan(inv.stage_thresholds.attention)
  })

  it("alert_critical nunca passa de alert_threshold", () => {
    const r = sanitizeStoreHealthRules({ alert_threshold: 40, alert_critical: 90 })
    expect(r.alert_critical).toBeLessThanOrEqual(r.alert_threshold)
  })

  it("valores válidos passam intactos", () => {
    const input = {
      weights: { email: 40, revenue: 30, tickets: 15, nps: 15 },
      stage_thresholds: { healthy: 75, attention: 55 },
      alert_threshold: 45,
      alert_critical: 25,
    }
    expect(sanitizeStoreHealthRules(input)).toEqual(input)
  })
})
