/**
 * Tests do exchange-rate.service — protecoes contra cache stampede.
 *
 * Contexto: em 2026-07-26 um pico de 503 no Supabase virou uma rajada de 46
 * leituras + 14 upserts em exchange_rate_cache, porque o `error` do
 * supabase-js era descartado (um 503 virava "cache miss") e nao havia
 * singleflight. Estes testes fixam os tres comportamentos que impedem a
 * repeticao: dedup de chamadas concorrentes, stale-on-error e cooldown.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Estado mutavel dos mocks ──────────────────────────────────
let selectCalls = 0
let upsertCalls = 0
let fetchCalls = 0

// Resposta do SELECT no L2 (exchange_rate_cache)
let l2Response: { data: { rates: Record<string, number> } | null; error: { code: string; message: string } | null } = {
  data: null,
  error: null,
}

// Resposta da API externa (L3)
let apiResponse: () => Promise<Response> = () =>
  Promise.resolve(
    new Response(JSON.stringify({ result: "success", rates: { USD: 0.2 } }), { status: 200 }),
  )

function buildQuery() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gt: () => chain,
    maybeSingle: () => {
      selectCalls++
      return Promise.resolve(l2Response)
    },
    upsert: () => {
      upsertCalls++
      return Promise.resolve({ data: null, error: null })
    },
  }
  return chain
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => buildQuery(),
  })),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}))

import {
  convertToBRL,
  convertToBRLDetailed,
  __resetExchangeRateCacheForTests,
} from "./exchange-rate.service"

beforeEach(() => {
  selectCalls = 0
  upsertCalls = 0
  fetchCalls = 0
  l2Response = { data: null, error: null }
  apiResponse = () =>
    Promise.resolve(
      new Response(JSON.stringify({ result: "success", rates: { USD: 0.2 } }), { status: 200 }),
    )
  vi.stubGlobal("fetch", () => {
    fetchCalls++
    return apiResponse()
  })
  __resetExchangeRateCacheForTests()
})

describe("short-circuits (nao tocam em cache)", () => {
  it("BRL retorna o proprio valor sem ler o L2", async () => {
    const r = await convertToBRLDetailed(100, "BRL")
    expect(r).toEqual({ valueBRL: 100, converted: true, reason: "same-currency" })
    expect(selectCalls).toBe(0)
  })

  it("valor zero nao le o L2", async () => {
    const r = await convertToBRLDetailed(0, "USD")
    expect(r.converted).toBe(true)
    expect(selectCalls).toBe(0)
  })
})

describe("singleflight", () => {
  it("N chamadas concorrentes produzem UMA leitura no L2 e UM fetch externo", async () => {
    // L2 vazio (miss legitimo) → cai pro L3
    l2Response = { data: null, error: null }

    const results = await Promise.all(
      Array.from({ length: 20 }, () => convertToBRL(100, "USD")),
    )

    expect(selectCalls).toBe(1)
    expect(fetchCalls).toBe(1)
    expect(upsertCalls).toBe(1)
    // 1 BRL = 0.2 USD → 100 USD = 500 BRL
    expect(results.every((v) => v === 500)).toBe(true)
  })

  it("apos a busca terminar, o L1 serve as chamadas seguintes", async () => {
    await convertToBRL(100, "USD")
    expect(selectCalls).toBe(1)

    await convertToBRL(50, "USD")
    await convertToBRL(25, "USD")
    expect(selectCalls).toBe(1) // continua 1: L1 quente
    expect(fetchCalls).toBe(1)
  })
})

describe("stale-on-error (o defeito do incidente)", () => {
  it("com L1 expirado, erro no L2 serve a cotacao VELHA sem tocar no L3", async () => {
    vi.useFakeTimers()
    try {
      // Cache quente vindo do banco: 1 BRL = 0.2 USD
      l2Response = { data: { rates: { USD: 0.2 } }, error: null }
      expect(await convertToBRL(100, "USD")).toBe(500)
      expect(fetchCalls).toBe(0)

      // Passa do TTL de 1h — o L1 expira de verdade
      await vi.advanceTimersByTimeAsync(61 * 60 * 1000)

      // Agora o banco cai, como no incidente
      l2Response = { data: null, error: { code: "503", message: "Service Unavailable" } }

      // Deve devolver a cotacao velha (500), NAO o valor cru (100),
      // e sem disparar fetch externo nem upsert.
      expect(await convertToBRL(100, "USD")).toBe(500)
      expect(fetchCalls).toBe(0)
      expect(upsertCalls).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("erro no L2 sem stale disponivel devolve o valor NAO convertido", async () => {
    l2Response = { data: null, error: { code: "503", message: "Service Unavailable" } }

    const r = await convertToBRLDetailed(100, "USD")

    expect(r).toEqual({ valueBRL: 100, converted: false, reason: "no-rates" })
    expect(fetchCalls).toBe(0) // nao tentou o L3
  })
})

describe("cooldown pos-falha", () => {
  it("apos falha, chamadas seguintes nao retentam o L2", async () => {
    l2Response = { data: null, error: { code: "503", message: "Service Unavailable" } }

    await convertToBRL(100, "USD")
    expect(selectCalls).toBe(1)

    // Dentro da janela de cooldown: nao deve tocar no L2 de novo
    await convertToBRL(100, "USD")
    await convertToBRL(100, "USD")
    expect(selectCalls).toBe(1)
  })
})

describe("L2 hit", () => {
  it("cotacao vinda do banco evita o fetch externo", async () => {
    l2Response = { data: { rates: { USD: 0.25 } }, error: null }

    const v = await convertToBRL(100, "USD")

    expect(selectCalls).toBe(1)
    expect(fetchCalls).toBe(0)
    expect(v).toBe(400) // 100 / 0.25
  })
})
