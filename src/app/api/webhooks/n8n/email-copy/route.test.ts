/**
 * Tests for POST /api/webhooks/n8n/email-copy (Story AE-3 + AE-19)
 *
 * AE-19 split: callback NAO dispara mais fase 2. Apenas persiste copy
 * e marca status='copy_ready'. A fase 2 fica em hold ate o trigger
 * fn_on_brand_identity_confirmed enfileirar um sinal `render` que o
 * watchdog consome.
 *
 * Cobre:
 *  - webhook normal -> 200 + status copy_ready (SEM dispatch de fase 2)
 *  - callback duplicado (email ja em copy_ready) -> 200 idempotente
 *  - email_id inexistente -> 404
 *  - email_id que nao pertence a store_id -> 404
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const MOCK_STORE_ID = "11111111-1111-4111-8111-111111111111"
const MOCK_EMAIL_ID = "22222222-2222-4222-8222-222222222222"
const MOCK_BLOCK_ID = "33333333-3333-4333-8333-333333333333"
const MOCK_FLOW_ID = "44444444-4444-4444-8444-444444444444"

interface MockEmail {
  id: string
  flow_id: string
  status: string | null
  flow: { store_id: string } | null
}

let mockEmail: MockEmail | null = {
  id: MOCK_EMAIL_ID,
  flow_id: MOCK_FLOW_ID,
  status: "copy_generating",
  flow: { store_id: MOCK_STORE_ID },
}

const updateCalls: Array<{ table: string; data: Record<string, unknown> }> = []
const insertCalls: Array<{ table: string; data: Record<string, unknown> }> = []

function resetState() {
  mockEmail = {
    id: MOCK_EMAIL_ID,
    flow_id: MOCK_FLOW_ID,
    status: "copy_generating",
    flow: { store_id: MOCK_STORE_ID },
  }
  updateCalls.length = 0
  insertCalls.length = 0
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildQuery(table: string): any {
  const self: any = {}
  ;["select", "eq", "in", "order", "limit", "not", "neq"].forEach((m) => {
    self[m] = () => self
  })
  self.maybeSingle = () => {
    if (table === "email_flow_emails") {
      return Promise.resolve({ data: mockEmail, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  }
  self.single = self.maybeSingle
  self.then = (resolve: (v: { data: unknown; error: null }) => void) => {
    resolve({ data: [], error: null })
  }
  self.update = (data: Record<string, unknown>) => {
    updateCalls.push({ table, data })
    const updateChain: any = {
      eq: () => updateChain,
      in: () => updateChain,
      not: () => updateChain,
      select: () => ({
        then: (resolve: (v: { data: unknown; error: null }) => void) =>
          resolve({ data: [], error: null }),
      }),
      then: (resolve: (v: { data: null; error: null }) => void) =>
        resolve({ data: null, error: null }),
    }
    return updateChain
  }
  self.insert = (data: Record<string, unknown>) => {
    insertCalls.push({ table, data })
    return {
      select: () => ({
        single: () => Promise.resolve({ data: { id: "run-id" }, error: null }),
      }),
      then: (resolve: (v: { data: null; error: null }) => void) =>
        resolve({ data: null, error: null }),
    }
  }
  return self
}
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => buildQuery(table),
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

// AE-19: o callback nao importa mais `runPhase2InBackground` nem `after`
// de next/server. Nao precisa mockar nenhum dos dois — se a route voltar
// a chamar runPhase2InBackground, o teste vai falhar no import resolver
// porque o mock foi removido.

vi.stubEnv("N8N_WEBHOOK_SECRET", "test-secret")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  resetState()
  const mod = await import("./route")
  POST = mod.POST
})

function makeRequest(body: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/webhooks/n8n/email-copy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": "test-secret",
    },
    body: JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    store_id: MOCK_STORE_ID,
    email_id: MOCK_EMAIL_ID,
    subject: "Bem-vindo!",
    preheader: "Sua jornada comeca aqui",
    blocks: [
      {
        block_id: MOCK_BLOCK_ID,
        content: { headline: "Olá", body: "Texto" },
      },
    ],
    meta: { model: "gpt-4o", tokens_input: 100, tokens_output: 500 },
    ...overrides,
  }
}

describe("POST /api/webhooks/n8n/email-copy — happy path", () => {
  it("returns 200, marks copy_ready, persists copy_ready_at (AE-19: no phase 2 dispatch)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.email_id).toBe(MOCK_EMAIL_ID)

    const statusUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(statusUpdate).toBeDefined()
    expect(statusUpdate?.data.copy_ready_at).toBeDefined()

    // Telemetria de copy registrada
    const copyRun = insertCalls.find(
      (c) => c.table === "email_generation_runs" && c.data.agent === "copy",
    )
    expect(copyRun).toBeDefined()
  })

  it("clears phase-2 artifacts (html, qa_issues, failure_reason, timers) on copy_ready update", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)

    const statusUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(statusUpdate).toBeDefined()
    expect(statusUpdate?.data.html).toBeNull()
    expect(statusUpdate?.data.qa_issues).toEqual([])
    expect(statusUpdate?.data.failure_reason).toBeNull()
    expect(statusUpdate?.data.rendering_started_at).toBeNull()
    expect(statusUpdate?.data.qa_started_at).toBeNull()
  })
})

describe("POST /api/webhooks/n8n/email-copy — idempotency", () => {
  it("returns 200 idempotent when email is already in copy_ready", async () => {
    mockEmail = {
      id: MOCK_EMAIL_ID,
      flow_id: MOCK_FLOW_ID,
      status: "copy_ready",
      flow: { store_id: MOCK_STORE_ID },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.idempotent).toBe(true)
    expect(json.current_status).toBe("copy_ready")

    // Nenhum update de status (idempotente)
    const statusUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(statusUpdate).toBeUndefined()
  })

  it("returns 200 idempotent when email is in rendering / qa_running / ready / failed", async () => {
    for (const status of ["rendering", "qa_running", "ready", "failed"]) {
      resetState()
      mockEmail = {
        id: MOCK_EMAIL_ID,
        flow_id: MOCK_FLOW_ID,
        status,
        flow: { store_id: MOCK_STORE_ID },
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await POST(makeRequest(validBody()) as any)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.idempotent).toBe(true)
      expect(json.current_status).toBe(status)
    }
  })
})

describe("POST /api/webhooks/n8n/email-copy — errors", () => {
  it("returns 404 when email_id is unknown", async () => {
    mockEmail = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(404)
  })

  it("returns 404 when store_id does not match email's flow.store_id", async () => {
    mockEmail = {
      id: MOCK_EMAIL_ID,
      flow_id: MOCK_FLOW_ID,
      status: "copy_generating",
      flow: { store_id: "55555555-5555-4555-8555-555555555555" },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(404)
  })

  it("returns 401 when missing webhook secret", async () => {
    const req = new Request("http://localhost/api/webhooks/n8n/email-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)
    expect(res.status).toBe(401)
  })
})
