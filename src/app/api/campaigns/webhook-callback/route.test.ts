/**
 * Tests for POST /api/campaigns/webhook-callback
 * Receives n8n callback with Drive folder info and per-store status updates.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Track DB calls ──────────────────────────────────────────────────────────
const updateCalls: Array<{ table: string; data: unknown; eqCol?: string; eqId?: string }> = []

const MOCK_GENERATION_ID = "0dff59da-1535-405f-9f4b-02990e3af8a7"
const MOCK_WEBHOOK_SECRET = "test-secret-123"

let mockGeneration: Record<string, unknown> | null = {
  id: MOCK_GENERATION_ID,
  client_id: "client-1",
  status: "processing",
}
let mockGenerationStores: Array<Record<string, unknown>> = [
  { id: "gs-1", generation_id: MOCK_GENERATION_ID, store_id: "e21ba2ab-285e-4358-8d53-7e53c4090e0b", status: "generating", version: 1 },
  { id: "gs-2", generation_id: MOCK_GENERATION_ID, store_id: "72eb5f4d-dc40-41f1-9868-006ff09110a1", status: "generating", version: 1 },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chainable(table: string): Record<string, (...args: any[]) => any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const self: Record<string, (...args: any[]) => any> = {}
  self.select = () => self
  self.eq = (col: string, _val: string) => {
    if (table === "campaign_generations" && col === "id") {
      return { ...self, single: () => ({ data: mockGeneration, error: null }) }
    }
    if (table === "campaign_generation_stores" && col === "generation_id") {
      return { data: mockGenerationStores, error: null }
    }
    return self
  }
  self.single = () => ({ data: null, error: null })
  self.update = (data: unknown) => ({
    eq: (col: string, id: string) => {
      updateCalls.push({ table, data, eqCol: col, eqId: id })
      return { data: null, error: null }
    },
  })
  return self
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => chainable(table),
  }),
}))

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}))

vi.mock("@/lib/cors", () => ({
  corsHeaders: () => ({}),
  handleCorsPreFlight: vi.fn(),
}))

// Mock env variable
vi.stubEnv("N8N_WEBHOOK_SECRET", MOCK_WEBHOOK_SECRET)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any) => Promise<Response>

function makeRequest(body: Record<string, unknown>, secret?: string) {
  return new Request("http://localhost/api/campaigns/webhook-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": secret ?? MOCK_WEBHOOK_SECRET,
    },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0]
}

beforeEach(async () => {
  vi.clearAllMocks()
  updateCalls.length = 0
  mockGeneration = {
    id: MOCK_GENERATION_ID,
    client_id: "client-1",
    status: "processing",
  }
  mockGenerationStores = [
    { id: "gs-1", generation_id: MOCK_GENERATION_ID, store_id: "e21ba2ab-285e-4358-8d53-7e53c4090e0b", status: "generating", version: 1 },
    { id: "gs-2", generation_id: MOCK_GENERATION_ID, store_id: "72eb5f4d-dc40-41f1-9868-006ff09110a1", status: "generating", version: 1 },
  ]

  const mod = await import("./route")
  POST = mod.POST
})

// ─────────────────────────────────────────────────────────────────────────────
// Security
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/campaigns/webhook-callback — Security", () => {
  it("rejects request without x-webhook-secret header", async () => {
    const req = new Request("http://localhost/api/campaigns/webhook-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generation_id: MOCK_GENERATION_ID, stores: [] }),
    }) as unknown as Parameters<typeof POST>[0]

    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it("rejects request with wrong secret", async () => {
    const res = await POST(makeRequest(
      { generation_id: MOCK_GENERATION_ID, stores: [] },
      "wrong-secret"
    ))
    expect(res.status).toBe(401)
  })

  it("accepts request with valid secret", async () => {
    const res = await POST(makeRequest({
      generation_id: MOCK_GENERATION_ID,
      drive_folder_id: "abc",
      drive_folder_url: "https://drive.google.com/drive/folders/abc",
      stores: [
        { store_id: "e21ba2ab-285e-4358-8d53-7e53c4090e0b", status: "done" },
        { store_id: "72eb5f4d-dc40-41f1-9868-006ff09110a1", status: "done" },
      ],
    }))
    expect(res.status).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/campaigns/webhook-callback — Validation", () => {
  it("rejects request without generation_id", async () => {
    const res = await POST(makeRequest({ stores: [] }))
    expect(res.status).toBe(400)
  })

  it("returns 404 when generation_id does not exist", async () => {
    mockGeneration = null
    const res = await POST(makeRequest({
      generation_id: "37d98cdc-3f31-40fc-897c-c03481bbb9dd",
      stores: [],
    }))
    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Successful callback — all stores done
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/campaigns/webhook-callback — All stores done", () => {
  it("updates drive_folder_id and drive_folder_url on campaign_generations", async () => {
    await POST(makeRequest({
      generation_id: MOCK_GENERATION_ID,
      drive_folder_id: "folder-xyz",
      drive_folder_url: "https://drive.google.com/drive/folders/folder-xyz",
      stores: [
        { store_id: "e21ba2ab-285e-4358-8d53-7e53c4090e0b", status: "done" },
        { store_id: "72eb5f4d-dc40-41f1-9868-006ff09110a1", status: "done" },
      ],
    }))

    const genUpdate = updateCalls.find(c => c.table === "campaign_generations")
    expect(genUpdate).toBeDefined()
    const data = genUpdate!.data as Record<string, unknown>
    expect(data.drive_folder_id).toBe("folder-xyz")
    expect(data.drive_folder_url).toBe("https://drive.google.com/drive/folders/folder-xyz")
  })

  it("sets campaign status to done when all stores are done", async () => {
    await POST(makeRequest({
      generation_id: MOCK_GENERATION_ID,
      drive_folder_id: "folder-xyz",
      drive_folder_url: "https://drive.google.com/drive/folders/folder-xyz",
      stores: [
        { store_id: "e21ba2ab-285e-4358-8d53-7e53c4090e0b", status: "done" },
        { store_id: "72eb5f4d-dc40-41f1-9868-006ff09110a1", status: "done" },
      ],
    }))

    const genUpdate = updateCalls.find(c => c.table === "campaign_generations")
    expect((genUpdate!.data as Record<string, unknown>).status).toBe("done")
  })

  it("updates each store status and generated_at timestamp", async () => {
    await POST(makeRequest({
      generation_id: MOCK_GENERATION_ID,
      drive_folder_id: "folder-xyz",
      drive_folder_url: "https://drive.google.com/drive/folders/folder-xyz",
      stores: [
        { store_id: "e21ba2ab-285e-4358-8d53-7e53c4090e0b", status: "done" },
        { store_id: "72eb5f4d-dc40-41f1-9868-006ff09110a1", status: "done" },
      ],
    }))

    const storeUpdates = updateCalls.filter(c => c.table === "campaign_generation_stores")
    expect(storeUpdates.length).toBeGreaterThanOrEqual(2)

    for (const update of storeUpdates) {
      const data = update.data as Record<string, unknown>
      expect(data.status).toBe("done")
      expect(data.generated_at).toBeDefined()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Partial errors
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/campaigns/webhook-callback — Partial errors", () => {
  it("sets campaign status to done even with partial errors", async () => {
    await POST(makeRequest({
      generation_id: MOCK_GENERATION_ID,
      drive_folder_id: "folder-xyz",
      drive_folder_url: "https://drive.google.com/drive/folders/folder-xyz",
      stores: [
        { store_id: "e21ba2ab-285e-4358-8d53-7e53c4090e0b", status: "done" },
        { store_id: "72eb5f4d-dc40-41f1-9868-006ff09110a1", status: "error", error_message: "Timeout na geracao" },
      ],
    }))

    const genUpdate = updateCalls.find(c => c.table === "campaign_generations")
    expect(genUpdate).toBeDefined()
    // PRD says: "Se alguma esta error -> status da campanha = done (com erros parciais)"
    expect((genUpdate!.data as Record<string, unknown>).status).toBe("done")
  })

  it("saves error_message on the failed store", async () => {
    await POST(makeRequest({
      generation_id: MOCK_GENERATION_ID,
      drive_folder_id: "folder-xyz",
      drive_folder_url: "https://drive.google.com/drive/folders/folder-xyz",
      stores: [
        { store_id: "e21ba2ab-285e-4358-8d53-7e53c4090e0b", status: "done" },
        { store_id: "72eb5f4d-dc40-41f1-9868-006ff09110a1", status: "error", error_message: "Timeout na geracao" },
      ],
    }))

    const errorStoreUpdate = updateCalls.find(c => {
      if (c.table !== "campaign_generation_stores") return false
      const data = c.data as Record<string, unknown>
      return data.status === "error"
    })

    expect(errorStoreUpdate).toBeDefined()
    expect((errorStoreUpdate!.data as Record<string, unknown>).error_message).toBe("Timeout na geracao")
  })

  it("sets campaign status to done even when ALL stores have errors", async () => {
    await POST(makeRequest({
      generation_id: MOCK_GENERATION_ID,
      drive_folder_id: "folder-xyz",
      drive_folder_url: "https://drive.google.com/drive/folders/folder-xyz",
      stores: [
        { store_id: "e21ba2ab-285e-4358-8d53-7e53c4090e0b", status: "error", error_message: "Timeout" },
        { store_id: "72eb5f4d-dc40-41f1-9868-006ff09110a1", status: "error", error_message: "API failure" },
      ],
    }))

    const genUpdate = updateCalls.find(c => c.table === "campaign_generations")
    expect(genUpdate).toBeDefined()
    expect((genUpdate!.data as Record<string, unknown>).status).toBe("done")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/campaigns/webhook-callback — Edge cases", () => {
  it("ignores store_id in callback that is not part of the generation", async () => {
    const res = await POST(makeRequest({
      generation_id: MOCK_GENERATION_ID,
      drive_folder_id: "folder-xyz",
      drive_folder_url: "https://drive.google.com/drive/folders/folder-xyz",
      stores: [
        { store_id: "e21ba2ab-285e-4358-8d53-7e53c4090e0b", status: "done" },
        { store_id: "c20d8819-e33d-4612-b60e-76104cd0bfcf", status: "done" },
      ],
    }))

    // Should not crash — unknown stores are silently ignored
    expect(res.status).toBe(200)

    // Should not have created an update for the unknown store
    const hasUnknownUpdate = updateCalls.some(c => {
      return c.table === "campaign_generation_stores" && c.eqId === "c20d8819-e33d-4612-b60e-76104cd0bfcf"
    })
    // Unknown stores are silently ignored
    expect(hasUnknownUpdate).toBe(false)
  })

  it("handles idempotent callback (already completed generation)", async () => {
    mockGeneration = {
      id: MOCK_GENERATION_ID,
      client_id: "client-1",
      status: "done",
      drive_folder_id: "folder-xyz",
      drive_folder_url: "https://drive.google.com/drive/folders/folder-xyz",
    }
    mockGenerationStores = [
      { id: "gs-1", generation_id: MOCK_GENERATION_ID, store_id: "e21ba2ab-285e-4358-8d53-7e53c4090e0b", status: "done", version: 1 },
      { id: "gs-2", generation_id: MOCK_GENERATION_ID, store_id: "72eb5f4d-dc40-41f1-9868-006ff09110a1", status: "done", version: 1 },
    ]

    const res = await POST(makeRequest({
      generation_id: MOCK_GENERATION_ID,
      drive_folder_id: "folder-xyz",
      drive_folder_url: "https://drive.google.com/drive/folders/folder-xyz",
      stores: [
        { store_id: "e21ba2ab-285e-4358-8d53-7e53c4090e0b", status: "done" },
        { store_id: "72eb5f4d-dc40-41f1-9868-006ff09110a1", status: "done" },
      ],
    }))

    // Should succeed without error — idempotent behavior
    expect(res.status).toBe(200)
  })
})
