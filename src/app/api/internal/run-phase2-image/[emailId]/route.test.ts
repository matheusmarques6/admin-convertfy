/**
 * Tests for POST /api/internal/run-phase2-image/[emailId]
 *
 * Foco: o fallback in-process do elo image→html-qa. Quando o salto HTTP pro
 * run-phase2-html-qa nao acontece com sucesso (resp nao-ok ou fetch lanca), a
 * rota roda `runPhase2HtmlQa` no mesmo processo em vez de abandonar o email em
 * `image_done`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const MOCK_EMAIL_ID = "11111111-1111-1111-1111-111111111111"
const MOCK_STORE_ID = "22222222-2222-2222-2222-222222222222"

// Captura a promise passada ao after() pra o teste aguardar o trabalho de bg.
let afterTask: Promise<unknown> | null = null

const runPhase2ImageSpy = vi.fn(async () => ({ status: "image_done" }))
const runPhase2HtmlQaSpy = vi.fn(async () => ({ status: "ready" }))

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const self: any = {}
      ;["select", "eq", "in", "order", "limit"].forEach((m) => {
        self[m] = () => self
      })
      self.maybeSingle = () =>
        Promise.resolve({
          data: { id: MOCK_EMAIL_ID, flow: { store_id: MOCK_STORE_ID } },
          error: null,
        })
      self.single = self.maybeSingle
      return self
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

vi.mock("@/lib/cors", () => ({
  corsHeaders: () => ({}),
  handleCorsPreFlight: vi.fn(),
}))

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server")
  return {
    ...actual,
    after: (task: unknown) => {
      if (task && typeof (task as Promise<unknown>).then === "function") {
        afterTask = (task as Promise<unknown>).catch(() => {})
      }
    },
  }
})

vi.mock("@/lib/agents/phase2-runner.service", () => ({
  runPhase2Image: runPhase2ImageSpy,
  runPhase2HtmlQa: runPhase2HtmlQaSpy,
}))

vi.stubEnv("INTERNAL_SECRET", "internal-test-secret")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any, ctx: { params: Promise<{ emailId: string }> }) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  afterTask = null
  runPhase2ImageSpy.mockResolvedValue({ status: "image_done" })
  const mod = await import("./route")
  POST = mod.POST
})

function makeRequest(): Request {
  return new Request(
    `http://localhost/api/internal/run-phase2-image/${MOCK_EMAIL_ID}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": "internal-test-secret",
      },
      body: JSON.stringify({ storeId: MOCK_STORE_ID, triggeredBy: "test" }),
    },
  )
}

const ctx = () => ({ params: Promise.resolve({ emailId: MOCK_EMAIL_ID }) })

describe("POST run-phase2-image — fallback in-process do elo html-qa", () => {
  it("resp HTTP nao-ok → roda runPhase2HtmlQa in-process", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("err", { status: 500 })),
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(200)
    await afterTask
    expect(runPhase2HtmlQaSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: MOCK_STORE_ID,
        emailId: MOCK_EMAIL_ID,
      }),
    )
  })

  it("fetch lanca → roda runPhase2HtmlQa in-process", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down")
      }),
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(200)
    await afterTask
    expect(runPhase2HtmlQaSpy).toHaveBeenCalledTimes(1)
  })

  it("fetch ok → NÃO roda fallback (deixa o HTTP seguir)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(200)
    await afterTask
    expect(runPhase2HtmlQaSpy).not.toHaveBeenCalled()
  })

  it("imagem não conclui (status != image_done) → sem fetch e sem fallback", async () => {
    runPhase2ImageSpy.mockResolvedValue({ status: "skipped" })
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchSpy)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(200)
    await afterTask
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(runPhase2HtmlQaSpy).not.toHaveBeenCalled()
  })
})
