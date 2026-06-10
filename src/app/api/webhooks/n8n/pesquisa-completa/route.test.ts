/**
 * Tests for POST /api/webhooks/n8n/pesquisa-completa
 *
 * Cobre o campo `regeneration` (echo do briefing webhook):
 *  - regeneration:true  -> NAO chama dispatchEmailCopyWebhook (pula copy)
 *  - regeneration ausente -> chama dispatchEmailCopyWebhook (comportamento normal)
 *  - regeneration:false -> chama dispatchEmailCopyWebhook
 *
 * O dispatch roda dentro de after() do next/server — aqui mockamos after
 * para executar o callback sincronamente e poder assertar a chamada.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const MOCK_STORE_ID = "11111111-1111-4111-8111-111111111111"

let storeExists = true

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildQuery(): any {
  const self: any = {}
  ;["select", "eq"].forEach((m) => {
    self[m] = () => self
  })
  self.single = () =>
    Promise.resolve(
      storeExists
        ? { data: { id: MOCK_STORE_ID }, error: null }
        : { data: null, error: { message: "not found" } },
    )
  return self
}
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => buildQuery(),
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

vi.mock("@/lib/api/n8n-auth", () => ({
  requireWebhookSecret: vi.fn(),
}))

const dispatchEmailCopyWebhook = vi.fn(async () => ({
  ok: true,
  reason: null,
  email_count: 3,
}))

vi.mock("@/lib/services/email-copy-webhook.service", () => ({
  dispatchEmailCopyWebhook: (...args: unknown[]) =>
    dispatchEmailCopyWebhook(...(args as [])),
}))

// after() roda o callback sincronamente para podermos assertar o dispatch.
const afterCallbacks: Array<() => unknown | Promise<unknown>> = []
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>()
  return {
    ...actual,
    after: (cb: () => unknown | Promise<unknown>) => {
      afterCallbacks.push(cb)
    },
  }
})

async function flushAfter() {
  for (const cb of afterCallbacks) {
    await cb()
  }
  afterCallbacks.length = 0
}

vi.stubEnv("N8N_WEBHOOK_SECRET", "test-secret")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  storeExists = true
  afterCallbacks.length = 0
  const mod = await import("./route")
  POST = mod.POST
})

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/webhooks/n8n/pesquisa-completa", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": "test-secret",
    },
    body: JSON.stringify(body),
  })
}

describe("POST /api/webhooks/n8n/pesquisa-completa — regeneration", () => {
  it("regeneration:true -> 200 mas NAO dispara copy", async () => {
    const res = await POST(
      makeRequest({ store_id: MOCK_STORE_ID, regeneration: true }),
    )
    expect(res.status).toBe(200)
    await flushAfter()
    expect(dispatchEmailCopyWebhook).not.toHaveBeenCalled()
  })

  it("regeneration ausente -> 200 e dispara copy", async () => {
    const res = await POST(makeRequest({ store_id: MOCK_STORE_ID }))
    expect(res.status).toBe(200)
    await flushAfter()
    expect(dispatchEmailCopyWebhook).toHaveBeenCalledTimes(1)
    expect(dispatchEmailCopyWebhook).toHaveBeenCalledWith(
      MOCK_STORE_ID,
      expect.objectContaining({ triggerSource: "pesquisa_completa" }),
    )
  })

  it("regeneration:false -> 200 e dispara copy", async () => {
    const res = await POST(
      makeRequest({ store_id: MOCK_STORE_ID, regeneration: false }),
    )
    expect(res.status).toBe(200)
    await flushAfter()
    expect(dispatchEmailCopyWebhook).toHaveBeenCalledTimes(1)
  })
})
