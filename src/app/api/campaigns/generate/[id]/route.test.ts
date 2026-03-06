/**
 * Tests for GET and DELETE /api/campaigns/generate/[id]
 * GET: Returns current status of a campaign generation and its stores. Used for polling.
 * DELETE: Removes a campaign generation and its associated stores/tasks (cascade).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const MOCK_GENERATION_ID = "gen-uuid-1"
const MOCK_CLIENT_ID = "client-uuid-1"
const MOCK_USER_ID = "user-uuid-1"
const MOCK_ORG_ID = "org-uuid-1"

let mockPortalUser: { client_id: string } | null = { client_id: MOCK_CLIENT_ID }
let mockOrgMember: { org_id: string } | null = null
let mockClientForOrg: { id: string } | null = null
let mockDeleteError: { message: string } | null = null
let mockGeneration: Record<string, unknown> | null = {
  id: MOCK_GENERATION_ID,
  client_id: MOCK_CLIENT_ID,
  name: "Black Friday 2026",
  date: "2026-11-27",
  reference_doc_url: null,
  drive_folder_id: null,
  drive_folder_url: null,
  status: "processing",
  created_at: "2026-03-05T10:00:00Z",
  updated_at: "2026-03-05T10:00:00Z",
}
let mockGenerationStores: Array<Record<string, unknown>> = [
  {
    id: "gs-1",
    generation_id: MOCK_GENERATION_ID,
    store_id: "store-1",
    status: "generating",
    version: 1,
    error_message: null,
    generated_at: null,
    created_at: "2026-03-05T10:00:00Z",
  },
  {
    id: "gs-2",
    generation_id: MOCK_GENERATION_ID,
    store_id: "store-2",
    status: "done",
    version: 1,
    error_message: null,
    generated_at: "2026-03-05T10:05:00Z",
    created_at: "2026-03-05T10:00:00Z",
  },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chainable(table: string): Record<string, (...args: any[]) => any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const self: Record<string, (...args: any[]) => any> = {}
  self.select = () => self
  self.limit = () => self
  // Helper: create a fully-chainable result object that always resolves to the given data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function terminalChain(data: unknown, error: unknown = null): Record<string, (...args: any[]) => any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t: Record<string, (...args: any[]) => any> = {}
    t.select = () => t; t.eq = () => t; t.limit = () => t; t.in = () => t
    t.single = () => ({ data, error })
    t.order = () => ({ data, error })
    return t
  }

  self.eq = (col: string, _val: string) => {
    if (table === "org_members") return terminalChain(mockOrgMember, mockOrgMember ? null : { code: "PGRST116" })
    if (table === "client_portal_users") return terminalChain(mockPortalUser, mockPortalUser ? null : { code: "PGRST116" })
    if (table === "campaign_generations" && col === "id") return terminalChain(mockGeneration)
    if (table === "clients" && col === "org_id") return terminalChain(mockClientForOrg)
    if (table === "campaign_generation_stores" && col === "generation_id") {
      return {
        ...self,
        order: () => ({ data: mockGenerationStores, error: null }),
        data: mockGenerationStores,
        error: null,
      }
    }
    return self
  }
  self.delete = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delChain: Record<string, (...args: any[]) => any> = {}
    delChain.eq = () => ({ data: null, error: mockDeleteError })
    return delChain
  }
  self.single = () => ({ data: null, error: null })
  self.order = () => ({ data: mockGenerationStores, error: null })
  return self
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => ({ data: { user: { id: MOCK_USER_ID } }, error: null }) },
  }),
  createAdminClient: () => ({
    from: (table: string) => chainable(table),
  }),
}))

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/cors", () => ({
  corsHeaders: () => ({}),
  handleCorsPreFlight: vi.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: (req: any, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DELETE: (req: any, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

function makeRequest(id: string = MOCK_GENERATION_ID) {
  return new Request(`http://localhost/api/campaigns/generate/${id}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  }) as unknown as Parameters<typeof GET>[0]
}

function makeParams(id: string = MOCK_GENERATION_ID) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockPortalUser = { client_id: MOCK_CLIENT_ID }
  mockOrgMember = null
  mockClientForOrg = null
  mockDeleteError = null
  mockGeneration = {
    id: MOCK_GENERATION_ID,
    client_id: MOCK_CLIENT_ID,
    name: "Black Friday 2026",
    date: "2026-11-27",
    reference_doc_url: null,
    drive_folder_id: null,
    drive_folder_url: null,
    status: "processing",
    created_at: "2026-03-05T10:00:00Z",
    updated_at: "2026-03-05T10:00:00Z",
  }
  mockGenerationStores = [
    { id: "gs-1", generation_id: MOCK_GENERATION_ID, store_id: "store-1", status: "generating", version: 1, error_message: null, generated_at: null },
    { id: "gs-2", generation_id: MOCK_GENERATION_ID, store_id: "store-2", status: "done", version: 1, error_message: null, generated_at: "2026-03-05T10:05:00Z" },
  ]

  const mod = await import("./route")
  GET = mod.GET
  DELETE = mod.DELETE
})

// ─────────────────────────────────────────────────────────────────────────────
// Auth & Access Control
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/campaigns/generate/[id] — Auth", () => {
  it("returns 401 when neither org member nor portal user found", async () => {
    mockPortalUser = null
    mockOrgMember = null
    const res = await GET(makeRequest(), makeParams())
    expect(res.status).toBe(401)
  })

  it("returns 404 when generation does not exist", async () => {
    mockGeneration = null
    const res = await GET(makeRequest("nonexistent"), makeParams("nonexistent"))
    expect(res.status).toBe(404)
  })

  it("returns 403 when portal user generation belongs to another client", async () => {
    mockGeneration = { ...mockGeneration!, client_id: "another-client" }
    const res = await GET(makeRequest(), makeParams())
    expect(res.status).toBe(403)
  })

  it("returns 403 when org member generation belongs to another org", async () => {
    mockOrgMember = { org_id: MOCK_ORG_ID }
    mockPortalUser = null
    mockClientForOrg = null // client not in this org
    const res = await GET(makeRequest(), makeParams())
    expect(res.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Successful Responses
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/campaigns/generate/[id] — Success", () => {
  it("returns generation with stores list", async () => {
    const res = await GET(makeRequest(), makeParams())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.generation).toBeDefined()
    expect(body.generation.id).toBe(MOCK_GENERATION_ID)
    expect(body.generation.name).toBe("Black Friday 2026")
    expect(body.generation.status).toBe("processing")
    expect(body.stores).toHaveLength(2)
  })

  it("returns drive folder info when available", async () => {
    mockGeneration = {
      ...mockGeneration!,
      status: "done",
      drive_folder_id: "folder-abc",
      drive_folder_url: "https://drive.google.com/drive/folders/folder-abc",
    }
    mockGenerationStores = mockGenerationStores.map(s => ({ ...s, status: "done" }))

    const res = await GET(makeRequest(), makeParams())
    const body = await res.json()

    expect(body.generation.drive_folder_id).toBe("folder-abc")
    expect(body.generation.drive_folder_url).toBe("https://drive.google.com/drive/folders/folder-abc")
  })

  it("includes error_message on failed stores", async () => {
    mockGenerationStores = [
      { id: "gs-1", store_id: "store-1", status: "done", version: 1, error_message: null },
      { id: "gs-2", store_id: "store-2", status: "error", version: 1, error_message: "Timeout na geracao" },
    ]

    const res = await GET(makeRequest(), makeParams())
    const body = await res.json()

    const errorStore = body.stores.find((s: Record<string, unknown>) => s.status === "error")
    expect(errorStore).toBeDefined()
    expect(errorStore.error_message).toBe("Timeout na geracao")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Org Member (admin/agency) path
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/campaigns/generate/[id] — Org member path", () => {
  beforeEach(() => {
    mockOrgMember = { org_id: MOCK_ORG_ID }
    mockPortalUser = null
    mockClientForOrg = { id: MOCK_CLIENT_ID } // client belongs to this org
  })

  it("returns generation when user is org member (not portal user)", async () => {
    const res = await GET(makeRequest(), makeParams())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.generation.id).toBe(MOCK_GENERATION_ID)
    expect(body.stores).toHaveLength(2)
  })

  it("prioritizes org member over portal user when both exist", async () => {
    mockOrgMember = { org_id: MOCK_ORG_ID }
    mockPortalUser = { client_id: "different-client-id" }
    mockClientForOrg = { id: MOCK_CLIENT_ID }

    const res = await GET(makeRequest(), makeParams())
    // Should succeed via org path, not fail via portal path (different client)
    expect(res.status).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/campaigns/generate/[id]
// ─────────────────────────────────────────────────────────────────────────────

function makeDeleteRequest(id: string = MOCK_GENERATION_ID) {
  return new Request(`http://localhost/api/campaigns/generate/${id}`, {
    method: "DELETE",
  }) as unknown as Parameters<typeof DELETE>[0]
}

describe("DELETE /api/campaigns/generate/[id] — Auth", () => {
  it("returns 401 when user is not authenticated", async () => {
    mockPortalUser = null
    mockOrgMember = null
    const res = await DELETE(makeDeleteRequest(), makeParams())
    expect(res.status).toBe(401)
  })

  it("returns 404 when generation does not exist", async () => {
    mockGeneration = null
    const res = await DELETE(makeDeleteRequest(), makeParams())
    expect(res.status).toBe(404)
  })

  it("returns 403 when portal user tries to delete another client generation", async () => {
    mockGeneration = { ...mockGeneration!, client_id: "another-client" }
    const res = await DELETE(makeDeleteRequest(), makeParams())
    expect(res.status).toBe(403)
  })

  it("returns 403 when org member tries to delete generation from another org", async () => {
    mockOrgMember = { org_id: MOCK_ORG_ID }
    mockPortalUser = null
    mockClientForOrg = null
    const res = await DELETE(makeDeleteRequest(), makeParams())
    expect(res.status).toBe(403)
  })
})

describe("DELETE /api/campaigns/generate/[id] — Success", () => {
  it("deletes generation as portal user", async () => {
    const res = await DELETE(makeDeleteRequest(), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deleted).toBe(true)
  })

  it("deletes generation as org member", async () => {
    mockOrgMember = { org_id: MOCK_ORG_ID }
    mockPortalUser = null
    mockClientForOrg = { id: MOCK_CLIENT_ID }
    const res = await DELETE(makeDeleteRequest(), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deleted).toBe(true)
  })

  it("returns 500 when delete fails at DB level", async () => {
    mockDeleteError = { message: "FK constraint" }
    const res = await DELETE(makeDeleteRequest(), makeParams())
    expect(res.status).toBe(500)
  })
})
