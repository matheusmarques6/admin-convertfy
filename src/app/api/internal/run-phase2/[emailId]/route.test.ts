/**
 * Tests for POST /api/internal/run-phase2/[emailId]
 *
 * Endpoint chamado pelo watchdog (AE-4) quando detecta email travado em
 * `copy_ready` sem fase 2 iniciada. Auth via HMAC `INTERNAL_SECRET` no
 * header `x-internal-secret`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const MOCK_EMAIL_ID = "11111111-1111-1111-1111-111111111111"
const MOCK_STORE_ID = "22222222-2222-2222-2222-222222222222"
const MOCK_FLOW_ID = "33333333-3333-3333-3333-333333333333"

// ── Mock state ─────────────────────────────────────────────────
let mockEmail: {
  id: string
  flow: { store_id: string } | { store_id: string }[] | null
} | null = null

function resetState() {
  mockEmail = {
    id: MOCK_EMAIL_ID,
    flow: { store_id: MOCK_STORE_ID },
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildQuery(table: string): any {
  const self: any = {}
  ;["select", "eq", "in", "order", "limit"].forEach((m) => {
    self[m] = () => self
  })
  self.maybeSingle = () => {
    if (table === "email_flow_emails") {
      return Promise.resolve({ data: mockEmail, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  }
  self.single = self.maybeSingle
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

// Mock after() — captura a promise mas nao bloqueia o response.
// Tambem mocka o phase2 runner pra nao executar imagem/html nos testes.
const phase2Spy = vi.fn(async () => undefined)
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server")
  return {
    ...actual,
    // Fire-and-forget no teste — fallback em route.ts (.catch) cobre rejeicoes.
    after: (task: unknown) => {
      if (task && typeof (task as Promise<unknown>).then === "function") {
        ;(task as Promise<unknown>).catch(() => {})
      }
    },
  }
})

vi.mock("@/lib/agents/phase2-runner.service", () => ({
  runPhase2InBackground: phase2Spy,
}))

vi.stubEnv("INTERNAL_SECRET", "internal-test-secret")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any, ctx: { params: Promise<{ emailId: string }> }) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  resetState()
  const mod = await import("./route")
  POST = mod.POST
})

function makeRequest(
  options: { secret?: string | null; emailId?: string } = {},
): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (options.secret !== null) {
    headers["x-internal-secret"] = options.secret ?? "internal-test-secret"
  }
  return new Request(
    `http://localhost/api/internal/run-phase2/${options.emailId ?? MOCK_EMAIL_ID}`,
    {
      method: "POST",
      headers,
      body: "",
    },
  )
}

function ctx(emailId: string = MOCK_EMAIL_ID) {
  return { params: Promise.resolve({ emailId }) }
}

// ──────────────────────────────────────────────────────────────
// Happy path
// ──────────────────────────────────────────────────────────────

describe("POST /api/internal/run-phase2/[emailId] — happy path", () => {
  it("retorna 200 e dispatcha runPhase2InBackground com storeId resolvido", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.accepted).toBe(true)
    expect(json.emailId).toBe(MOCK_EMAIL_ID)

    expect(phase2Spy).toHaveBeenCalledTimes(1)
    expect(phase2Spy).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: MOCK_STORE_ID,
        emailId: MOCK_EMAIL_ID,
        triggeredBy: "watchdog",
      }),
    )
  })

  it("aceita flow como array (formato alternativo do Supabase relationship)", async () => {
    mockEmail = {
      id: MOCK_EMAIL_ID,
      flow: [{ store_id: MOCK_STORE_ID }],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(200)
    expect(phase2Spy).toHaveBeenCalledTimes(1)
  })
})

// ──────────────────────────────────────────────────────────────
// 404 — email ou store inexistente
// ──────────────────────────────────────────────────────────────

describe("POST /api/internal/run-phase2/[emailId] — 404", () => {
  it("retorna 404 quando email nao existe + nao dispatcha fase 2", async () => {
    mockEmail = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(404)
    expect(phase2Spy).not.toHaveBeenCalled()
  })

  it("retorna 404 quando flow tem store_id null + nao dispatcha", async () => {
    mockEmail = {
      id: MOCK_EMAIL_ID,
      flow: null,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(404)
    expect(phase2Spy).not.toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────────────
// 401 — HMAC invalido ou missing
// ──────────────────────────────────────────────────────────────

describe("POST /api/internal/run-phase2/[emailId] — 401", () => {
  it("retorna 401 quando header x-internal-secret esta ausente", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest({ secret: null }) as any, ctx())
    expect(res.status).toBe(401)
    expect(phase2Spy).not.toHaveBeenCalled()
  })

  it("retorna 401 quando header x-internal-secret esta errado", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest({ secret: "wrong-secret" }) as any, ctx())
    expect(res.status).toBe(401)
    expect(phase2Spy).not.toHaveBeenCalled()
  })
})

// Confirma que MOCK_FLOW_ID nao colide com outras constantes (silencia lint
// caso valor nao seja usado em outro teste).
void MOCK_FLOW_ID
