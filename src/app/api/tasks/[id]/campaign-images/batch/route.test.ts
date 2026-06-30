/**
 * Tests for PATCH /api/tasks/[id]/campaign-images/batch (editar lote sem gerar).
 *
 * Mocka requireTaskAccess e o service. Foco: guard de source_type, validação
 * Zod (adapt_flags strict) e wiring (devolve o lote do getCampaignImageData).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const SUG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const BATCH = "44444444-4444-4444-8444-444444444444"

let mockTaskCtx: {
  task: { source_type: string; source_id: string | null }
  member: { orgId: string }
}

const updateBatchMock = vi.hoisted(() => vi.fn())
const getDataMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/services/campaign-central/campaign-image-generation.service", () => ({
  updateBatch: updateBatchMock,
  getCampaignImageData: getDataMock,
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
  updateBatchMock.mockResolvedValue({ id: BATCH })
  getDataMock.mockResolvedValue({
    suggestion_id: SUG,
    stores: [],
    batches: [{ id: BATCH, name: "Hero atualizado", results: [] }],
  })
  const mod = await import("./route")
  PATCH = mod.PATCH
})

const params = { params: Promise.resolve({ id: "task-1" }) }
function patchReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/tasks/task-1/campaign-images/batch", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("PATCH /api/tasks/[id]/campaign-images/batch", () => {
  it("atualiza campos -> 200 e devolve o lote", async () => {
    const res = await PATCH(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      patchReq({ batch_id: BATCH, name: "Hero atualizado", format: "square" }) as any,
      params,
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.batch.id).toBe(BATCH)
    expect(updateBatchMock).toHaveBeenCalledTimes(1)
    const [batchId, orgArg] = updateBatchMock.mock.calls[0]
    expect(batchId).toBe(BATCH)
    expect(orgArg).toBe(ORG)
  })

  it("aceita adapt_flags válidas -> 200", async () => {
    const res = await PATCH(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      patchReq({ batch_id: BATCH, adapt_flags: { cores: true, logo: false } }) as any,
      params,
    )
    expect(res.status).toBe(200)
  })

  it("adapt_flags com chave desconhecida -> 400 (strict)", async () => {
    const res = await PATCH(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      patchReq({ batch_id: BATCH, adapt_flags: { foo: true } }) as any,
      params,
    )
    expect(res.status).toBe(400)
    expect(updateBatchMock).not.toHaveBeenCalled()
  })

  it("format inválido -> 400 (Zod)", async () => {
    const res = await PATCH(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      patchReq({ batch_id: BATCH, format: "round" }) as any,
      params,
    )
    expect(res.status).toBe(400)
  })

  it("batch_id não-uuid -> 400 (Zod)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await PATCH(patchReq({ batch_id: "abc", name: "x" }) as any, params)
    expect(res.status).toBe(400)
  })

  it("task não-campanha -> 400 (não chama service)", async () => {
    mockTaskCtx.task.source_type = "onboarding"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await PATCH(patchReq({ batch_id: BATCH, name: "x" }) as any, params)
    expect(res.status).toBe(400)
    expect(updateBatchMock).not.toHaveBeenCalled()
  })
})
