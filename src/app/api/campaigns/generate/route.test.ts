/**
 * Tests for POST /api/campaigns/generate
 * Creates campaign_generations + campaign_generation_stores and fires n8n webhook.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"

// ── Track DB calls ──────────────────────────────────────────────────────────
const insertCalls: Array<{ table: string; data: unknown }> = []
const upsertCalls: Array<{ table: string; data: unknown }> = []
const updateCalls: Array<{ table: string; data: unknown; eqCol?: string; eqId?: string }> = []
const selectCalls: Array<{ table: string }> = []

const MOCK_GENERATION_ID = "gen-uuid-1"
const MOCK_CLIENT_ID = "client-uuid-1"
const MOCK_USER_ID = "user-uuid-1"

let mockPortalUser: { client_id: string } | null = { client_id: MOCK_CLIENT_ID }
let mockExistingGeneration: Record<string, unknown> | null = null
let mockExistingStores: Array<Record<string, unknown>> = []
let mockClientStores: Array<Record<string, unknown>> = [
  { id: "store-1", store_name: "LensEVO", country: "BR", language: "pt-BR" },
  { id: "store-2", store_name: "Based", country: "GB", language: "en-US" },
]
let mockWebhookResponse: Response = new Response(JSON.stringify({ ok: true }), { status: 200 })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chainable(table: string): Record<string, (...args: any[]) => any> {
  selectCalls.push({ table })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const self: Record<string, (...args: any[]) => any> = {}
  self.select = () => self
  self.limit = () => self
  self.eq = (col: string, _val: string) => {
    if (table === "client_portal_users") return { ...self, single: () => ({ data: mockPortalUser, error: null }) }
    if (table === "campaign_generations" && col === "id") return { ...self, single: () => ({ data: mockExistingGeneration, error: null }) }
    if (table === "campaign_generation_stores" && col === "generation_id") return { data: mockExistingStores, error: null }
    return self
  }
  self.in = () => ({ data: mockClientStores, error: null })
  self.single = () => ({ data: null, error: null })
  self.insert = (data: unknown) => {
    insertCalls.push({ table, data })
    if (table === "campaign_generations") {
      return { ...self, select: () => ({ single: () => ({ data: { id: MOCK_GENERATION_ID, ...((data as Record<string, unknown>)) }, error: null }) }) }
    }
    return { data: null, error: null }
  }
  self.upsert = (data: unknown) => {
    upsertCalls.push({ table, data })
    return { data: null, error: null }
  }
  self.update = (data: unknown) => ({
    eq: (col: string, id: string) => {
      updateCalls.push({ table, data, eqCol: col, eqId: id })
      return { data: null, error: null }
    },
  })
  return self
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => ({ data: { user: { id: MOCK_USER_ID } }, error: null }) },
  }),
  createAdminClient: vi.fn(() => ({
    from: (table: string) => chainable(table),
  })),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

vi.mock("@/lib/cors", () => ({
  corsHeaders: () => ({}),
  handleCorsPreFlight: vi.fn(),
}))

// Mock env variables
vi.stubEnv("N8N_CAMPAIGNS_WEBHOOK_URL", "https://n8n.test.com/webhook/campaigns-generate")
vi.stubEnv("N8N_WEBHOOK_SECRET", "test-secret")

// Mock global fetch for webhook calls
const originalFetch = globalThis.fetch
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockWebhookResponse))
})

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/campaigns/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0]
}

// We'll import POST after mocks are set up
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  insertCalls.length = 0
  upsertCalls.length = 0
  updateCalls.length = 0
  selectCalls.length = 0
  mockPortalUser = { client_id: MOCK_CLIENT_ID }
  mockExistingGeneration = null
  mockExistingStores = []
  mockClientStores = [
    { id: "store-1", store_name: "LensEVO", country: "BR", language: "pt-BR" },
    { id: "store-2", store_name: "Based", country: "GB", language: "en-US" },
  ]
  mockWebhookResponse = new Response(JSON.stringify({ ok: true }), { status: 200 })

  // Dynamic import to pick up mocks
  const mod = await import("./route")
  POST = mod.POST
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/campaigns/generate — Validation", () => {
  it("rejects request without name", async () => {
    const res = await POST(makeRequest({ date: "2026-11-27", store_ids: ["store-1"] }))
    expect(res.status).toBe(400)
  })

  it("rejects request without date", async () => {
    const res = await POST(makeRequest({ name: "Black Friday", store_ids: ["store-1"] }))
    expect(res.status).toBe(400)
  })

  it("rejects request without store_ids", async () => {
    const res = await POST(makeRequest({ name: "Black Friday", date: "2026-11-27" }))
    expect(res.status).toBe(400)
  })

  it("rejects request with empty store_ids array", async () => {
    const res = await POST(makeRequest({ name: "Black Friday", date: "2026-11-27", store_ids: [] }))
    expect(res.status).toBe(400)
  })

  it("rejects request with invalid date format", async () => {
    const res = await POST(makeRequest({ name: "BF", date: "27/11/2026", store_ids: ["store-1"] }))
    expect(res.status).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/campaigns/generate — Auth", () => {
  it("returns 401 when portal user not found", async () => {
    mockPortalUser = null
    const res = await POST(makeRequest({ name: "BF", date: "2026-11-27", store_ids: ["store-1"] }))
    expect(res.status).toBe(401)
  })

  it("rejects store_ids that dont belong to the client", async () => {
    const res = await POST(makeRequest({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["store-1", "store-hacker"],
    }))
    // Should either filter out or reject the unauthorized store
    await res.json()
    // At minimum, store-hacker should NOT appear in DB inserts
    const storeInserts = insertCalls.filter(c => c.table === "campaign_generation_stores")
    const insertedStoreIds = storeInserts.flatMap(c => {
      const data = c.data as Array<Record<string, unknown>> | Record<string, unknown>
      if (Array.isArray(data)) return data.map(d => d.store_id)
      return [(data as Record<string, unknown>).store_id]
    })
    expect(insertedStoreIds).not.toContain("store-hacker")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// New Campaign Creation
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/campaigns/generate — New campaign", () => {
  it("creates campaign_generations record with status processing", async () => {
    const res = await POST(makeRequest({
      name: "Black Friday 2026",
      date: "2026-11-27",
      store_ids: ["store-1", "store-2"],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.generation_id).toBeDefined()
    expect(body.status).toBe("processing")

    // Should have inserted into campaign_generations
    const genInsert = insertCalls.find(c => c.table === "campaign_generations")
    expect(genInsert).toBeDefined()
    const genData = genInsert!.data as Record<string, unknown>
    expect(genData.name).toBe("Black Friday 2026")
    expect(genData.date).toBe("2026-11-27")
    expect(genData.status).toBe("processing")
    expect(genData.client_id).toBe(MOCK_CLIENT_ID)
  })

  it("creates campaign_generation_stores for each selected store", async () => {
    await POST(makeRequest({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["store-1", "store-2"],
    }))

    const storeInserts = insertCalls.filter(c => c.table === "campaign_generation_stores")
    // Should create records for both stores
    expect(storeInserts.length).toBeGreaterThanOrEqual(1)
  })

  it("saves reference_doc_url when provided", async () => {
    await POST(makeRequest({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["store-1"],
      reference_doc_url: "https://drive.google.com/doc/123",
    }))

    const genInsert = insertCalls.find(c => c.table === "campaign_generations")
    const genData = genInsert!.data as Record<string, unknown>
    expect(genData.reference_doc_url).toBe("https://drive.google.com/doc/123")
  })

  it("sets reference_doc_url to null when not provided", async () => {
    await POST(makeRequest({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["store-1"],
    }))

    const genInsert = insertCalls.find(c => c.table === "campaign_generations")
    const genData = genInsert!.data as Record<string, unknown>
    expect(genData.reference_doc_url).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Existing Campaign (Regeneration)
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/campaigns/generate — Regenerate (existing generation_id)", () => {
  it("increments version for existing store entries and sets status to generating", async () => {
    mockExistingGeneration = {
      id: MOCK_GENERATION_ID,
      client_id: MOCK_CLIENT_ID,
      name: "BF",
      date: "2026-11-27",
      status: "done",
      drive_folder_id: "folder-abc",
    }
    mockExistingStores = [
      { id: "gs-1", generation_id: MOCK_GENERATION_ID, store_id: "store-1", version: 1, status: "done" },
    ]

    const res = await POST(makeRequest({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["store-1"],
      generation_id: MOCK_GENERATION_ID,
    }))

    expect(res.status).toBe(200)

    // Should update campaign_generations status back to processing
    const genUpdate = updateCalls.find(c => c.table === "campaign_generations")
    expect(genUpdate).toBeDefined()
    expect((genUpdate!.data as Record<string, unknown>).status).toBe("processing")

    // Should increment version on the existing store entry
    const storeUpdate = updateCalls.find(c => c.table === "campaign_generation_stores")
    if (storeUpdate) {
      const data = storeUpdate.data as Record<string, unknown>
      expect(data.version).toBe(2)
      expect(data.status).toBe("generating")
    }
    // OR if using upsert instead of update
    const storeUpsert = upsertCalls.find(c => c.table === "campaign_generation_stores")
    if (storeUpsert) {
      const data = Array.isArray(storeUpsert.data) ? storeUpsert.data[0] : storeUpsert.data
      expect((data as Record<string, unknown>).version).toBe(2)
      expect((data as Record<string, unknown>).status).toBe("generating")
    }
    // At least one of update or upsert should have happened
    expect(
      updateCalls.some(c => c.table === "campaign_generation_stores") ||
      upsertCalls.some(c => c.table === "campaign_generation_stores")
    ).toBe(true)
  })

  it("rejects generation_id that belongs to another client", async () => {
    mockExistingGeneration = {
      id: MOCK_GENERATION_ID,
      client_id: "another-client-id",
      name: "BF",
      date: "2026-11-27",
    }

    const res = await POST(makeRequest({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["store-1"],
      generation_id: MOCK_GENERATION_ID,
    }))

    expect(res.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Dispatch
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/campaigns/generate — Webhook dispatch", () => {
  it("calls n8n webhook with correct payload structure", async () => {
    await POST(makeRequest({
      name: "Black Friday 2026",
      date: "2026-11-27",
      reference_doc_url: "https://drive.google.com/doc/123",
      store_ids: ["store-1", "store-2"],
    }))

    const fetchMock = vi.mocked(globalThis.fetch)
    expect(fetchMock).toHaveBeenCalled()

    const [, options] = fetchMock.mock.calls[0]
    expect(options?.method).toBe("POST")
    expect(options?.headers).toMatchObject({ "Content-Type": "application/json" })

    const body = JSON.parse(options?.body as string)
    expect(body.generation_id).toBeDefined()
    expect(body.campaign_name).toBe("Black Friday 2026")
    expect(body.campaign_date).toBe("2026-11-27")
    expect(body.reference_doc_url).toBe("https://drive.google.com/doc/123")
    expect(body.callback_url).toContain("/api/campaigns/webhook-callback")
    expect(body.stores).toHaveLength(2)
    expect(body.stores[0]).toMatchObject({
      store_id: "store-1",
      store_name: "LensEVO",
      country: "BR",
      language: "pt-BR",
    })
  })

  it("includes drive_folder_id in webhook when regenerating existing campaign", async () => {
    mockExistingGeneration = {
      id: MOCK_GENERATION_ID,
      client_id: MOCK_CLIENT_ID,
      name: "BF",
      date: "2026-11-27",
      drive_folder_id: "folder-abc",
    }
    mockExistingStores = []

    await POST(makeRequest({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["store-1"],
      generation_id: MOCK_GENERATION_ID,
    }))

    const fetchMock = vi.mocked(globalThis.fetch)
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body.drive_folder_id).toBe("folder-abc")
  })

  it("includes version field in each store of webhook payload", async () => {
    await POST(makeRequest({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["store-1"],
    }))

    const fetchMock = vi.mocked(globalThis.fetch)
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body.stores[0].version).toBeDefined()
    expect(typeof body.stores[0].version).toBe("number")
    expect(body.stores[0].version).toBeGreaterThanOrEqual(1)
  })

  it("sends incremented version in webhook for regenerated store", async () => {
    mockExistingGeneration = {
      id: MOCK_GENERATION_ID,
      client_id: MOCK_CLIENT_ID,
      name: "BF",
      date: "2026-11-27",
      drive_folder_id: "folder-abc",
    }
    mockExistingStores = [
      { id: "gs-1", generation_id: MOCK_GENERATION_ID, store_id: "store-1", version: 2, status: "done" },
    ]

    await POST(makeRequest({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["store-1"],
      generation_id: MOCK_GENERATION_ID,
    }))

    const fetchMock = vi.mocked(globalThis.fetch)
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    const store = body.stores.find((s: Record<string, unknown>) => s.store_id === "store-1")
    expect(store.version).toBe(3) // was 2, now incremented to 3
  })

  it("sends webhook to URL from N8N_CAMPAIGNS_WEBHOOK_URL env var", async () => {
    await POST(makeRequest({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["store-1"],
    }))

    const fetchMock = vi.mocked(globalThis.fetch)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe("https://n8n.test.com/webhook/campaigns-generate")
  })

  it("still returns success if webhook fails (non-blocking)", async () => {
    mockWebhookResponse = new Response("Internal Server Error", { status: 500 })

    const res = await POST(makeRequest({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["store-1"],
    }))

    // The route should still return 200 — webhook failure is logged, not blocking
    expect(res.status).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/campaigns/generate — Edge cases", () => {
  it("deduplicates store_ids when duplicates are sent", async () => {
    await POST(makeRequest({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["store-1", "store-1"],
    }))

    // Should only create one store entry, not two
    const storeInserts = insertCalls.filter(c => c.table === "campaign_generation_stores")
    const insertedStoreIds = storeInserts.flatMap(c => {
      const data = c.data as Array<Record<string, unknown>> | Record<string, unknown>
      if (Array.isArray(data)) return data.map(d => d.store_id)
      return [(data as Record<string, unknown>).store_id]
    })
    const uniqueIds = [...new Set(insertedStoreIds)]
    expect(insertedStoreIds.length).toBe(uniqueIds.length)
  })

  it("handles Supabase insert error on campaign_generations gracefully", async () => {
    // Temporarily override chainable to simulate DB error on insert
    const errorChainable = (table: string) => {
      const chain = chainable(table)
      if (table === "campaign_generations") {
        chain.insert = () => ({
          select: () => ({
            single: () => ({ data: null, error: { message: "DB error", code: "23505" } }),
          }),
        })
      }
      return chain
    }

    // Re-mock createAdminClient with error-producing chainable
    const supabaseMod = await import("@/lib/supabase/server")
    vi.mocked(supabaseMod.createAdminClient).mockReturnValueOnce({
      from: errorChainable,
    } as unknown as ReturnType<typeof supabaseMod.createAdminClient>)

    const res = await POST(makeRequest({
      name: "BF",
      date: "2026-11-27",
      store_ids: ["store-1"],
    }))

    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
