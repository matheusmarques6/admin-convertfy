/**
 * Tests for GET /api/cron/email-generation-watchdog (Story AE-4).
 *
 * Cobre:
 *  - Auth invalida -> 401
 *  - Cron normal sem trabalho -> 200 + summary zerado
 *  - Sinais pending -> consumeQueueSignal eh chamado
 *  - Copy travada (attempts < MAX) -> claim + runCopyChainInProcess dispatched
 *  - Copy travada (attempts >= MAX) -> UPDATE direto para failed
 *  - Phase 2 timeout -> UPDATE para failed (rendering + qa_running)
 *  - copy_ready stale -> POST pro endpoint interno
 *
 * Mocks: consumeQueueSignal, runCopyChainInProcess, fetch interno,
 * after() (fire-and-forget no test), createAdminClient.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── State shared entre handler e mocks ─────────────────────────
interface UpdateCall {
  table: string
  data: Record<string, unknown>
  filters: Array<{ op: string; col: string; val: unknown }>
  selectReturn: unknown[]
}

interface SelectCall {
  table: string
  filters: Array<{ op: string; col: string; val: unknown }>
}

interface InsertCall {
  table: string
  data: Record<string, unknown>
}

const state = {
  // returns por consulta select
  pendingSignals: [] as Array<{ id: string }>,
  // returns por update.select() conforme filtros
  updateReturns: new Map<string, unknown[]>(),
  // copy_ready stale select
  staleCopyReady: [] as Array<{
    id: string
    flow_id?: string
    generation_batch_id?: string | null
    flow?: { store_id?: string } | Array<{ store_id?: string }> | null
  }>,
  // store_brand_identity rows (GATE 2 — getConfirmedBrandStoreIds)
  brandIdentities: [] as Array<{
    store_id: string
    version: number
    confirmed_at: string | null
  }>,
  // image_done stale select (Bug 2 split / Front 5)
  staleImageDone: [] as Array<{
    id: string
    generation_batch_id?: string | null
  }>,
  selectCalls: [] as SelectCall[],
  updateCalls: [] as UpdateCall[],
  insertCalls: [] as InsertCall[],
  // RPC: increment_copy_ready_dispatch_attempts -> retorna attempts por email
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcReturns: new Map<
    string,
    Array<{ email_id: string; attempts: number }>
  >(),
}

function resetState() {
  state.pendingSignals = []
  state.updateReturns = new Map()
  state.staleCopyReady = []
  state.staleImageDone = []
  state.brandIdentities = []
  state.selectCalls = []
  state.updateCalls = []
  state.insertCalls = []
  state.rpcCalls = []
  state.rpcReturns = new Map()
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildQuery(table: string): any {
  const filters: Array<{ op: string; col: string; val: unknown }> = []
  const chain: any = {}

  // Para SELECT (.select().eq().limit().order().lt())
  const selectChain = {
    eq: (col: string, val: unknown) => {
      filters.push({ op: "eq", col, val })
      return selectChain
    },
    lt: (col: string, val: unknown) => {
      filters.push({ op: "lt", col, val })
      return selectChain
    },
    gte: (col: string, val: unknown) => {
      filters.push({ op: "gte", col, val })
      return selectChain
    },
    in: (col: string, val: unknown) => {
      filters.push({ op: "in", col, val })
      return selectChain
    },
    order: () => selectChain,
    limit: () => selectChain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: { data: unknown; error: null }) => void) => {
      state.selectCalls.push({ table, filters: [...filters] })
      let data: unknown[] = []
      if (table === "email_generation_queue_signals") {
        data = state.pendingSignals
      } else if (table === "email_flow_emails") {
        // SELECT puro em email_flow_emails: tanto front 4 (stale copy_ready)
        // quanto front 5 (stale image_done) usam. Distingue pelo filtro de status.
        const statusFilter = filters.find(
          (f) => f.op === "eq" && f.col === "status",
        )
        if (statusFilter?.val === "image_done") {
          data = state.staleImageDone
        } else {
          data = state.staleCopyReady
        }
      } else if (table === "store_brand_identity") {
        data = state.brandIdentities
      }
      resolve({ data, error: null })
    },
  }

  chain.select = () => selectChain

  // UPDATE: registra e retorna resultado configurado em state.updateReturns
  chain.update = (data: Record<string, unknown>) => {
    const updateFilters: Array<{ op: string; col: string; val: unknown }> = []
    const updateChain: any = {
      eq: (col: string, val: unknown) => {
        updateFilters.push({ op: "eq", col, val })
        return updateChain
      },
      lt: (col: string, val: unknown) => {
        updateFilters.push({ op: "lt", col, val })
        return updateChain
      },
      gte: (col: string, val: unknown) => {
        updateFilters.push({ op: "gte", col, val })
        return updateChain
      },
      in: (col: string, val: unknown) => {
        updateFilters.push({ op: "in", col, val })
        return updateChain
      },
      not: () => updateChain,
      select: () => {
        const selectChain2: any = {
          limit: () => selectChain2,
          then: (resolve: (v: { data: unknown; error: null }) => void) => {
            // Chave: status alvo do UPDATE
            const targetStatus = data.status as string
            const key = `${table}:${targetStatus}`
            const ret = state.updateReturns.get(key) ?? []
            state.updateCalls.push({
              table,
              data,
              filters: updateFilters,
              selectReturn: ret,
            })
            resolve({ data: ret, error: null })
          },
        }
        return selectChain2
      },
      then: (resolve: (v: { data: null; error: null }) => void) => {
        state.updateCalls.push({
          table,
          data,
          filters: updateFilters,
          selectReturn: [],
        })
        resolve({ data: null, error: null })
      },
    }
    return updateChain
  }

  // INSERT: registra (telemetria do watchdog)
  chain.insert = (data: Record<string, unknown>) => {
    state.insertCalls.push({ table, data })
    return {
      select: () => ({
        single: () => Promise.resolve({ data: { id: "run-id" }, error: null }),
      }),
      then: (resolve: (v: { data: null; error: null }) => void) => {
        resolve({ data: null, error: null })
      },
    }
  }

  return chain
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Mocks ──────────────────────────────────────────────────────
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => buildQuery(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args })
      const data = state.rpcReturns.get(fn) ?? []
      return Promise.resolve({ data, error: null })
    },
  })),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}))

interface ConsumeResult {
  signal_id: string
  status: "done" | "failed" | "skipped"
  reason?: string
}
const consumeSpy = vi.fn<(signalId: string) => Promise<ConsumeResult>>(async (signalId) => ({
  signal_id: signalId,
  status: "done",
}))
vi.mock("@/lib/services/email-generation-trigger.service", () => ({
  consumeQueueSignal: (id: string) => consumeSpy(id),
}))

const fallbackSpy = vi.fn<(params: unknown) => Promise<void>>(async () => undefined)
vi.mock("@/lib/agents/copy-chain-fallback.service", () => ({
  runCopyChainInProcess: (params: unknown) => fallbackSpy(params),
}))

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server")
  return {
    ...actual,
    after: (task: unknown) => {
      if (task && typeof (task as Promise<unknown>).then === "function") {
        ;(task as Promise<unknown>).catch(() => {})
      }
    },
  }
})

vi.stubEnv("CRON_SECRET", "test-cron-secret")
vi.stubEnv("INTERNAL_SECRET", "test-internal-secret")
vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
vi.stubEnv("MAX_GENERATION_ATTEMPTS", "3")

// fetch interno para /api/internal/run-phase2
const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
vi.stubGlobal("fetch", fetchSpy)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: (req: any) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  resetState()
  consumeSpy.mockClear()
  fallbackSpy.mockClear()
  fetchSpy.mockClear()
  const mod = await import("./route")
  GET = mod.GET
})

function authedRequest() {
  return new Request("http://localhost/api/cron/email-generation-watchdog", {
    method: "GET",
    headers: { authorization: "Bearer test-cron-secret" },
  })
}

describe("GET /api/cron/email-generation-watchdog — auth", () => {
  it("returns 401 when authorization header is missing", async () => {
    const req = new Request("http://localhost/api/cron/email-generation-watchdog", {
      method: "GET",
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(req as any)
    expect(res.status).toBe(401)
  })

  it("returns 401 with wrong secret", async () => {
    const req = new Request("http://localhost/api/cron/email-generation-watchdog", {
      method: "GET",
      headers: { authorization: "Bearer wrong" },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(req as any)
    expect(res.status).toBe(401)
  })
})

describe("GET /api/cron/email-generation-watchdog — nothing to do", () => {
  it("returns 200 with zeroed summary when no work", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(authedRequest() as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.signals_processed).toBe(0)
    expect(json.copy_recovered).toBe(0)
    expect(json.max_attempts_exhausted).toBe(0)
    expect(json.phase2_timed_out).toBe(0)
    expect(json.stale_copy_ready).toBe(0)
  })
})

describe("GET /api/cron/email-generation-watchdog — front 1: signals", () => {
  it("consumes pending signals via consumeQueueSignal", async () => {
    state.pendingSignals = [
      { id: "11111111-1111-4111-8111-aaaaaaaaaaaa" },
      { id: "22222222-2222-4222-8222-bbbbbbbbbbbb" },
    ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(authedRequest() as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.signals_processed).toBe(2)
    expect(consumeSpy).toHaveBeenCalledTimes(2)
    expect(consumeSpy).toHaveBeenCalledWith("11111111-1111-4111-8111-aaaaaaaaaaaa")
    expect(consumeSpy).toHaveBeenCalledWith("22222222-2222-4222-8222-bbbbbbbbbbbb")
  })

  it("counts failed signal consumes separately and continues", async () => {
    state.pendingSignals = [
      { id: "33333333-3333-4333-8333-cccccccccccc" },
      { id: "44444444-4444-4444-8444-dddddddddddd" },
    ]
    consumeSpy.mockImplementationOnce(async (id: string) => ({
      signal_id: id,
      status: "failed" as const,
      reason: "test_fail",
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(authedRequest() as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.signals_processed).toBe(1)
    expect(json.signals_failed).toBe(1)
  })
})

describe("GET /api/cron/email-generation-watchdog — front 2: copy stuck", () => {
  it("dispatches runCopyChainInProcess for claimed rows", async () => {
    state.updateReturns.set("email_flow_emails:copy_generating_recovery", [
      {
        id: "55555555-5555-4555-8555-eeeeeeeeeeee",
        flow_id: "66666666-6666-4666-8666-ffffffffffff",
        generation_batch_id: "77777777-7777-4777-8777-aaaaaaaaaaaa",
        flow: { store_id: "88888888-8888-4888-8888-bbbbbbbbbbbb" },
      },
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(authedRequest() as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.copy_recovered).toBe(1)
    expect(fallbackSpy).toHaveBeenCalledTimes(1)
    expect(fallbackSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        emailId: "55555555-5555-4555-8555-eeeeeeeeeeee",
        storeId: "88888888-8888-4888-8888-bbbbbbbbbbbb",
      }),
    )

    // Verifica que o claim filtrou por status + attempts < MAX
    const claim = state.updateCalls.find(
      (c) =>
        c.table === "email_flow_emails" &&
        c.data.status === "copy_generating_recovery",
    )
    expect(claim).toBeDefined()
    const statusEq = claim?.filters.find(
      (f) => f.op === "eq" && f.col === "status",
    )
    expect(statusEq?.val).toBe("copy_generating")
    const attemptsLt = claim?.filters.find(
      (f) => f.op === "lt" && f.col === "attempts",
    )
    expect(attemptsLt?.val).toBe(3)
  })

  it("marks emails with attempts >= MAX as failed (max_attempts_exhausted)", async () => {
    state.updateReturns.set("email_flow_emails:failed", [
      {
        id: "99999999-9999-4999-8999-cccccccccccc",
        generation_batch_id: "aaaaaaaa-aaaa-4aaa-8aaa-dddddddddddd",
      },
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(authedRequest() as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.max_attempts_exhausted).toBeGreaterThanOrEqual(1)

    // O primeiro UPDATE para failed deve ter sido o exhaust (gte attempts 3)
    const exhaustCall = state.updateCalls.find(
      (c) =>
        c.table === "email_flow_emails" &&
        c.data.status === "failed" &&
        c.data.failure_reason === "max_attempts_exhausted",
    )
    expect(exhaustCall).toBeDefined()
    const gteFilter = exhaustCall?.filters.find(
      (f) => f.op === "gte" && f.col === "attempts",
    )
    expect(gteFilter?.val).toBe(3)
  })
})

describe("GET /api/cron/email-generation-watchdog — front 3: phase2 timeout", () => {
  it("marks rendering, image_done and qa_running stuck as failed:timeout_phase2", async () => {
    // O handler chama 3 UPDATEs para status='failed' (rendering, image_done,
    // qa_running) — todos com failure_reason='timeout_phase2'. Apenas 1 key
    // disponivel para o mock — retornamos o mesmo array; chamamos GET 1x e
    // contamos.
    state.updateReturns.set("email_flow_emails:failed", [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-eeeeeeeeeeee",
        generation_batch_id: "cccccccc-cccc-4ccc-8ccc-ffffffffffff",
      },
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(authedRequest() as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    // 3 statuses cobertos (rendering, image_done, qa_running) — cada um
    // retorna 1 = total 3.
    expect(json.phase2_timed_out).toBeGreaterThanOrEqual(3)

    const timeoutCalls = state.updateCalls.filter(
      (c) =>
        c.table === "email_flow_emails" &&
        c.data.failure_reason === "timeout_phase2",
    )
    expect(timeoutCalls.length).toBe(3)
    // Verifica que filtramos por status correto em cada um
    const statuses = timeoutCalls
      .map(
        (c) => c.filters.find((f) => f.op === "eq" && f.col === "status")?.val,
      )
      .sort()
    expect(statuses).toEqual(["image_done", "qa_running", "rendering"])
  })
})

describe("GET /api/cron/email-generation-watchdog — front 4: stale copy_ready", () => {
  it("POSTs internal endpoint for each stale copy_ready row", async () => {
    state.staleCopyReady = [
      { id: "dddddddd-dddd-4ddd-8ddd-aaaaaaaaaaaa", flow: { store_id: "store-d" } },
      { id: "eeeeeeee-eeee-4eee-8eee-bbbbbbbbbbbb", flow: { store_id: "store-e" } },
    ]
    // Ambas as lojas com brand confirmada → passam o GATE 2.
    state.brandIdentities = [
      { store_id: "store-d", version: 1, confirmed_at: "2026-06-16T00:00:00Z" },
      { store_id: "store-e", version: 1, confirmed_at: "2026-06-16T00:00:00Z" },
    ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(authedRequest() as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.stale_copy_ready).toBe(2)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    // Verifica URL + header
    const firstCall = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit | undefined,
    ]
    expect(firstCall[0]).toContain("/api/internal/run-phase2/")
    const init = firstCall[1]
    expect(init?.method).toBe("POST")
    const headers = init?.headers as Record<string, string>
    expect(headers["x-internal-secret"]).toBe("test-internal-secret")
  })

  it("ignora e-mail de loja SEM brand confirmada (GATE 2) e dispara so o confirmado", async () => {
    state.staleCopyReady = [
      {
        id: "11111111-1111-4111-8111-aaaaaaaaaaaa",
        flow: { store_id: "store-confirmed" },
      },
      {
        id: "22222222-2222-4222-8222-bbbbbbbbbbbb",
        flow: { store_id: "store-unconfirmed" },
      },
    ]
    state.brandIdentities = [
      { store_id: "store-confirmed", version: 1, confirmed_at: "2026-06-16T00:00:00Z" },
      { store_id: "store-unconfirmed", version: 1, confirmed_at: null },
    ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(authedRequest() as any)
    expect(res.status).toBe(200)
    const json = await res.json()

    // Só a loja com brand confirmada é re-dispatchada; a outra fica esperando.
    expect(json.stale_copy_ready).toBe(1)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const firstCall = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit | undefined,
    ]
    expect(firstCall[0]).toContain("11111111-1111-4111-8111-aaaaaaaaaaaa")
    expect(firstCall[0]).not.toContain("22222222-2222-4222-8222-bbbbbbbbbbbb")
  })

  it("does not POST when INTERNAL_SECRET is missing", async () => {
    vi.stubEnv("INTERNAL_SECRET", "")
    state.staleCopyReady = [
      { id: "ffffffff-ffff-4fff-8fff-cccccccccccc", flow: { store_id: "store-f" } },
    ]
    state.brandIdentities = [
      { store_id: "store-f", version: 1, confirmed_at: "2026-06-16T00:00:00Z" },
    ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(authedRequest() as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.stale_copy_ready).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()

    // restaura para outros testes
    vi.stubEnv("INTERNAL_SECRET", "test-internal-secret")
  })

  it("dispatch falha (5xx): incrementa contador, nao marca exhausted ainda", async () => {
    state.staleCopyReady = [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-111111111111", flow: { store_id: "store-a" } },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-222222222222", flow: { store_id: "store-b" } },
    ]
    state.brandIdentities = [
      { store_id: "store-a", version: 1, confirmed_at: "2026-06-16T00:00:00Z" },
      { store_id: "store-b", version: 1, confirmed_at: "2026-06-16T00:00:00Z" },
    ]
    // Primeiro POST falha (500), segundo passa (200)
    let call = 0
    fetchSpy.mockImplementation(async () => {
      call++
      return new Response(call === 1 ? "fail" : "ok", {
        status: call === 1 ? 500 : 200,
      })
    })
    // RPC retorna attempts ainda baixo (1) -> nao atinge cap (default 3)
    state.rpcReturns.set("increment_copy_ready_dispatch_attempts", [
      { email_id: "aaaaaaaa-aaaa-4aaa-8aaa-111111111111", attempts: 1 },
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(authedRequest() as any)
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(json.stale_copy_ready).toBe(1) // so o segundo POST contou
    expect(json.stale_dispatch_exhausted).toBe(0) // nenhum atingiu cap

    // RPC foi chamada apenas com o id que falhou
    const rpcCall = state.rpcCalls.find(
      (c) => c.fn === "increment_copy_ready_dispatch_attempts",
    )
    expect(rpcCall).toBeDefined()
    expect(rpcCall?.args.p_email_ids).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-111111111111",
    ])

    // Nenhum UPDATE para failed:stale_copy_ready_exhausted
    const exhaustUpdate = state.updateCalls.find(
      (c) =>
        c.table === "email_flow_emails" &&
        c.data.failure_reason === "stale_copy_ready_exhausted",
    )
    expect(exhaustUpdate).toBeUndefined()
  })

  it("dispatch falha apos cap (>=3 attempts): marca failed:stale_copy_ready_exhausted", async () => {
    const failingId = "cccccccc-cccc-4ccc-8ccc-333333333333"
    state.staleCopyReady = [
      {
        id: failingId,
        flow_id: "flow-aaa",
        flow: { store_id: "store-cap" },
        generation_batch_id: "batch-aaa",
      },
    ]
    state.brandIdentities = [
      { store_id: "store-cap", version: 1, confirmed_at: "2026-06-16T00:00:00Z" },
    ]
    // POST falha
    fetchSpy.mockImplementation(
      async () => new Response("server error", { status: 500 }),
    )
    // RPC retorna attempts=3 -> atingiu cap -> deve marcar failed
    state.rpcReturns.set("increment_copy_ready_dispatch_attempts", [
      { email_id: failingId, attempts: 3 },
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(authedRequest() as any)
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.stale_copy_ready).toBe(0)
    expect(json.stale_dispatch_exhausted).toBe(1)

    // Verifica que houve UPDATE marcando como failed com motivo correto
    const exhaustUpdate = state.updateCalls.find(
      (c) =>
        c.table === "email_flow_emails" &&
        c.data.status === "failed" &&
        c.data.failure_reason === "stale_copy_ready_exhausted",
    )
    expect(exhaustUpdate).toBeDefined()
  })
})
