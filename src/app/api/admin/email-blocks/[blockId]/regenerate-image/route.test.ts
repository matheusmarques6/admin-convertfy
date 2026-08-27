/**
 * Tests for POST /api/admin/email-blocks/[blockId]/regenerate-image
 *
 * AE-16 — Mockamos resolveBlockPrompt, generateEmailImage e o admin
 * Supabase. Cobre: sucesso (persiste image_url + last_prompt + telemetria),
 * rate limit (429-ish 409), bloco inexistente.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const MOCK_USER_ID = "user-uuid-1"
const MOCK_BLOCK_ID = "block-uuid-1"
const MOCK_STORE_ID = "store-uuid-1"
const MOCK_EMAIL_ID = "email-uuid-1"

const updateCalls: Array<{ table: string; data: Record<string, unknown> }> = []

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => ({ data: { user: { id: MOCK_USER_ID } }, error: null }) },
  }),
  createAdminClient: vi.fn(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (table: string): any => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const self: any = {
        update: (data: Record<string, unknown>) => {
          updateCalls.push({ table, data })
          return {
            eq: () => Promise.resolve({ data: null, error: null }),
          }
        },
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: "run-1" }, error: null }),
          }),
        }),
      }
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

const resolveBlockPromptMock = vi.fn()
vi.mock("@/lib/agents/image/resolve-block-prompt.service", () => ({
  resolveBlockPrompt: (...args: unknown[]) => resolveBlockPromptMock(...args),
}))

const generateEmailImageMock = vi.fn()
vi.mock("@/lib/agents/chains/image.chain", () => ({
  generateEmailImage: (...args: unknown[]) => generateEmailImageMock(...args),
  // A rota importa a constante para rotular o modelo na telemetria; sem ela
  // no mock, os 5 testes deste arquivo quebravam na importação.
  OPENROUTER_IMAGE_MODEL: "google/gemini-3.1-flash-image",
  DEFAULT_IMAGE_PROMPT_TEMPLATE: "prompt template",
  renderImagePrompt: (t: string) => t,
}))

const logGenerationRunMock = vi.fn().mockResolvedValue("run-1")
vi.mock("@/lib/agents/callbacks/telemetry.callback", () => ({
  logGenerationRun: (...args: unknown[]) => logGenerationRunMock(...args),
}))

function baseResolution(overrides: Record<string, unknown> = {}) {
  return {
    prompt: "Rendered master prompt\n\nAspect 4:5",
    vars: { MARCA: "Loja" },
    aspect: "4:5",
    mode: "product_ref",
    modeSource: "blueprint",
    customDims: { width: 1080, height: 1350 },
    systemPrompt: "Master Prompt v2 — Part A",
    model: "openai/gpt-5.4-image-2",
    storeId: MOCK_STORE_ID,
    emailId: MOCK_EMAIL_ID,
    flowId: "flow-1",
    topProductImageUrl: "https://supabase.test/p.jpg",
    overlayReserveBottom: true,
    blockType: "hero",
    blockLabel: "Hero block",
    blockContent: { image_url: "old.jpg", headline: "Welcome" },
    lastGeneratedAt: null,
    ...overrides,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any, ctx: { params: Promise<{ blockId: string }> }) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  updateCalls.length = 0
  const mod = await import("./route")
  POST = mod.POST
})

function makeRequest(): Request {
  return new Request(
    `http://localhost/api/admin/email-blocks/${MOCK_BLOCK_ID}/regenerate-image`,
    { method: "POST", headers: { "Content-Type": "application/json" } },
  )
}

function ctx() {
  return { params: Promise.resolve({ blockId: MOCK_BLOCK_ID }) }
}

describe("POST /regenerate-image", () => {
  it("happy path: gera, persiste image_url + last_prompt, loga telemetria", async () => {
    resolveBlockPromptMock.mockResolvedValueOnce(baseResolution())
    generateEmailImageMock.mockResolvedValueOnce("https://cdn.test/new-image.jpg")

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(200)
    const json = await res.json()
    const payload = json.data ?? json
    expect(payload.success).toBe(true)
    expect(payload.image_url).toBe("https://cdn.test/new-image.jpg")
    expect(payload.mode).toBe("product_ref")
    expect(payload.aspect).toBe("4:5")
    expect(payload.image_last_generated_at).toBeTruthy()

    // UPDATE em email_blocks foi feito com merge
    const update = updateCalls.find((c) => c.table === "email_blocks")
    expect(update).toBeDefined()
    const content = update!.data.content as Record<string, unknown>
    expect(content.image_url).toBe("https://cdn.test/new-image.jpg")
    expect(content.headline).toBe("Welcome") // preservou outros campos
    expect(content.image_last_generated_at).toBeTruthy()
    expect(content.image_last_prompt).toContain("Rendered master prompt")

    // Telemetria
    expect(logGenerationRunMock).toHaveBeenCalledTimes(1)
    const telemetryCall = logGenerationRunMock.mock.calls[0][0]
    expect(telemetryCall.agent).toBe("image")
    expect(telemetryCall.status).toBe("success")
    expect(telemetryCall.parsedOutput.trigger).toBe("manual_block_regen")
    expect(telemetryCall.parsedOutput.blockId).toBe(MOCK_BLOCK_ID)
  })

  it("rate limit: retorna 409 quando image_last_generated_at < 30s atras", async () => {
    const recentIso = new Date(Date.now() - 5_000).toISOString()
    resolveBlockPromptMock.mockResolvedValueOnce(
      baseResolution({ lastGeneratedAt: recentIso }),
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.code).toBe("rate_limited")
    expect(json.retry_after_seconds).toBeGreaterThanOrEqual(20)
    expect(json.retry_after_seconds).toBeLessThanOrEqual(30)

    // Nao deve chamar generateEmailImage nem persistir
    expect(generateEmailImageMock).not.toHaveBeenCalled()
    expect(updateCalls.length).toBe(0)
  })

  it("permite regen quando lastGeneratedAt > 30s atras", async () => {
    const oldIso = new Date(Date.now() - 60_000).toISOString()
    resolveBlockPromptMock.mockResolvedValueOnce(
      baseResolution({ lastGeneratedAt: oldIso }),
    )
    generateEmailImageMock.mockResolvedValueOnce("https://cdn.test/v2.jpg")

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(200)
    expect(generateEmailImageMock).toHaveBeenCalledTimes(1)
  })

  it("retorna 404 quando bloco nao existe", async () => {
    const { NotFoundError } = await import("@/lib/api/errors")
    resolveBlockPromptMock.mockRejectedValueOnce(new NotFoundError("Bloco"))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(404)
    expect(generateEmailImageMock).not.toHaveBeenCalled()
  })

  it("nao quebra resposta quando logGenerationRun falha", async () => {
    resolveBlockPromptMock.mockResolvedValueOnce(baseResolution())
    generateEmailImageMock.mockResolvedValueOnce("https://cdn.test/img.jpg")
    logGenerationRunMock.mockRejectedValueOnce(new Error("DB down"))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest() as any, ctx())
    expect(res.status).toBe(200)
  })
  // Paridade com o pipeline: por muito tempo esta rota chamava o modelo sem
  // system prompt, sem o modelo da config e sem as dims do schema — a imagem
  // regerada à mão não era a que o pipeline geraria.
  it("repassa systemPrompt, model e customDims ao gerador", async () => {
    resolveBlockPromptMock.mockResolvedValueOnce(baseResolution())
    generateEmailImageMock.mockResolvedValueOnce("https://cdn.test/i.jpg")

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await POST(makeRequest() as any, ctx())

    const opts = generateEmailImageMock.mock.calls[0][2]
    expect(opts.systemPrompt).toBe("Master Prompt v2 — Part A")
    expect(opts.model).toBe("openai/gpt-5.4-image-2")
    expect(opts.customDims).toEqual({ width: 1080, height: 1350 })
    expect(opts.referenceImageUrl).toBe("https://supabase.test/p.jpg")
  })

  it("telemetria rotula o modelo da config, não a constante", async () => {
    resolveBlockPromptMock.mockResolvedValueOnce(baseResolution())
    generateEmailImageMock.mockResolvedValueOnce("https://cdn.test/i.jpg")

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await POST(makeRequest() as any, ctx())

    expect(logGenerationRunMock.mock.calls[0][0].model).toBe(
      "openai/gpt-5.4-image-2",
    )
  })

  it("sem modelo na config cai no default do OpenRouter", async () => {
    resolveBlockPromptMock.mockResolvedValueOnce(baseResolution({ model: null }))
    generateEmailImageMock.mockResolvedValueOnce("https://cdn.test/i.jpg")

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await POST(makeRequest() as any, ctx())

    expect(generateEmailImageMock.mock.calls[0][2].model).toBeUndefined()
    expect(logGenerationRunMock.mock.calls[0][0].model).toBe(
      "google/gemini-3.1-flash-image",
    )
  })

  it("a Entrada da telemetria diz POR QUE o modo caiu para text2img", async () => {
    resolveBlockPromptMock.mockResolvedValueOnce(
      baseResolution({
        mode: "text2img",
        modeSource: "fallback_text2img_unreachable",
      }),
    )
    generateEmailImageMock.mockResolvedValueOnce("https://cdn.test/i.jpg")

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await POST(makeRequest() as any, ctx())

    const modo = logGenerationRunMock.mock.calls[0][0].inputSummary.find(
      (i: { rotulo: string }) => i.rotulo === "Modo",
    )
    expect(modo.valor).toContain("a foto do produto não abriu")
  })
})
