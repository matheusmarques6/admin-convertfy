import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock Supabase admin client ────────────────────────────────────────
//
// Strategy: implement enough PostgREST surface for the AE-7 service tests.
// Supports: .from, .select, .eq, .in, .gte, .lt, .limit, .order, .contains,
// .overlaps, .maybeSingle, .insert, .update, .delete; thenable for direct await.

type Row = Record<string, unknown>

interface MockTable {
  rows: Row[]
}

const tables: Record<string, MockTable> = {}
const inserts: Record<string, Row[]> = {}

function resetTables() {
  for (const k of Object.keys(tables)) delete tables[k]
  for (const k of Object.keys(inserts)) delete inserts[k]
}

function buildQuery(tableName: string) {
  const filters: Array<{ kind: string; col?: string; val?: unknown; values?: unknown[] }> = []
  let containsFilter: Row | null = null
  let overlapsFilter: { col: string; values: unknown[] } | null = null
  let updatePatch: Row | null = null
  let insertRows: Row[] | null = null
  let limitN: number | null = null
  let countMode: "exact" | null = null
  let headMode = false

  const exec = (): Row[] => {
    if (insertRows) {
      tables[tableName] ??= { rows: [] }
      tables[tableName].rows.push(...insertRows)
      inserts[tableName] ??= []
      inserts[tableName].push(...insertRows)
      return insertRows
    }
    const table = tables[tableName] ?? { rows: [] }
    let rows = table.rows
    for (const f of filters) {
      if (f.kind === "eq") rows = rows.filter((r) => r[f.col!] === f.val)
      else if (f.kind === "in") rows = rows.filter((r) => f.values!.includes(r[f.col!]))
      else if (f.kind === "gte") rows = rows.filter((r) => String(r[f.col!]) >= String(f.val))
      else if (f.kind === "lt") rows = rows.filter((r) => String(r[f.col!]) < String(f.val))
    }
    if (containsFilter) {
      rows = rows.filter((r) => {
        const meta = (r.metadata ?? {}) as Row
        return Object.entries(containsFilter as Row).every(([k, v]) => meta[k] === v)
      })
    }
    if (overlapsFilter) {
      rows = rows.filter((r) => {
        const rowTags = (r[overlapsFilter!.col] ?? []) as unknown[]
        if (!Array.isArray(rowTags)) return false
        return overlapsFilter!.values.some((v) => rowTags.includes(v))
      })
    }
    if (updatePatch) {
      for (const row of rows) Object.assign(row, updatePatch)
    }
    if (limitN !== null) rows = rows.slice(0, limitN)
    return rows
  }

  const chain: Record<string, unknown> = {
    select: (_cols?: string, opts?: { count?: "exact"; head?: boolean }) => {
      if (opts?.count === "exact") countMode = "exact"
      if (opts?.head) headMode = true
      return chain
    },
    eq: (col: string, val: unknown) => {
      filters.push({ kind: "eq", col, val })
      return chain
    },
    in: (col: string, values: unknown[]) => {
      filters.push({ kind: "in", col, values })
      return chain
    },
    gte: (col: string, val: unknown) => {
      filters.push({ kind: "gte", col, val })
      return chain
    },
    lt: (col: string, val: unknown) => {
      filters.push({ kind: "lt", col, val })
      return chain
    },
    contains: (_col: string, val: Row) => {
      containsFilter = val
      return chain
    },
    overlaps: (col: string, values: unknown[]) => {
      overlapsFilter = { col, values }
      return chain
    },
    order: (_col: string, _opts?: { ascending?: boolean }) => chain,
    limit: (n: number) => {
      limitN = n
      return chain
    },
    maybeSingle: async () => ({ data: exec()[0] ?? null, error: null }),
    single: async () => ({ data: exec()[0] ?? null, error: null }),
    update: (patch: Row) => {
      updatePatch = patch
      return chain
    },
    insert: (rows: Row[] | Row) => {
      insertRows = Array.isArray(rows) ? rows : [rows]
      return chain
    },
    then: (resolve: (v: { data: unknown; error: null; count?: number }) => unknown) => {
      const rows = exec()
      if (countMode === "exact") {
        return resolve({
          data: headMode ? null : rows,
          error: null,
          count: rows.length,
        })
      }
      return resolve({ data: rows, error: null })
    },
  }
  return chain
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (tableName: string) => buildQuery(tableName),
  }),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tableName: string) => buildQuery(tableName),
  }),
}))

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (tableName: string) => buildQuery(tableName),
  }),
}))

