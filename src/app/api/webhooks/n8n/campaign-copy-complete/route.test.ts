/**
 * Tests for POST /api/webhooks/n8n/campaign-copy-complete
 *
 * Sinal de conclusão da geração de copy de PRODUÇÃO. O n8n chama UMA vez ao
 * terminar o lote; o efeito é avançar o card Copy → Design (prod_stage=1 em
 * todas as lojas) e garantir as tasks de design ("estrutura").
 *
 * Cobre:
 *  - sem webhook secret          -> 401
 *  - payload inválido            -> 400
 *  - mode:"test"                 -> 200 no-op (não move o board)
 *  - sugestão inexistente        -> 200 no-op
 *  - sugestão não aprovada       -> 200 no-op
 *  - sucesso                     -> 200 + prod_stage=1 em todas as lojas + instantiate chamado
 *  - idempotência                -> lojas já em prod_stage>=1 não são tocadas
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const MOCK_JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const MOCK_SUGGESTION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const MOCK_ORG_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const MOCK_ITEM_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
const STORE_A = "11111111-1111-4111-8111-111111111111"
const STORE_B = "22222222-2222-4222-8222-222222222222"

interface MockSuggestion {
  id: string
  org_id: string
  status: string
  pipeline_item_id: string | null
  design_pilot_store_id: string | null
  targets: Array<{ store_id: string }> | null
}

interface MockItem {
  target_stores: Array<{ store_id: string; prod_stage?: number }> | null
}

let mockSuggestion: MockSuggestion | null = null
let mockItem: MockItem | null = null

const instantiateMock = vi.fn<
  (params: Record<string, unknown>) => Promise<{ taskIds: string[]; columnId: string }>
>(async () => ({ taskIds: ["t1"], columnId: "col-1" }))
const updateProductionStoreMock = vi.fn<(params: Record<string, unknown>) => Promise<unknown>>(
  async () => ({}),
)

function resetState() {
  mockSuggestion = {
    id: MOCK_SUGGESTION_ID,
    org_id: MOCK_ORG_ID,
    status: "approved",
    pipeline_item_id: MOCK_ITEM_ID,
    design_pilot_store_id: null,
    targets: [{ store_id: STORE_A }, { store_id: STORE_B }],
  }
  mockItem = {
    target_stores: [
      { store_id: STORE_A, prod_stage: 0 },
      { store_id: STORE_B, prod_stage: 0 },
    ],
  }
  instantiateMock.mockClear()
  updateProductionStoreMock.mockClear()
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildQuery(table: string): any {
  const self: any = {}
  ;["select", "eq"].forEach((m) => {
    self[m] = () => self
  })
  self.maybeSingle = () => {
    if (table === "campaign_suggestions")
      return Promise.resolve({ data: mockSuggestion, error: null })
    if (table === "campaign_pipeline_items")
      return Promise.resolve({ data: mockItem, error: null })
    return Promise.resolve({ data: null, error: null })
  }
  return self
}
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => buildQuery(table),
  })),
}))

vi.mock("@/lib/services/campaign-central/campaign-design-instantiate.service", () => ({
  instantiateCampaignStage: (params: Record<string, unknown>) => instantiateMock(params),
}))

vi.mock("@/lib/services/campaign-central/production.service", () => ({
  updateProductionStore: (params: Record<string, unknown>) => updateProductionStoreMock(params),
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

vi.stubEnv("N8N_WEBHOOK_SECRET", "test-secret")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  resetState()
  const mod = await import("./route")
  POST = mod.POST
})

function makeRequest(body: Record<string, unknown>, withSecret = true): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (withSecret) headers["x-webhook-secret"] = "test-secret"
  return new Request("http://localhost/api/webhooks/n8n/campaign-copy-complete", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    job_id: MOCK_JOB_ID,
    suggestion_id: MOCK_SUGGESTION_ID,
    org_id: MOCK_ORG_ID,
    mode: "production",
    ...overrides,
  }
}

describe("POST /api/webhooks/n8n/campaign-copy-complete — auth & validação", () => {
  it("retorna 401 sem webhook secret", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody(), false) as any)
    expect(res.status).toBe(401)
    expect(updateProductionStoreMock).not.toHaveBeenCalled()
    expect(instantiateMock).not.toHaveBeenCalled()
  })

  it("retorna 400 quando o payload é inválido (sem org_id)", async () => {
    const body = validBody()
    delete (body as Record<string, unknown>).org_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(body) as any)
    expect(res.status).toBe(400)
    expect(updateProductionStoreMock).not.toHaveBeenCalled()
  })
})

describe("POST /api/webhooks/n8n/campaign-copy-complete — no-ops", () => {
  it("mode:'test' é no-op (não move o board)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody({ mode: "test" })) as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ignored).toBe(true)
    expect(json.reason).toBe("mode_not_production")
    expect(updateProductionStoreMock).not.toHaveBeenCalled()
    expect(instantiateMock).not.toHaveBeenCalled()
  })

  it("sugestão inexistente é no-op", async () => {
    mockSuggestion = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ignored).toBe(true)
    expect(json.reason).toBe("suggestion_not_found")
    expect(updateProductionStoreMock).not.toHaveBeenCalled()
  })

  it("sugestão não aprovada é no-op", async () => {
    mockSuggestion!.status = "pending"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ignored).toBe(true)
    expect(json.reason).toBe("not_approved_or_no_pipeline")
    expect(updateProductionStoreMock).not.toHaveBeenCalled()
  })

  it("sugestão aprovada sem pipeline_item_id é no-op", async () => {
    mockSuggestion!.pipeline_item_id = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ignored).toBe(true)
    expect(updateProductionStoreMock).not.toHaveBeenCalled()
  })
})

describe("POST /api/webhooks/n8n/campaign-copy-complete — avanço Copy → Design", () => {
  it("sucesso: avança todas as lojas para prod_stage=1 e garante as tasks de design", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.stores_moved).toBe(2)

    // tasks de design garantidas (idempotente) — etapa "estrutura"
    expect(instantiateMock).toHaveBeenCalledTimes(1)
    const instArgs = instantiateMock.mock.calls[0][0]
    expect(instArgs.stageSlug).toBe("estrutura")
    expect(instArgs.suggestionId).toBe(MOCK_SUGGESTION_ID)
    expect(instArgs.orgId).toBe(MOCK_ORG_ID)
    // pilot = design_pilot_store_id ?? targets[0]
    expect(instArgs.pilotStoreId).toBe(STORE_A)

    // board avançado: uma chamada por loja, prodStage=1
    expect(updateProductionStoreMock).toHaveBeenCalledTimes(2)
    const moved = updateProductionStoreMock.mock.calls.map((c) => c[0])
    expect(moved.every((m) => m.prodStage === 1)).toBe(true)
    expect(moved.every((m) => m.itemId === MOCK_ITEM_ID)).toBe(true)
    expect(new Set(moved.map((m) => m.storeId))).toEqual(new Set([STORE_A, STORE_B]))
  })

  it("usa design_pilot_store_id como piloto quando definido", async () => {
    mockSuggestion!.design_pilot_store_id = STORE_B
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await POST(makeRequest(validBody()) as any)
    const instArgs = instantiateMock.mock.calls[0][0]
    expect(instArgs.pilotStoreId).toBe(STORE_B)
  })

  it("idempotência: lojas já em prod_stage>=1 não são movidas de novo", async () => {
    mockItem!.target_stores = [
      { store_id: STORE_A, prod_stage: 1 },
      { store_id: STORE_B, prod_stage: 3 },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.stores_moved).toBe(0)
    expect(updateProductionStoreMock).not.toHaveBeenCalled()
    // mas as tasks de design continuam sendo garantidas (idempotente)
    expect(instantiateMock).toHaveBeenCalledTimes(1)
  })

  it("move apenas as lojas pendentes (mistura prod_stage=0 e >=1)", async () => {
    mockItem!.target_stores = [
      { store_id: STORE_A, prod_stage: 0 },
      { store_id: STORE_B, prod_stage: 2 },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    const json = await res.json()
    expect(json.stores_moved).toBe(1)
    expect(updateProductionStoreMock).toHaveBeenCalledTimes(1)
    const arg = updateProductionStoreMock.mock.calls[0][0]
    expect(arg.storeId).toBe(STORE_A)
    expect(arg.prodStage).toBe(1)
  })

  it("falha ao instanciar as tasks NÃO bloqueia o avanço do board", async () => {
    instantiateMock.mockRejectedValueOnce(new Error("boom"))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.stores_moved).toBe(2)
    expect(updateProductionStoreMock).toHaveBeenCalledTimes(2)
  })
})
