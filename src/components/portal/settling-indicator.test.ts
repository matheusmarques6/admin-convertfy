import { describe, it, expect } from "vitest"
import {
  isSettlingPeriod,
  SETTLING_PERIODS,
  ATTRIBUTION_SETTLING_DAYS,
} from "@/lib/shared/data-status"

describe("SettlingIndicator logic (AK-14.2)", () => {
  it("SETTLING_PERIODS contains only 1d and 7d", () => {
    expect(SETTLING_PERIODS).toEqual(["1d", "7d"])
  })

  it("ATTRIBUTION_SETTLING_DAYS is 5", () => {
    expect(ATTRIBUTION_SETTLING_DAYS).toBe(5)
  })

  it("isSettlingPeriod returns true for 1d", () => {
    expect(isSettlingPeriod("1d")).toBe(true)
  })

  it("isSettlingPeriod returns true for 7d", () => {
    expect(isSettlingPeriod("7d")).toBe(true)
  })

  it("isSettlingPeriod returns false for 15d", () => {
    expect(isSettlingPeriod("15d")).toBe(false)
  })

  it("isSettlingPeriod returns false for 30d", () => {
    expect(isSettlingPeriod("30d")).toBe(false)
  })

  it("isSettlingPeriod returns false for 90d", () => {
    expect(isSettlingPeriod("90d")).toBe(false)
  })

  it("isSettlingPeriod returns false for 12m", () => {
    expect(isSettlingPeriod("12m")).toBe(false)
  })
})
