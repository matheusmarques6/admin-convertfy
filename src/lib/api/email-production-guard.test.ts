import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock do slug-mapping: controlamos o "target" resolvido por task.
let mockTarget: unknown = null
vi.mock("@/lib/email-task-sync/slug-mapping", () => ({
  resolveTaskWorkspaceTarget: () => mockTarget,
  resolveTaskWorkspaceTargetByTitle: () => null,
}))

// Mock admin client: banco em memória com a cadeia usada pelo guard.
type Row = Record<string, unknown>
const db: Record<string, Row[]> = {
  tasks: [],
  onboardings: [],
  email_flows: [],
  email_flow_emails: [],
}
function resetDb() {
  for (const k of Object.keys(db)) db[k] = []
}
function makeQuery(table: string) {
  const filters: Array<[string, unknown]> = []
  let inFilter: [string, unknown[]] | null = null
  const run = () =>
    (db[table] ?? []).filter(
      (r) =>
        filters.every(([k, v]) => r[k] === v) &&
        (!inFilter || (inFilter[1] as unknown[]).includes(r[inFilter[0]])),
    )
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push([col, val])
      return chain
    },
    in: (col: string, vals: unknown[]) => {
      inFilter = [col, vals]
      return chain
    },
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    // suporta `await query` direto (caso email-list)
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: run(), error: null }),
  }
  return chain
}
const admin = { from: (t: string) => makeQuery(t) } as never

import { guardEmailProductionCompletion } from "./email-production-guard"

beforeEach(() => {
  resetDb()
  mockTarget = null
})

describe("guardEmailProductionCompletion — invariante board↔workspace", () => {
  it("REGRESSÃO: bloqueia (email_not_approved) quando o email da task NÃO está aprovado", async () => {
    mockTarget = { kind: "email", flowType: "welcome", emailNumber: 1 }
    db.tasks.push({ id: "t1", slug: "welcome_email_1", store_id: "s1" })
    db.email_flows.push({ id: "f1", store_id: "s1", flow_type: "welcome" })
    db.email_flow_emails.push({ flow_id: "f1", number: 1, status: "draft" })

    const reason = await guardEmailProductionCompletion(admin, "t1")
    expect(reason).toBe("email_not_approved")
  })

  it("libera (null) quando o email está approved", async () => {
    mockTarget = { kind: "email", flowType: "welcome", emailNumber: 1 }
    db.tasks.push({ id: "t1", slug: "welcome_email_1", store_id: "s1" })
    db.email_flows.push({ id: "f1", store_id: "s1", flow_type: "welcome" })
    db.email_flow_emails.push({ flow_id: "f1", number: 1, status: "approved" })

    expect(await guardEmailProductionCompletion(admin, "t1")).toBeNull()
  })

  it("libera (null) quando a task não é de produção de email (checkbox-only)", async () => {
    mockTarget = { kind: "checkbox-only" }
    db.tasks.push({ id: "t1", slug: "estudo", store_id: "s1" })
    expect(await guardEmailProductionCompletion(admin, "t1")).toBeNull()
  })

  it("bloqueia (email_flow_missing) quando o flow não existe", async () => {
    mockTarget = { kind: "email", flowType: "welcome", emailNumber: 1 }
    db.tasks.push({ id: "t1", slug: "welcome_email_1", store_id: "s1" })
    expect(await guardEmailProductionCompletion(admin, "t1")).toBe(
      "email_flow_missing",
    )
  })

  it("email-list: bloqueia se nem todos os emails estão aprovados", async () => {
    mockTarget = {
      kind: "email-list",
      flowType: "welcome",
      subItems: [{ emailNumber: 1 }, { emailNumber: 2 }],
    }
    db.tasks.push({ id: "t1", slug: "welcome_flow", store_id: "s1" })
    db.email_flows.push({ id: "f1", store_id: "s1", flow_type: "welcome" })
    db.email_flow_emails.push({ flow_id: "f1", number: 1, status: "approved" })
    db.email_flow_emails.push({ flow_id: "f1", number: 2, status: "draft" })
    expect(await guardEmailProductionCompletion(admin, "t1")).toBe(
      "emails_not_all_approved",
    )
  })
})
