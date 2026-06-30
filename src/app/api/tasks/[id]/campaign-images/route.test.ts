/**
 * Tests for GET/POST /api/tasks/[id]/campaign-images.
 *
 * Mocka requireTaskAccess (acesso testado em campaign-task-access.test.ts) e o
 * service (lógica testada em campaign-image-generation.service.test.ts). Foco:
 * guard de source_type, validação Zod (discriminated union) e wiring.
 *  - GET task de campanha -> 200 + payload
 *  - GET task não-campanha -> 400
 *  - POST create_batch -> 201
 *  - POST generate_batch -> 200
 *  - POST payload inválido -> 400
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const SUG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const BATCH = "44444444-4444-4444-8444-444444444444"

let mockTaskCtx: {
  task: { source_type: string; source_id: string | null }
  member: { orgId: string }
}

const getDataMock = vi.hoisted(() => vi.fn())
const createBatchMock = vi.hoisted(() => vi.fn())
const generateBatchMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/services/campaign-central/campaign-image-generation.service", () => ({
  getCampaignImageData: getDataMock,
  createBatch: createBatchMock,
  generateBatch: generateBatchMock,
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
let GET: (req: any, ctx: any) => Promise<Response>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any, ctx: any) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  mockTaskCtx = {
    task: { source_type: "campaign_suggestion", source_id: SUG },
    member: { orgId: ORG },
  }
  getDataMock.mockResolvedValue({
    suggestion_id: SUG,
    title: "Sale",
    send_date: null,
    stores: [],
    batches: [],
  })
  createBatchMock.mockResolvedValue({ id: BATCH, results: [] })
  generateBatchMock.mockResolvedValue({ id: BATCH, results: [] })
  const mod = await import("./route")
  GET = mod.GET
  POST = mod.POST
})

const params = { params: Promise.resolve({ id: "task-1" }) }
function getReq(): Request {
  return new Request("http://localhost/api/tasks/task-1/campaign-images")
}
function postReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/tasks/task-1/campaign-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("GET /api/tasks/[id]/campaign-images", () => {
  it("task de campanha -> 200 + payload", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(getReq() as any, params)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.suggestion_id).toBe(SUG)
    expect(getDataMock).toHaveBeenCalledWith(SUG, ORG)
  })

  it("task que não é de campanha -> 400 (não chama service)", async () => {
    mockTaskCtx.task.source_type = "onboarding"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(getReq() as any, params)
    expect(res.status).toBe(400)
    expect(getDataMock).not.toHaveBeenCalled()
  })

  it("campanha sem source_id -> 400", async () => {
    mockTaskCtx.task.source_id = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(getReq() as any, params)
    expect(res.status).toBe(400)
  })
})

describe("POST /api/tasks/[id]/campaign-images", () => {
  it("create_batch válido -> 201", async () => {
    const res = await POST(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      postReq({ action: "create_batch", name: "Hero", format: "hero", instruction: "x" }) as any,
      params,
    )
    expect(res.status).toBe(201)
    expect(createBatchMock).toHaveBeenCalledTimes(1)
    const [sugArg, orgArg, input, userId] = createBatchMock.mock.calls[0]
    expect(sugArg).toBe(SUG)
    expect(orgArg).toBe(ORG)
    expect(input.task_id).toBe("task-1")
    expect(userId).toBe("u1")
  })

  it("generate_batch válido -> 200", async () => {
    const res = await POST(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      postReq({ action: "generate_batch", batch_id: BATCH }) as any,
      params,
    )
    expect(res.status).toBe(200)
    expect(generateBatchMock).toHaveBeenCalledWith(BATCH, ORG)
  })

  it("create_batch sem name -> 400 (Zod)", async () => {
    const res = await POST(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      postReq({ action: "create_batch", format: "hero" }) as any,
      params,
    )
    expect(res.status).toBe(400)
    expect(createBatchMock).not.toHaveBeenCalled()
  })

  it("create_batch com format inválido -> 400 (Zod)", async () => {
    const res = await POST(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      postReq({ action: "create_batch", name: "x", format: "round" }) as any,
      params,
    )
    expect(res.status).toBe(400)
  })

  it("create_batch com text_context válido -> 201 e repassa ao service", async () => {
    const res = await POST(
      postReq({
        action: "create_batch",
        name: "Hero",
        format: "hero",
        text_context: {
          nicho: { include: true },
          headline: { include: true, value: "50% OFF" },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
      params,
    )
    expect(res.status).toBe(201)
    const [, , input] = createBatchMock.mock.calls[0]
    expect(input.text_context).toEqual({
      nicho: { include: true },
      headline: { include: true, value: "50% OFF" },
    })
  })

  it("create_batch com chave desconhecida dentro de text field -> 400 (strict)", async () => {
    const res = await POST(
      postReq({
        action: "create_batch",
        name: "Hero",
        format: "hero",
        text_context: { nicho: { include: true, foo: "bar" } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
      params,
    )
    expect(res.status).toBe(400)
    expect(createBatchMock).not.toHaveBeenCalled()
  })

  it("generate_batch com batch_id não-uuid -> 400 (Zod)", async () => {
    const res = await POST(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      postReq({ action: "generate_batch", batch_id: "abc" }) as any,
      params,
    )
    expect(res.status).toBe(400)
    expect(generateBatchMock).not.toHaveBeenCalled()
  })

  it("action desconhecida -> 400 (discriminated union)", async () => {
    const res = await POST(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      postReq({ action: "explode" }) as any,
      params,
    )
    expect(res.status).toBe(400)
  })

  it("task não-campanha no POST -> 400 (antes da validação)", async () => {
    mockTaskCtx.task.source_type = "onboarding"
    const res = await POST(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      postReq({ action: "generate_batch", batch_id: BATCH }) as any,
      params,
    )
    expect(res.status).toBe(400)
    expect(generateBatchMock).not.toHaveBeenCalled()
  })
})
