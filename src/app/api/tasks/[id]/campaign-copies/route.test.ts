/**
 * Tests for /api/tasks/[id]/campaign-copies (painel de handoff do designer).
 *
 * Mocka requireTaskAccess (acesso testado em campaign-task-access.test.ts) e o
 * admin client — exercita o serviço real (getCampaignHandoff/setHandoffPilot):
 *  - GET monta lojas + copies de PRODUÇÃO + status (ready/pending)
 *  - GET task não-campanha -> 400
 *  - PATCH grava design_pilot_store_id
 *  - PATCH loja fora dos targets -> 400
 *  - PATCH idempotente (2x)
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const SUG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const STORE_A = "11111111-1111-4111-8111-111111111111"
const STORE_B = "22222222-2222-4222-8222-222222222222"
const STORE_C = "33333333-3333-4333-8333-333333333333"

interface MockSug {
  id: string
  title: string
  channel: string
  send_date: string | null
  subject: string | null
  targets: Array<{ store_id: string; store_name: string; country: string }>
  copy_results: { production?: Record<string, Record<string, unknown>> }
  design_pilot_store_id: string | null
  design_pipeline_id?: string | null
  design_version?: number | null
}

let mockSuggestion: MockSug
let mockStores: Array<{ id: string; language: string | null; country: string | null }>
let mockFigma: { col: unknown; anchor: unknown; deliv: unknown }
const mockUpdateCalls: Array<{ table: string; patch: Record<string, unknown> }> = []
let mockTaskCtx: { task: { source_type: string; source_id: string | null }; member: { orgId: string } }

function reset() {
  mockSuggestion = {
    id: SUG,
    title: "Mid-Year Sale",
    channel: "Email + SMS",
    send_date: "2026-07-15",
    subject: "Assunto base da campanha",
    targets: [
      { store_id: STORE_A, store_name: "Loja A", country: "BR" },
      { store_id: STORE_B, store_name: "Loja B", country: "PT" },
    ],
    copy_results: {
      production: {
        [STORE_A]: {
          subject: "Sub A",
          preheader: "Pre A",
          blocks: [{ type: "text", value: "corpo" }],
          status: "success",
        },
        [STORE_B]: { subject: "", preview: "", status: "pending" },
      },
    },
    design_pilot_store_id: null,
  }
  mockStores = [
    { id: STORE_A, language: "pt-BR", country: "BR" },
    { id: STORE_B, language: "en", country: "PT" },
  ]
  mockUpdateCalls.length = 0
  mockFigma = { col: null, anchor: null, deliv: null }
  mockTaskCtx = {
    task: { source_type: "campaign_suggestion", source_id: SUG },
    member: { orgId: ORG },
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildQuery(table: string): any {
  const self: any = {}
  self.select = () => self
  self.eq = () => self
  self.neq = () => self
  self.order = () => self
  self.limit = () => self
  self.in = () => ({
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: table === "client_stores" ? mockStores : [], error: null }),
  })
  self.maybeSingle = () => {
    const byTable: Record<string, unknown> = {
      campaign_suggestions: mockSuggestion,
      operational_pipeline_columns: mockFigma.col,
      tasks: mockFigma.anchor,
      task_deliverables: mockFigma.deliv,
    }
    return Promise.resolve({ data: byTable[table] ?? null, error: null })
  }
  self.update = (patch: Record<string, unknown>) => {
    mockUpdateCalls.push({ table, patch })
    const chain: any = {
      eq: () => chain,
      then: (resolve: (v: { data: null; error: null }) => void) =>
        resolve({ data: null, error: null }),
    }
    return chain
  }
  return self
}
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
  })),
  createAdminClient: vi.fn(() => ({ from: (t: string) => buildQuery(t) })),
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
let PATCH: (req: any, ctx: any) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  reset()
  const mod = await import("./route")
  GET = mod.GET
  PATCH = mod.PATCH
})

const params = { params: Promise.resolve({ id: "task-1" }) }
function getReq(): Request {
  return new Request("http://localhost/api/tasks/task-1/campaign-copies")
}
function patchReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/tasks/task-1/campaign-copies", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("GET /api/tasks/[id]/campaign-copies", () => {
  it("monta lojas + copies de produção com status", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(getReq() as any, params)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.suggestion_id).toBe(SUG)
    expect(json.channel).toBe("Email + SMS")
    expect(json.subject).toBe("Assunto base da campanha")
    expect(json.pilot_store_id).toBeNull()
    expect(json.figma_link).toBeNull()
    expect(json.stores).toHaveLength(2)

    const a = json.stores.find((s: { store_id: string }) => s.store_id === STORE_A)
    expect(a.status).toBe("ready")
    expect(a.language).toBe("pt-BR")
    expect(a.copy.subject).toBe("Sub A")

    const b = json.stores.find((s: { store_id: string }) => s.store_id === STORE_B)
    expect(b.status).toBe("pending")
  })

  it("status 'missing' quando a loja não tem copy de produção", async () => {
    delete mockSuggestion.copy_results.production![STORE_B]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(getReq() as any, params)
    const json = await res.json()
    const b = json.stores.find((s: { store_id: string }) => s.store_id === STORE_B)
    expect(b.status).toBe("missing")
    expect(b.copy).toBeNull()
  })

  it("inclui figma_link quando a estrutura foi entregue", async () => {
    mockSuggestion.design_pipeline_id = "pipe-1"
    mockSuggestion.design_version = 1
    mockFigma = {
      col: { id: "col-est" },
      anchor: { id: "anchor-1" },
      deliv: { value: "https://figma.com/x", filled_at: "2026-06-30T00:00:00Z" },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(getReq() as any, params)
    const json = await res.json()
    expect(json.figma_link).toBe("https://figma.com/x")
    expect(json.figma_filled_at).toBe("2026-06-30T00:00:00Z")
  })

  it("task que não é de campanha -> 400", async () => {
    mockTaskCtx.task.source_type = "onboarding"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(getReq() as any, params)
    expect(res.status).toBe(400)
  })
})

describe("PATCH /api/tasks/[id]/campaign-copies", () => {
  it("grava design_pilot_store_id da loja escolhida", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await PATCH(patchReq({ store_id: STORE_A }) as any, params)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.pilot_store_id).toBe(STORE_A)
    const upd = mockUpdateCalls.find((c) => c.table === "campaign_suggestions")
    expect(upd?.patch.design_pilot_store_id).toBe(STORE_A)
  })

  it("loja fora dos targets -> 400 e não grava", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await PATCH(patchReq({ store_id: STORE_C }) as any, params)
    expect(res.status).toBe(400)
    expect(mockUpdateCalls).toHaveLength(0)
  })

  it("store_id inválido (não-uuid) -> 400", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await PATCH(patchReq({ store_id: "abc" }) as any, params)
    expect(res.status).toBe(400)
  })

  it("idempotente: 2 chamadas na mesma loja, ambas 200", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r1 = await PATCH(patchReq({ store_id: STORE_A }) as any, params)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r2 = await PATCH(patchReq({ store_id: STORE_A }) as any, params)
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
  })
})
