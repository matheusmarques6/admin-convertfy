import { describe, it, expect, vi, beforeEach } from "vitest"

// Spy do reconcileBlocksAdditive + dados por tabela do mock supabase.
const h = vi.hoisted(() => ({
  reconcileSpy: vi.fn(),
  tableData: {} as Record<string, { single?: unknown; list?: unknown }>,
}))

vi.mock("@/lib/agents/seed-blocks", () => ({
  reconcileBlocksAdditive: (...args: unknown[]) => h.reconcileSpy(...args),
}))

vi.mock("@/lib/supabase/server", () => {
  function builder(table: string) {
    const resp = h.tableData[table] ?? {}
    // Encadeável: select/eq/in/order retornam o próprio builder; maybeSingle
    // resolve `single`; `await builder` (thenable) resolve `list`.
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      maybeSingle: () =>
        Promise.resolve({ data: resp.single ?? null, error: null }),
      then: (onF: (v: unknown) => unknown) =>
        Promise.resolve({ data: resp.list ?? [], error: null }).then(onF),
    }
    return chain
  }
  return {
    createAdminClient: () => ({ from: (t: string) => builder(t) }),
    createClient: () => ({}),
  }
})

import {
  reconcileEmailStructure,
  reconcileStoreStructure,
} from "./reconcile-blocks.service"

beforeEach(() => {
  h.reconcileSpy.mockReset()
  h.reconcileSpy.mockResolvedValue({ reconciled: true, added: 7, total: 17 })
  h.tableData = {}
})

describe("reconcileEmailStructure", () => {
  it("resolve o emailId e delega passando o storeId", async () => {
    h.tableData = {
      email_flows: { single: { id: "flow1" } },
      email_flow_emails: { single: { id: "em1", status: "draft" } },
    }
    const r = await reconcileEmailStructure("store1", "welcome", 1)
    expect(h.reconcileSpy).toHaveBeenCalledWith("em1", "welcome", 1, "store1")
    expect(r).toEqual({ reconciled: true, added: 7, total: 17, skipped: null })
  })

  it("preserva emails finalizados (ready) — não reconcilia", async () => {
    h.tableData = {
      email_flows: { single: { id: "flow1" } },
      email_flow_emails: { single: { id: "em1", status: "ready" } },
    }
    const r = await reconcileEmailStructure("store1", "welcome", 1)
    expect(h.reconcileSpy).not.toHaveBeenCalled()
    expect(r.skipped).toBe("finalized")
    expect(r.reconciled).toBe(false)
  })

  it("flow inexistente → skipped:not_found, sem reconciliar", async () => {
    h.tableData = { email_flows: { single: null } }
    const r = await reconcileEmailStructure("store1", "welcome", 1)
    expect(h.reconcileSpy).not.toHaveBeenCalled()
    expect(r.skipped).toBe("not_found")
  })

  it("email inexistente no flow → skipped:not_found", async () => {
    h.tableData = {
      email_flows: { single: { id: "flow1" } },
      email_flow_emails: { single: null },
    }
    const r = await reconcileEmailStructure("store1", "welcome", 1)
    expect(h.reconcileSpy).not.toHaveBeenCalled()
    expect(r.skipped).toBe("not_found")
  })
})

describe("reconcileStoreStructure — regressão do fix do storeId", () => {
  it("passa o storeId ao reconcileBlocksAdditive (usa blueprint da loja)", async () => {
    h.tableData = {
      email_flows: { list: [{ id: "flow1", flow_type: "welcome" }] },
      email_flow_emails: {
        list: [{ id: "em1", flow_id: "flow1", number: 1, status: "draft" }],
      },
    }
    await reconcileStoreStructure("store1")
    expect(h.reconcileSpy).toHaveBeenCalledWith("em1", "welcome", 1, "store1")
  })

  it("pula emails finalizados (ready/approved/live)", async () => {
    h.tableData = {
      email_flows: { list: [{ id: "flow1", flow_type: "welcome" }] },
      email_flow_emails: {
        list: [{ id: "em1", flow_id: "flow1", number: 1, status: "ready" }],
      },
    }
    const r = await reconcileStoreStructure("store1")
    expect(h.reconcileSpy).not.toHaveBeenCalled()
    expect(r.emails_evaluated).toBe(0)
  })
})
