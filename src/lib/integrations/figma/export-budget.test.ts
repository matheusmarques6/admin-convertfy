/**
 * Testes do orçamento distribuído de exports do Figma.
 * - Fail-open sem Redis (dev): pacing in-process apenas
 * - Gate de espaçamento no Redis: negado → dorme o PTTL → re-tenta
 * - Contador de janela (backstop): estourado → dorme até o próximo minuto
 * - maxWaitMs estourado → { ok: false }
 * - Redis fora do ar → fail-open
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const redisMock = vi.hoisted(() => ({
  set: vi.fn(),
  pttl: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
}))

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor() {
      return redisMock
    }
  },
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

type ExportBudgetModule = typeof import("./export-budget")

async function loadModule(withRedis: boolean): Promise<ExportBudgetModule> {
  vi.resetModules()
  if (withRedis) {
    process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io"
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"
  } else {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  }
  return import("./export-budget")
}

beforeEach(() => {
  redisMock.set.mockReset()
  redisMock.pttl.mockReset()
  redisMock.incr.mockReset()
  redisMock.expire.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
})

describe("acquireExportSlot sem Redis (fail-open dev)", () => {
  it("primeiro slot é imediato; o segundo espera o espaçamento", async () => {
    vi.useFakeTimers()
    const m = await loadModule(false)

    const r1 = await m.acquireExportSlot()
    expect(r1.ok).toBe(true)
    expect(r1.waitedMs).toBe(0)

    const p2 = m.acquireExportSlot()
    await vi.advanceTimersByTimeAsync(m.FIGMA_EXPORT_MIN_SPACING_MS)
    const r2 = await p2
    expect(r2.ok).toBe(true)
    expect(r2.waitedMs).toBeGreaterThanOrEqual(m.FIGMA_EXPORT_MIN_SPACING_MS - 50)
  })

  it("maxWaitMs menor que a espera necessária → ok:false sem dormir", async () => {
    vi.useFakeTimers()
    const m = await loadModule(false)
    await m.acquireExportSlot()
    const r = await m.acquireExportSlot({ maxWaitMs: 1_000 })
    expect(r.ok).toBe(false)
  })
})

describe("acquireExportSlot com Redis", () => {
  it("gate concedido + contador dentro do orçamento → slot na hora", async () => {
    redisMock.set.mockResolvedValue("OK")
    redisMock.incr.mockResolvedValue(1)
    redisMock.expire.mockResolvedValue(1)
    const m = await loadModule(true)

    const r = await m.acquireExportSlot()
    expect(r.ok).toBe(true)
    expect(redisMock.set).toHaveBeenCalledWith("figma:images:gate", "1", {
      nx: true,
      px: m.FIGMA_EXPORT_MIN_SPACING_MS,
    })
    expect(redisMock.incr).toHaveBeenCalledTimes(1)
  })

  it("gate negado → dorme o PTTL e re-tenta até conseguir", async () => {
    vi.useFakeTimers()
    redisMock.set.mockResolvedValueOnce(null).mockResolvedValueOnce("OK")
    redisMock.pttl.mockResolvedValue(3_000)
    redisMock.incr.mockResolvedValue(2)
    redisMock.expire.mockResolvedValue(1)
    const m = await loadModule(true)

    const p = m.acquireExportSlot()
    await vi.advanceTimersByTimeAsync(4_000) // 3000 + jitter máx 500
    const r = await p
    expect(r.ok).toBe(true)
    expect(redisMock.set).toHaveBeenCalledTimes(2)
    expect(r.waitedMs).toBeGreaterThanOrEqual(3_000)
  })

  it("contador da janela estourado → dorme até o próximo minuto (backstop)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-07T12:00:30.000Z"))
    redisMock.set.mockResolvedValue("OK")
    redisMock.incr.mockResolvedValueOnce(99).mockResolvedValueOnce(1)
    redisMock.expire.mockResolvedValue(1)
    const m = await loadModule(true)

    const p = m.acquireExportSlot()
    await vi.advanceTimersByTimeAsync(31_000) // 30s até o próximo minuto + jitter
    const r = await p
    expect(r.ok).toBe(true)
    expect(redisMock.incr).toHaveBeenCalledTimes(2)
  })

  it("gate sempre negado → ok:false ao estourar maxWaitMs", async () => {
    vi.useFakeTimers()
    redisMock.set.mockResolvedValue(null)
    redisMock.pttl.mockResolvedValue(7_500)
    const m = await loadModule(true)

    const p = m.acquireExportSlot({ maxWaitMs: 10_000 })
    await vi.advanceTimersByTimeAsync(30_000)
    const r = await p
    expect(r.ok).toBe(false)
    expect(redisMock.incr).not.toHaveBeenCalled()
  })

  it("Redis fora do ar → fail-open (slot local)", async () => {
    redisMock.set.mockRejectedValue(new Error("connection refused"))
    const m = await loadModule(true)

    const r = await m.acquireExportSlot()
    expect(r.ok).toBe(true)
  })
})
