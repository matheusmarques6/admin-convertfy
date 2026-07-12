import { describe, expect, it } from "vitest"
import {
  combineUnread,
  countActiveReportJobs,
  countReportUnread,
} from "./unread-math"
import type { ReportJobStatus } from "@/types/report"

const job = (status: ReportJobStatus, viewed_at: string | null = null) => ({
  status,
  viewed_at,
})

describe("countReportUnread", () => {
  it("terminais não vistos contam; vistos não", () => {
    expect(
      countReportUnread([
        job("completed"),
        job("partial"),
        job("failed"),
        job("completed", "2026-07-11T00:00:00Z"),
      ]),
    ).toBe(3)
  })

  it("ativos contam (queued/processing/paused), mesmo sem viewed_at", () => {
    expect(countReportUnread([job("queued"), job("processing"), job("paused")])).toBe(3)
    expect(countActiveReportJobs([job("processing")])).toBe(1)
  })

  it("cancelado/expirado NUNCA contam", () => {
    expect(countReportUnread([job("cancelled"), job("expired")])).toBe(0)
  })

  it("lista vazia → 0", () => {
    expect(countReportUnread([])).toBe(0)
  })
})

describe("combineUnread (regressão: badge do menu = sino + relatórios)", () => {
  it("soma as duas fontes", () => {
    expect(combineUnread(3, 2)).toBe(5)
  })
  it("uma fonte zerada não apaga a outra", () => {
    expect(combineUnread(0, 4)).toBe(4)
    expect(combineUnread(4, 0)).toBe(4)
  })
  it("valores negativos (defensivo) clampam em 0", () => {
    expect(combineUnread(-1, 2)).toBe(2)
  })
})
