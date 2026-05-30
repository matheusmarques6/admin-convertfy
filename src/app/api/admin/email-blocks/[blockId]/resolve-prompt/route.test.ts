/**
 * Tests for POST /api/admin/email-blocks/[blockId]/resolve-prompt
 *
 * AE-16 — Endpoint NAO chama OpenRouter; so renderiza o prompt mestre
 * com vars substituidas. Mockamos o helper resolveBlockPrompt diretamente
 * pra isolar a logica do endpoint (auth + shape de resposta).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const MOCK_USER_ID = "user-uuid-1"
const MOCK_BLOCK_ID = "block-uuid-1"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => ({ data: { user: { id: MOCK_USER_ID } }, error: null }) },
  }),
  createAdminClient: vi.fn(() => ({})),
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

const resolveBlockPromptMock = vi.fn()
vi.mock("@/lib/agents/image/resolve-block-prompt.service", () => ({
  resolveBlockPrompt: (...args: unknown[]) => resolveBlockPromptMock(...args),
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any, ctx: { params: Promise<{ blockId: string }> }) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  const mod = await import("./route")
  POST = mod.POST
})

function makeRequest(): Request {
  return new Request(
    `http://localhost/api/admin/email-blocks/${MOCK_BLOCK_ID}/resolve-prompt`,
    { method: "POST", headers: { "Content-Type": "application/json" } },
  )
}

function ctx() {
  return { params: Promise.resolve({ blockId: MOCK_BLOCK_ID }) }
}

describe("POST /resolve-prompt", () => {
  it("retorna 200 com prompt + metadata quando bloco existe", async () => {
    resolveBlockPromptMock.mockResolvedValueOnce({
      prompt: "Master prompt rendered with vars…\n\nAspect 4:5 (vertical).",
      vars: { MARCA: "Loja X", NICHO: "moda", INSTRUCAO_ADICIONAL: "couro vermelho" },
      aspect: "4:5",
      mode: "product_ref",
      storeId: "store-1",
      emailId: "email-1",
      flowId: "flow-1",
      topProductImageUrl: "https://supabase.test/img.jpg",
      overlayReserveBottom: true,
      blockType: "hero",
      blockLabel: "Hero",
      blockContent: {},
      lastGeneratedAt: null,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(200)
    const json = await res.json()
    // successResponse envolve em { success, data }
    const payload = json.data ?? json
    expect(payload.prompt).toContain("Master prompt")
    expect(payload.mode).toBe("product_ref")
    expect(payload.aspect).toBe("4:5")
    expect(payload.has_reference).toBe(true)
    expect(payload.vars_used.MARCA).toBe("Loja X")
    expect(payload.vars_used.INSTRUCAO_ADICIONAL).toBe("couro vermelho")
  })

  it("retorna 404 quando bloco nao existe", async () => {
    const { NotFoundError } = await import("@/lib/api/errors")
    resolveBlockPromptMock.mockRejectedValueOnce(new NotFoundError("Bloco"))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(404)
  })

  it("has_reference=false quando topProductImageUrl ausente", async () => {
    resolveBlockPromptMock.mockResolvedValueOnce({
      prompt: "rendered",
      vars: { MARCA: "X" },
      aspect: "1:1",
      mode: "text2img",
      storeId: "store-1",
      emailId: "email-1",
      flowId: "flow-1",
      topProductImageUrl: null,
      overlayReserveBottom: false,
      blockType: "image",
      blockLabel: "Img",
      blockContent: {},
      lastGeneratedAt: null,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(200)
    const json = await res.json()
    const payload = json.data ?? json
    expect(payload.has_reference).toBe(false)
    expect(payload.mode).toBe("text2img")
  })
})
