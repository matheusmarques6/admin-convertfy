/**
 * Tests for POST /api/admin/stores/[id]/start-onboarding
 *
 * Cobre os 3 modes (fresh, resume, redo) + 422 (briefing not confirmed)
 * + 409 (batch in progress) + 502 (n8n dispatch failed).
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"

const MOCK_USER_ID = "user-uuid-1"
const MOCK_STORE_ID = "store-uuid-1"
const MOCK_FLOW_ID = "flow-uuid-1"

// ── Mock state mutáveis entre testes ──────────────────────────
let mockBriefing: { id: string; version: number; status: string } | null = {
  id: "briefing-1",
  version: 3,
  status: "confirmed",
}
let mockFlows: Array<{ id: string; flow_type: string }> = [
  { id: MOCK_FLOW_ID, flow_type: "welcome" },
]
let mockEmails: Array<{
  id: string
  flow_id: string
  number: number
  name: string | null
  status: string
  generation_batch_id: string | null
}> = []

let mockWebhookResponse: Response = new Response("{}", { status: 200 })
const updateCalls: Array<{ table: string; data: Record<string, unknown> }> = []
const insertCalls: Array<{ table: string; data: Record<string, unknown> }> = []

function resetState() {
  mockBriefing = { id: "briefing-1", version: 3, status: "confirmed" }
  mockFlows = [{ id: MOCK_FLOW_ID, flow_type: "welcome" }]
  mockEmails = [
    {
      id: "email-1",
      flow_id: MOCK_FLOW_ID,
      number: 1,
      name: "Welcome 1",
      status: "draft",
      generation_batch_id: null,
    },
    {
      id: "email-2",
      flow_id: MOCK_FLOW_ID,
      number: 2,
      name: "Welcome 2",
      status: "draft",
      generation_batch_id: null,
    },
  ]
  mockWebhookResponse = new Response("{}", { status: 200 })
  updateCalls.length = 0
  insertCalls.length = 0
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildQuery(table: string): any {
  const self: any = {}

  // common chain methods that return self
  ;["select", "eq", "in", "order", "limit", "not", "neq"].forEach((m) => {
    self[m] = () => self
  })

  // terminal methods
  self.maybeSingle = () => {
    if (table === "store_briefings") return Promise.resolve({ data: mockBriefing, error: null })
    return Promise.resolve({ data: null, error: null })
  }
  self.single = self.maybeSingle

  // Allow await on the chain (e.g. await admin.from(...).select(...).in(...))
  self.then = (resolve: (v: { data: unknown; error: null }) => void) => {
    if (table === "email_flows") {
      resolve({ data: mockFlows, error: null })
    } else if (table === "email_flow_emails") {
      resolve({ data: mockEmails, error: null })
    } else {
      resolve({ data: [], error: null })
    }
  }

  self.update = (data: Record<string, unknown>) => {
    updateCalls.push({ table, data })
    const updateChain: any = {
      eq: () => updateChain,
      in: () => updateChain,
      not: () => updateChain,
      select: () => ({
        // simulate the .select() after update returning the rows touched
        then: (resolve: (v: { data: unknown; error: null }) => void) => {
          if (table === "email_flow_emails") {
            // simulate batch update: apply status to all mockEmails matching criteria
            const updated = mockEmails.map((e) => ({
              id: e.id,
              flow_id: e.flow_id,
              number: e.number,
              name: e.name,
            }))
            // also reflect in mockEmails
            mockEmails = mockEmails.map((e) => ({
              ...e,
              status: (data.status as string) ?? e.status,
              generation_batch_id:
                (data.generation_batch_id as string) ?? e.generation_batch_id,
            }))
            resolve({ data: updated, error: null })
          } else {
            resolve({ data: [], error: null })
          }
        },
      }),
      then: (resolve: (v: { data: null; error: null }) => void) => {
        resolve({ data: null, error: null })
      },
    }
    // when no select() is called after update
    return updateChain
  }

  self.insert = (data: Record<string, unknown>) => {
    insertCalls.push({ table, data })
    return {
      then: (resolve: (v: { data: null; error: null }) => void) =>
        resolve({ data: null, error: null }),
    }
  }

  self.rpc = () => Promise.resolve({ data: null, error: null })

  return self
}
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => ({ data: { user: { id: MOCK_USER_ID } }, error: null }) },
  }),
  createAdminClient: vi.fn(() => ({
    from: (table: string) => buildQuery(table),
    rpc: () => Promise.resolve({ data: null, error: null }),
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

vi.mock("@/lib/cors", () => ({
  corsHeaders: () => ({}),
  handleCorsPreFlight: vi.fn(),
}))

vi.stubEnv("N8N_EMAIL_COPY_URL", "https://n8n.test/start-onboarding")
vi.stubEnv("N8N_WEBHOOK_SECRET", "test-secret")
vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")

const originalFetch = globalThis.fetch
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => mockWebhookResponse))
})
afterAll(() => {
  globalThis.fetch = originalFetch
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  resetState()
  const mod = await import("./route")
  POST = mod.POST
})

function makeRequest(body: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/admin/stores/x/start-onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function ctx() {
  return { params: Promise.resolve({ id: MOCK_STORE_ID }) }
}

// ──────────────────────────────────────────────────────────────
// Modes
// ──────────────────────────────────────────────────────────────

describe("POST /start-onboarding — mode=fresh (default)", () => {
  it("returns 200 + dispatches all eligible emails when briefing confirmed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest({}) as any, ctx())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.dispatched_to_n8n).toBe(true)
    expect(json.emails_dispatched).toBe(2)
    expect(json.mode).toBe("fresh")
    // marca como copy_generating
    const flowUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_generating",
    )
    expect(flowUpdate).toBeDefined()
  })
})

describe("POST /start-onboarding — mode=resume", () => {
  it("retorna batch existente sem disparar n8n quando ja em andamento", async () => {
    mockEmails = [
      {
        id: "email-1",
        flow_id: MOCK_FLOW_ID,
        number: 1,
        name: "Welcome 1",
        status: "copy_generating",
        generation_batch_id: "existing-batch-uuid",
      },
    ]
    const fetchSpy = vi.fn(async () => mockWebhookResponse)
    vi.stubGlobal("fetch", fetchSpy)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest({ mode: "resume" }) as any, ctx())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.batch_id).toBe("existing-batch-uuid")
    expect(json.dispatched_to_n8n).toBe(false)
    expect(json.reused_batch).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("permite continuar mesmo sem briefing confirmado", async () => {
    mockBriefing = { id: "briefing-1", version: 3, status: "current" }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest({ mode: "resume" }) as any, ctx())
    expect(res.status).toBe(200)
  })
})

describe("POST /start-onboarding — mode=redo", () => {
  it("marca emails em andamento como failed e dispara novo batch", async () => {
    mockEmails = [
      {
        id: "email-1",
        flow_id: MOCK_FLOW_ID,
        number: 1,
        name: "Welcome 1",
        status: "copy_generating",
        generation_batch_id: "old-batch",
      },
      {
        id: "email-2",
        flow_id: MOCK_FLOW_ID,
        number: 2,
        name: "Welcome 2",
        status: "ready",
        generation_batch_id: "old-batch",
      },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest({ mode: "redo" }) as any, ctx())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    // tem update marcando failed com motivo superseded_by_redo
    const failedUpdate = updateCalls.find(
      (c) => c.data.failure_reason === "superseded_by_redo",
    )
    expect(failedUpdate).toBeDefined()
  })
})

// ──────────────────────────────────────────────────────────────
// Errors
// ──────────────────────────────────────────────────────────────

describe("POST /start-onboarding — 422 briefing_not_confirmed", () => {
  it("retorna 400/422 quando briefing nao esta confirmed e mode=fresh", async () => {
    mockBriefing = { id: "briefing-1", version: 3, status: "current" }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest({ mode: "fresh" }) as any, ctx())
    expect(res.status).toBe(400) // ValidationError mapeia para 400
    const json = await res.json()
    expect(json.error).toContain("briefing_not_confirmed")
  })

  it("retorna 400/422 quando nao ha briefing", async () => {
    mockBriefing = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest({ mode: "fresh" }) as any, ctx())
    expect(res.status).toBe(400)
  })
})

describe("POST /start-onboarding — 409 batch_in_progress", () => {
  it("retorna 409 quando ja ha batch em andamento e mode=fresh", async () => {
    mockEmails = [
      {
        id: "email-1",
        flow_id: MOCK_FLOW_ID,
        number: 1,
        name: "Welcome 1",
        status: "rendering",
        generation_batch_id: "active-batch-uuid",
      },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest({ mode: "fresh" }) as any, ctx())
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toContain("batch_in_progress")
  })
})