const sendMock = vi.fn(async () => ({ id: "resend-1", success: true }))
vi.mock("@/lib/email/email.service", () => ({
  emailService: {
    send: sendMock,
  },
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

import {
  notifyEmailFailed,
  notifyBatchComplete,
  notifyBatchAllFailed,
  getStoreInvolvedAdmins,
} from "@/lib/agents/generation-notify.service"
import { notificationService } from "@/lib/services/notification.service"

const STORE_ID = "store-1"
const CLIENT_ID = "client-1"
const OWNER_ID = "profile-owner"
const CTO_1 = "profile-cto-1"
const CTO_2 = "profile-cto-2"
const EMAIL_ID = "email-1"
const FLOW_ID = "flow-1"
const BATCH_ID = "batch-1"

function seedBasic() {
  resetTables()
  tables.profiles = {
    rows: [
      { id: OWNER_ID, email: "owner@convertfy.me", name: "Owner", tags: [], role: "admin" },
      { id: CTO_1, email: "cto1@convertfy.me", name: "CTO One", tags: ["cto"], role: "admin" },
      { id: CTO_2, email: "cto2@convertfy.me", name: "CTO Two", tags: ["cto"], role: "admin" },
    ],
  }
  tables.client_stores = {
    rows: [{ id: STORE_ID, client_id: CLIENT_ID, store_name: "Loja Teste" }],
  }
  tables.clients = {
    rows: [{ id: CLIENT_ID, owner_id: OWNER_ID }],
  }
  tables.email_flow_emails = {
    rows: [
      {
        id: EMAIL_ID,
        name: "Email 1",
        email_number: 1,
        flow_id: FLOW_ID,
        generation_batch_id: BATCH_ID,
        status: "failed",
      },
    ],
  }
  tables.email_flows = {
    rows: [{ id: FLOW_ID, flow_type: "welcome", store_id: STORE_ID }],
  }
  tables.notifications = { rows: [] }
  tables.deals = { rows: [] }
}

describe("notifyByTag", () => {
  beforeEach(() => {
    sendMock.mockClear()
    seedBasic()
  })

  it("creates 1 notification per profile with tag overlap", async () => {
    const count = await notificationService.notifyByTag(["cto"], {
      title: "test",
      body: "body",
      type: "error",
    })
    expect(count).toBe(2)
    expect(tables.notifications.rows).toHaveLength(2)
    expect(tables.notifications.rows[0].user_id).toBe(CTO_1)
    expect(tables.notifications.rows[1].user_id).toBe(CTO_2)
  })

  it("returns 0 when no profile has the tag", async () => {
    const count = await notificationService.notifyByTag(["inexistente"], {
      title: "test",
    })
    expect(count).toBe(0)
    expect(tables.notifications.rows).toHaveLength(0)
  })

  it("returns 0 with empty tags array", async () => {
    const count = await notificationService.notifyByTag([], { title: "x" })
    expect(count).toBe(0)
  })
})

describe("notifyEmailFailed (dedup-key)", () => {
  beforeEach(() => {
    sendMock.mockClear()
    seedBasic()
  })

  it("fires notification + email to CTOs on first call", async () => {
    await notifyEmailFailed({
      storeId: STORE_ID,
      emailId: EMAIL_ID,
      failureReason: "html_failed",
      batchId: BATCH_ID,
    })
    expect(tables.notifications.rows).toHaveLength(2)
    // Email sent to both CTOs
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  it("skips second call within 1h via dedup-key", async () => {
    await notifyEmailFailed({
      storeId: STORE_ID,
      emailId: EMAIL_ID,
      failureReason: "html_failed",
      batchId: BATCH_ID,
    })
    sendMock.mockClear()
    // Ensure the dedup key has a created_at within the last hour
    for (const r of tables.notifications.rows) {
      r.created_at = new Date().toISOString()
    }

    await notifyEmailFailed({
      storeId: STORE_ID,
      emailId: EMAIL_ID,
      failureReason: "html_failed",
      batchId: BATCH_ID,
    })
    // Notifications count unchanged + no new emails
    expect(tables.notifications.rows).toHaveLength(2)
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe("getStoreInvolvedAdmins (fallback)", () => {
  beforeEach(() => {
    sendMock.mockClear()
    seedBasic()
  })

  it("returns owner of client when present", async () => {
    const admins = await getStoreInvolvedAdmins(STORE_ID)
    expect(admins.map((a) => a.id)).toContain(OWNER_ID)
  })

  it("falls back to role-based when no owner + no deals", async () => {
    // Wipe owner and deals
    tables.clients.rows = [{ id: CLIENT_ID, owner_id: null }]
    const admins = await getStoreInvolvedAdmins(STORE_ID)
    // Should include profiles with role admin/owner/cs (OWNER_ID, CTO_1, CTO_2 are all admin)
    expect(admins.length).toBeGreaterThan(0)
  })
})

describe("notifyBatchComplete + notifyBatchAllFailed", () => {
  beforeEach(() => {
    sendMock.mockClear()
    seedBasic()
    // Add a second email to make a meaningful batch
    tables.email_flow_emails.rows.push({
      id: "email-2",
      name: "Email 2",
      email_number: 2,
      flow_id: FLOW_ID,
      generation_batch_id: BATCH_ID,
      status: "ready",
    })
  })

  it("notifies admins on batch complete", async () => {
    await notifyBatchComplete({ storeId: STORE_ID, batchId: BATCH_ID })
    // Owner notified at least
    const userIds = tables.notifications.rows.map((r) => r.user_id)
    expect(userIds).toContain(OWNER_ID)
  })

  it("notifies CTO tag on batch all failed", async () => {
    // All failed
    tables.email_flow_emails.rows[1].status = "failed"
    await notifyBatchAllFailed({ storeId: STORE_ID, batchId: BATCH_ID })
    const userIds = tables.notifications.rows.map((r) => r.user_id)
    expect(userIds).toContain(CTO_1)
    expect(userIds).toContain(CTO_2)
  })
})
