/**
 * Tests for PATCH /api/tasks/[id]/campaign-images/results (regerar 1 loja).
 *
 * Mocka requireTaskAccess e o service. Foco: guard de source_type, validação
 * Zod e wiring (adjustment_notes opcional).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const SUG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const STORE_A = "11111111-1111-4111-8111-111111111111"
const BATCH = "44444444-4444-4444-8444-444444444444"

let mockTaskCtx: {
  task: { source_type: string; source_id: string | null }
  member: { orgId: string }
}

const regenerateMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/services/campaign-central/campaign-image-generation.service", () => ({
  regenerateResult: regenerateMock,
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
  })),
  createAdminClient: vi.fn(() => ({})),
}))

vi.mock("@/lib/api/onboarding-task-access", () => ({
  requireTaskAccess: vi.fn(async () => mockTaskCtx),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

vi.mock("@/lib/cors", () => ({
  corsHeaders: () => ({}),
  handleCorsPreFlight: vi.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PATCH: (req: any, ctx: any) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  mockTaskCtx = {
    task: { source_type: "campaign_suggestion", source_id: SUG },
    member: { orgId: ORG },
  }
  regenerateMock.mockResolvedValue({ id: "r1", store_id: STORE_A, status: "ready" })
  const mod = await import("./route")
  PATCH = mod.PATCH
})

const params = { params: Promise.resolve({ id: "task-1" }) }
function patchReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/tasks/task-1/campaign-images/results", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("PATCH /api/tasks/[id]/campaign-images/results", () => {
  it("retry sem nota -> 200 (notes null)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await PATCH(patchReq({ batch_id: BATCH, store_id: STORE_A }) as any, params)
    expect(res.status).toBe(200)
    expect(regenerateMock).toHaveBeenCalledWith(BATCH, ORG, STORE_A, null)
  })

  it("regerar com ajuste -> 200 (passa notes)", async () => {
    regenerateMock.mockResolvedValue({ id: "r1", store_id: STORE_A, status: "adjustment" })
    const res = await PATCH(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      patchReq({ batch_id: BATCH, store_id: STORE_A, adjustment_notes: "mais escuro" }) as any,
      params,
    )
    expect(res.status).toBe(200)
    expect(regenerateMock).toHaveBeenCalledWith(BATCH, ORG, STORE_A, "mais escuro")
  })

  it("task não-campanha -> 400 (não chama service)", async () => {
    mockTaskCtx.task.source_type = "onboarding"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await PATCH(patchReq({ batch_id: BATCH, store_id: STORE_A }) as any, params)
    expect(res.status).toBe(400)
    expect(regenerateMock).not.toHaveBeenCalled()
  })

  it("store_id não-uuid -> 400 (Zod)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await PATCH(patchReq({ batch_id: BATCH, store_id: "abc" }) as any, params)
    expect(res.status).toBe(400)
    expect(regenerateMock).not.toHaveBeenCalled()
  })

  it("batch_id ausente -> 400 (Zod)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await PATCH(patchReq({ store_id: STORE_A }) as any, params)
    expect(res.status).toBe(400)
  })
})
