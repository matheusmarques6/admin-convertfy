import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Cobre o caminho que travava o botão "Gerar copies (n8n)":
 * - flows sem NENHUM email → auto-seed dos defaults + dispatch segue
 * - emails existem mas nenhum em draft → reason distinto (no_draft_emails)
 * - onlyDrafts=false com emails fora de draft → dispatch normal
 */

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {}

  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    let limitN: number | null = null
    let op: "select" | "insert" | "update" = "select"
    let insertRows: Row[] = []
    let updatePatch: Row = {}

    const exec = () => {
      const rows = tables[table] ?? (tables[table] = [])
      if (op === "insert") {
        for (const r of insertRows) {
          rows.push({ id: `${table}-${rows.length + 1}`, ...r })
        }
        return { data: insertRows, error: null }
      }
      if (op === "update") {
        const matched = rows.filter((r) => filters.every((f) => f(r)))
        for (const r of matched) Object.assign(r, updatePatch)
        return { data: matched, error: null }
      }
      let out = rows.filter((r) => filters.every((f) => f(r)))
      if (limitN != null) out = out.slice(0, limitN)
      return { data: out, error: null }
    }

    const api = {
      select: () => api,
      eq: (c: string, v: unknown) => {
        filters.push((r) => r[c] === v)
        return api
      },
      in: (c: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[c]))
        return api
      },
      order: () => api,
      limit: (n: number) => {
        limitN = n
        return api
      },
      maybeSingle: () => {
        const res = exec()
        return Promise.resolve({ data: res.data[0] ?? null, error: null })
      },
      insert: (rows: Row | Row[]) => {
        op = "insert"
        insertRows = Array.isArray(rows) ? rows : [rows]
        return api
      },
      update: (patch: Row) => {
        op = "update"
        updatePatch = patch
        return api
      },
      then: (
        onFulfilled?: (v: { data: Row[]; error: null }) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => Promise.resolve(exec()).then(onFulfilled, onRejected),
    }
    return api
  }

  return {
    tables,
    makeClient: () => ({ from: (table: string) => builder(table) }),
  }
})

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => h.makeClient(),
  createClient: () => ({}),
}))

vi.mock("@/lib/agents/seed-blocks", () => ({
  ensureBlocksSeeded: vi.fn().mockResolvedValue(undefined),
  reconcileBlocksAdditive: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/agents/architect/generate.service", () => ({
  isArchitectConfigured: vi.fn().mockResolvedValue(false),
  generateForEmails: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/agents/architect/blueprint-loader", () => ({
  loadEffectiveBlueprintsBatch: vi.fn().mockResolvedValue(new Map()),
}))

import { dispatchEmailCopyWebhook } from "./email-copy-webhook.service"

const fetchMock = vi.fn()

function resetTables(emailRows: Row[]) {
  for (const k of Object.keys(h.tables)) delete h.tables[k]
  h.tables.client_stores = [
    {
      id: "store1",
      store_name: "Loja Teste",
      store_url: "https://loja.test",
      platform: "shopify",
      language: "pt-BR",
      niche: "moda",
    },
  ]
  h.tables.email_flows = [
    { id: "flow1", store_id: "store1", flow_type: "welcome", name: "Welcome Flow", position: 1 },
  ]
  h.tables.email_flow_emails = emailRows
  h.tables.email_blocks = []
  h.tables.email_reference_templates = []
  h.tables.email_generation_runs = []
}

beforeEach(() => {
  vi.stubEnv("N8N_EMAIL_COPY_WEBHOOK_URL", "https://n8n.test/webhook")
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, text: async () => "" })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("dispatchEmailCopyWebhook — auto-seed e reasons", () => {
  it("flows sem NENHUM email: auto-seed dos defaults e dispatch segue (caso que travava com no_emails)", async () => {
    resetTables([])

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    expect(res.ok).toBe(true)
    expect(res.email_count).toBe(8) // welcome tem 8 emails default
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Os emails foram criados e, após dispatch ok, marcados in_progress
    const emails = h.tables.email_flow_emails
    expect(emails).toHaveLength(8)
    expect(emails.every((e) => e.status === "in_progress")).toBe(true)
  })

  it("emails existem mas nenhum em draft + onlyDrafts: reason no_draft_emails (não no_emails) e nada é semeado", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "in_progress" },
    ])

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    expect(res.ok).toBe(false)
    expect(res.reason).toBe("no_draft_emails")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(h.tables.email_flow_emails).toHaveLength(1)
  })

  it("onlyDrafts=false com emails fora de draft: dispatch normal (regerar)", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "in_progress" },
    ])

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: false,
    })

    expect(res.ok).toBe(true)
    expect(res.email_count).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
