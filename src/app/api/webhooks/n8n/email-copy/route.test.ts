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
  number?: number
  generation_batch_id?: string | null
  flow: { store_id: string; flow_type?: string } | null
}

let mockEmail: MockEmail | null = {
  id: MOCK_EMAIL_ID,
  flow_id: MOCK_FLOW_ID,
  status: "copy_generating",
  number: 1,
  generation_batch_id: null,
  flow: { store_id: MOCK_STORE_ID, flow_type: "welcome" },
}

const updateCalls: Array<{ table: string; data: Record<string, unknown> }> = []
const insertCalls: Array<{ table: string; data: Record<string, unknown> }> = []

function resetState() {
  mockEmail = {
    id: MOCK_EMAIL_ID,
    flow_id: MOCK_FLOW_ID,
    status: "copy_generating",
    number: 1,
    generation_batch_id: null,
    flow: { store_id: MOCK_STORE_ID, flow_type: "welcome" },
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

// Email "somente texto": flag consultada via blueprint-loader e, quando o
// email pertence a um batch, o callback fecha a contagem terminal.
const isTextOnlyEmailMock = vi.fn()
vi.mock("@/lib/agents/architect/blueprint-loader", () => ({
  isTextOnlyEmail: (...a: unknown[]) => isTextOnlyEmailMock(...a),
}))
const checkBatchTerminalMock = vi.fn()
vi.mock("@/lib/agents/phase2-runner.service", () => ({
  checkBatchTerminal: (...a: unknown[]) => checkBatchTerminalMock(...a),
}))

vi.stubEnv("N8N_WEBHOOK_SECRET", "test-secret")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  resetState()
  isTextOnlyEmailMock.mockReset().mockResolvedValue(false)
  checkBatchTerminalMock.mockReset().mockResolvedValue(undefined)
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

  it("zera artefatos de fase 2 anterior no UPDATE de email_flow_emails", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)

    const statusUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(statusUpdate).toBeDefined()
    // Chaves de limpeza adicionadas pra eliminar residuo pre-GATE 2
    expect(statusUpdate?.data.html).toBeNull()
    expect(statusUpdate?.data.qa_issues).toEqual([])
    expect(statusUpdate?.data.failure_reason).toBeNull()
    expect(statusUpdate?.data.rendering_started_at).toBeNull()
    expect(statusUpdate?.data.qa_started_at).toBeNull()
  })
})

describe("POST /api/webhooks/n8n/email-copy — email somente texto (text_only)", () => {
  it("marca status='ready' direto (com ready_at e html null), sem copy_ready", async () => {
    isTextOnlyEmailMock.mockResolvedValue(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)

    const readyUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "ready",
    )
    expect(readyUpdate).toBeDefined()
    expect(readyUpdate?.data.ready_at).toBeDefined()
    expect(readyUpdate?.data.copy_ready_at).toBeDefined()
    expect(readyUpdate?.data.html).toBeNull()
    expect(readyUpdate?.data.qa_issues).toEqual([])

    const copyReadyUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(copyReadyUpdate).toBeUndefined()
    // Flag consultada com flow_type + number do email
    expect(isTextOnlyEmailMock).toHaveBeenCalledWith(
      expect.anything(),
      "welcome",
      1,
    )
  })

  it("fecha o batch (checkBatchTerminal) quando o email text_only pertence a um batch", async () => {
    isTextOnlyEmailMock.mockResolvedValue(true)
    mockEmail = {
      id: MOCK_EMAIL_ID,
      flow_id: MOCK_FLOW_ID,
      status: "copy_generating",
      number: 1,
      generation_batch_id: "batch-1",
      flow: { store_id: MOCK_STORE_ID, flow_type: "welcome" },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    expect(checkBatchTerminalMock).toHaveBeenCalledWith(MOCK_STORE_ID, "batch-1")
  })

  it("sem batch, não chama checkBatchTerminal (fluxo natural da fila)", async () => {
    isTextOnlyEmailMock.mockResolvedValue(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    expect(checkBatchTerminalMock).not.toHaveBeenCalled()
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

  it("returns 200 idempotent when email is in rendering / qa_running / ready", async () => {
    for (const status of ["rendering", "qa_running", "ready"]) {
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

  it("NÃO é idempotente quando email está em failed — aceita a copy nova", async () => {
    resetState()
    mockEmail = {
      id: MOCK_EMAIL_ID,
      flow_id: MOCK_FLOW_ID,
      status: "failed",
      flow: { store_id: MOCK_STORE_ID },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    // processa (não retorna idempotent) e avança o status
    expect(json.idempotent).toBeUndefined()
    const statusUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(statusUpdate).toBeDefined()
  })
})

describe("POST /api/webhooks/n8n/email-copy — copy stale (dispatch_batch_id)", () => {
  const BATCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  const BATCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

  it("batch divergente do vigente: 200 no-op {stale:true}, nada é escrito", async () => {
    mockEmail!.generation_batch_id = BATCH_B
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody({ dispatch_batch_id: BATCH_A })) as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    const data = json.data ?? json
    expect(data.stale).toBe(true)
    expect(data.current_batch_id).toBe(BATCH_B)
    expect(updateCalls).toHaveLength(0)
  })

  it("batch igual ao vigente: copy aceita normalmente", async () => {
    mockEmail!.generation_batch_id = BATCH_A
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody({ dispatch_batch_id: BATCH_A })) as any)
    expect(res.status).toBe(200)
    const statusUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(statusUpdate).toBeDefined()
  })

  it("payload sem dispatch_batch_id (n8n legado): comportamento atual mantido", async () => {
    mockEmail!.generation_batch_id = BATCH_B
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    const statusUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(statusUpdate).toBeDefined()
  })

  it("email sem batch vigente: copy aceita mesmo com dispatch_batch_id no payload", async () => {
    mockEmail!.generation_batch_id = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody({ dispatch_batch_id: BATCH_A })) as any)
    expect(res.status).toBe(200)
    const statusUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(statusUpdate).toBeDefined()
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
