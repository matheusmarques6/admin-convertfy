import { describe, it, expect, vi } from "vitest"
import { runSlotWithRetry } from "./retry-slot"

const comOrcamento = () => 60_000
const semOrcamento = () => 0

describe("runSlotWithRetry", () => {
  it("sucesso de primeira não gasta a segunda chance", async () => {
    const run = vi.fn(async () => ({ ok: true, url: "a" }))
    const r = await runSlotWithRetry(run, comOrcamento)
    expect(run).toHaveBeenCalledTimes(1)
    expect(r.retried).toBe(false)
    expect(r.result.url).toBe("a")
  })

  it("falha e vinga na segunda — é o caso do review sem foto", async () => {
    // 1ª chamada: o modelo devolveu JSON onde o contrato pede PNG.
    const run = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, url: null })
      .mockResolvedValueOnce({ ok: true, url: "b" })
    const r = await runSlotWithRetry(run, comOrcamento)
    expect(run).toHaveBeenCalledTimes(2)
    expect(r.retried).toBe(true)
    expect(r.result).toEqual({ ok: true, url: "b" })
  })

  it("falhando duas vezes, para — insistir queima o orçamento dos outros", async () => {
    const run = vi.fn(async () => ({ ok: false, url: null }))
    const r = await runSlotWithRetry(run, comOrcamento)
    expect(run).toHaveBeenCalledTimes(2)
    expect(r.result.ok).toBe(false)
  })

  it("sem orçamento não há segunda tentativa", async () => {
    const run = vi.fn(async () => ({ ok: false, url: null }))
    const r = await runSlotWithRetry(run, semOrcamento)
    expect(run).toHaveBeenCalledTimes(1)
    expect(r.retried).toBe(false)
  })

  it("o orçamento é lido DEPOIS da 1ª chamada, não antes", async () => {
    // A 1ª tentativa pode consumir o resto do orçamento; um valor
    // capturado antes autorizaria uma 2ª chamada que já não cabe.
    let restante = 60_000
    const run = vi.fn(async () => {
      restante = 0
      return { ok: false, url: null }
    })
    const r = await runSlotWithRetry(run, () => restante)
    expect(run).toHaveBeenCalledTimes(1)
    expect(r.retried).toBe(false)
  })
})
