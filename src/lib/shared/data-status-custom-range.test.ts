/**
 * Tests for RG-1: Custom Range TTL functions in data-status.ts
 */

import { describe, it, expect, vi, afterEach } from "vitest"
import { getCustomRangeTTL, isCustomRangeCacheFresh } from "./data-status"

const MS_PER_DAY = 24 * 60 * 60_000
const MS_PER_HOUR = 60 * 60_000
const MS_PER_MINUTE = 60_000

describe("getCustomRangeTTL", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns 30 days for historical ranges (end_date > 7 days ago)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"))

    const rangeStart = new Date("2026-01-01")
    const rangeEnd = new Date("2026-01-31") // ~46 days ago

    expect(getCustomRangeTTL(rangeStart, rangeEnd)).toBe(30 * MS_PER_DAY)
  })

  it("returns 6 hours for recent ranges (end_date 1-7 days ago)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"))

    const rangeStart = new Date("2026-03-01")
    const rangeEnd = new Date("2026-03-15") // 3 days ago

    expect(getCustomRangeTTL(rangeStart, rangeEnd)).toBe(6 * MS_PER_HOUR)
  })

  it("returns 2 hours for ongoing long ranges (end_date >= today, range > 30 days)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"))

    const rangeStart = new Date("2026-01-01")
    const rangeEnd = new Date("2026-03-18") // today, range = 76 days

    expect(getCustomRangeTTL(rangeStart, rangeEnd)).toBe(2 * MS_PER_HOUR)
  })

  it("returns 30 minutes for ongoing short ranges (end_date >= today, range <= 30 days)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"))

    const rangeStart = new Date("2026-03-11")
    const rangeEnd = new Date("2026-03-18") // today, range = 7 days

    expect(getCustomRangeTTL(rangeStart, rangeEnd)).toBe(30 * MS_PER_MINUTE)
  })

  it("returns 30 minutes for same-day range ending today", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"))

    const rangeStart = new Date("2026-03-18")
    const rangeEnd = new Date("2026-03-18")

    expect(getCustomRangeTTL(rangeStart, rangeEnd)).toBe(30 * MS_PER_MINUTE)
  })

  it("returns 6 hours for range ending exactly 1 day ago", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"))

    const rangeStart = new Date("2026-03-10")
    const rangeEnd = new Date("2026-03-17") // exactly 1 day ago at noon

    expect(getCustomRangeTTL(rangeStart, rangeEnd)).toBe(6 * MS_PER_HOUR)
  })

  it("returns 30 days for range ending exactly 8 days ago", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"))

    const rangeStart = new Date("2026-02-01")
    const rangeEnd = new Date("2026-03-10") // 8 days ago

    expect(getCustomRangeTTL(rangeStart, rangeEnd)).toBe(30 * MS_PER_DAY)
  })
})

describe("isCustomRangeCacheFresh", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns true when cache is within TTL (historical range, fetched 1 day ago)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"))

    const rangeStart = new Date("2026-01-01")
    const rangeEnd = new Date("2026-01-31") // historical → 30d TTL
    const fetchedAt = new Date("2026-03-17T12:00:00Z") // 1 day ago

    expect(isCustomRangeCacheFresh(fetchedAt, rangeStart, rangeEnd)).toBe(true)
  })

  it("returns false when cache exceeds TTL (historical range, fetched 31 days ago)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"))

    const rangeStart = new Date("2025-11-01")
    const rangeEnd = new Date("2025-11-30") // historical → 30d TTL
    const fetchedAt = new Date("2026-02-14T12:00:00Z") // 32 days ago

    expect(isCustomRangeCacheFresh(fetchedAt, rangeStart, rangeEnd)).toBe(false)
  })

  it("returns true when cache is within TTL (recent range, fetched 2h ago)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"))

    const rangeStart = new Date("2026-03-01")
    const rangeEnd = new Date("2026-03-15") // recent → 6h TTL
    const fetchedAt = new Date("2026-03-18T10:00:00Z") // 2h ago

    expect(isCustomRangeCacheFresh(fetchedAt, rangeStart, rangeEnd)).toBe(true)
  })

  it("returns false when cache exceeds TTL (recent range, fetched 7h ago)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"))

    const rangeStart = new Date("2026-03-01")
    const rangeEnd = new Date("2026-03-15") // recent → 6h TTL
    const fetchedAt = new Date("2026-03-18T05:00:00Z") // 7h ago

    expect(isCustomRangeCacheFresh(fetchedAt, rangeStart, rangeEnd)).toBe(false)
  })

  it("returns true when cache is within TTL (ongoing short, fetched 10min ago)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"))

    const rangeStart = new Date("2026-03-11")
    const rangeEnd = new Date("2026-03-18") // ongoing short → 30min TTL
    const fetchedAt = new Date("2026-03-18T11:50:00Z") // 10min ago

    expect(isCustomRangeCacheFresh(fetchedAt, rangeStart, rangeEnd)).toBe(true)
  })

  it("returns false when cache exceeds TTL (ongoing short, fetched 45min ago)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"))

    const rangeStart = new Date("2026-03-11")
    const rangeEnd = new Date("2026-03-18") // ongoing short → 30min TTL
    const fetchedAt = new Date("2026-03-18T11:15:00Z") // 45min ago

    expect(isCustomRangeCacheFresh(fetchedAt, rangeStart, rangeEnd)).toBe(false)
  })

  it("accepts string fetchedAt (ISO format)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"))

    const rangeStart = new Date("2026-01-01")
    const rangeEnd = new Date("2026-01-31") // historical → 30d TTL
    const fetchedAt = "2026-03-17T12:00:00Z" // 1 day ago (string)

    expect(isCustomRangeCacheFresh(fetchedAt, rangeStart, rangeEnd)).toBe(true)
  })
})
