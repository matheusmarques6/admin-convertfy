/**
 * Tests for getFreshnessLabel (pure function, no React hooks needed).
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { getFreshnessLabel } from "./use-data-status"

describe("getFreshnessLabel", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("should return 'Sincronizando...' when fetchedAt is null", () => {
    expect(getFreshnessLabel(null)).toBe("Sincronizando...")
  })

  it("should return 'Atualizado agora' when less than 60 seconds ago", () => {
    const now = new Date()
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const thirtySecsAgo = new Date(now.getTime() - 30_000)
    expect(getFreshnessLabel(thirtySecsAgo)).toBe("Atualizado agora")
  })

  it("should return minutes label when between 1-59 minutes ago", () => {
    const now = new Date()
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000)
    expect(getFreshnessLabel(fiveMinAgo)).toBe("Atualizado ha 5min")

    const thirtyMinAgo = new Date(now.getTime() - 30 * 60_000)
    expect(getFreshnessLabel(thirtyMinAgo)).toBe("Atualizado ha 30min")
  })

  it("should return hours label when between 1-23 hours ago", () => {
    const now = new Date()
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000)
    expect(getFreshnessLabel(twoHoursAgo)).toBe("Atualizado ha 2h")
  })

  it("should return days label when 24+ hours ago", () => {
    const now = new Date()
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000)
    expect(getFreshnessLabel(threeDaysAgo)).toBe("Dados de 3 dias atras")
  })

  it("should return minutes label at exactly 60 seconds (boundary)", () => {
    const now = new Date()
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const exactlyOneMin = new Date(now.getTime() - 60_000)
    // diff = 60000, which is NOT < 60000, so falls to minutes branch
    expect(getFreshnessLabel(exactlyOneMin)).toBe("Atualizado ha 1min")
  })

  it("should return hours label at exactly 60 minutes (boundary)", () => {
    const now = new Date()
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const exactlyOneHour = new Date(now.getTime() - 3_600_000)
    // diff = 3600000, which is NOT < 3600000, so falls to hours branch
    expect(getFreshnessLabel(exactlyOneHour)).toBe("Atualizado ha 1h")
  })

  it("should return days label at exactly 24 hours (boundary)", () => {
    const now = new Date()
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const exactlyOneDay = new Date(now.getTime() - 86_400_000)
    // diff = 86400000, which is NOT < 86400000, so falls to days branch
    expect(getFreshnessLabel(exactlyOneDay)).toBe("Dados de 1 dias atras")
  })

  it("should return 'Atualizado agora' at exactly 0ms diff", () => {
    const now = new Date()
    vi.useFakeTimers()
    vi.setSystemTime(now)

    expect(getFreshnessLabel(now)).toBe("Atualizado agora")
  })
})
