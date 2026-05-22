import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock supabase admin client ─────────────────────────────────────────
type Row = Record<string, unknown>
interface MockTable {
  rows: Row[]
}

const tables: Record<string, MockTable> = {}

function resetTables() {
  for (const k of Object.keys(tables)) delete tables[k]
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

function matches(row: Row, filters: Array<[string, unknown]>): boolean {
  return filters.every(([k, v]) => row[k] === v)
}

let idCounter = 0
function nextId(prefix = "id"): string {
  idCounter += 1
  return `${prefix}_${idCounter}`
}

function buildQuery(tableName: string) {
  const filters: Array<[string, unknown]> = []
  let inFilter: { col: string; values: unknown[] } | null = null
  let orderCol: string | null = null
  let orderAsc = true
  let limitN: number | null = null
  let updatePatch: Row | null = null
  let insertRows: Row[] | null = null
  let selectAfterInsert = false

  const tableOf = () => {
    if (!tables[tableName]) tables[tableName] = { rows: [] }
    return tables[tableName]
  }

  const exec = (): Row[] => {
    const table = tableOf()
    let rows = table.rows.filter((r) => matches(r, filters))
    if (inFilter) {
      const f = inFilter
      rows = rows.filter((r) => f.values.includes(r[f.col]))
    }
    if (orderCol) {
      rows = [...rows].sort((a, b) => {
        const av = String(a[orderCol as string] ?? "")
        const bv = String(b[orderCol as string] ?? "")
        return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    if (limitN !== null) rows = rows.slice(0, limitN)
    if (updatePatch) {
      for (const row of rows) Object.assign(row, updatePatch)
    }
    return rows
  }

  const chain: Record<string, unknown> = {
    select: (_cols?: string) => {
      if (insertRows) selectAfterInsert = true
      return chain
    },
    eq: (col: string, val: unknown) => {
      filters.push([col, val])
      return chain
    },
    in: (col: string, values: unknown[]) => {
      inFilter = { col, values }
      return chain
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      orderCol = col
      orderAsc = opts?.ascending !== false
      return chain
    },
    limit: (n: number) => {
      limitN = n
      return chain
    },
    update: (patch: Row) => {
      updatePatch = patch
      return chain
    },
    insert: (rows: Row | Row[]) => {
      const arr = Array.isArray(rows) ? rows : [rows]
      insertRows = arr.map((r) => ({ ...r, id: r.id ?? nextId(tableName) }))
      const table = tableOf()
      for (const r of insertRows) table.rows.push(r)
      return chain
    },
    maybeSingle: async () => {
      const rows = exec()
      return { data: rows[0] ?? null, error: null }
    },
    single: async () => {
      if (insertRows && selectAfterInsert) {
        return { data: insertRows[insertRows.length - 1], error: null }
      }
      const rows = exec()
      return { data: rows[0] ?? null, error: rows[0] ? null : new Error("not found") }
    },
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: exec(), error: null }),
  }
  return chain
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (tableName: string) => buildQuery(tableName),
  }),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}))

// ── helpers de fixture ─────────────────────────────────────────────────
function seedOnboarding(id: string, storeId: string) {
  if (!tables.onboardings) tables.onboardings = { rows: [] }
  tables.onboardings.rows.push({ id, store_id: storeId })
}

function seedTask(t: {
  id: string
  slug: string
  status: string
  storeId?: string
  onboardingId?: string
  subItems?: Array<{ slug: string; completed?: boolean }>
}) {
  if (!tables.tasks) tables.tasks = { rows: [] }
  tables.tasks.rows.push({
    id: t.id,
    slug: t.slug,
    status: t.status,
    store_id: t.storeId ?? null,
    onboarding_id: t.onboardingId ?? null,
    metadata: t.subItems ? clone({ sub_items: t.subItems }) : {},
    created_at: new Date(Date.now() - idCounter * 1000).toISOString(),
  })
}

function seedFlow(t: {
  id: string
  storeId: string
  flowType: string
  status?: string
}) {
  if (!tables.email_flows) tables.email_flows = { rows: [] }
  tables.email_flows.rows.push({
    id: t.id,
    store_id: t.storeId,
    flow_type: t.flowType,
    status: t.status ?? "in_progress",
  })
}

function seedEmail(t: {
  id: string
  flowId: string
  number: number
  status: string
}) {
  if (!tables.email_flow_emails) tables.email_flow_emails = { rows: [] }
  tables.email_flow_emails.rows.push({
    id: t.id,
    flow_id: t.flowId,
    number: t.number,
    status: t.status,
  })
}

beforeEach(() => {
  resetTables()
  idCounter = 0
})

// ── tests ──────────────────────────────────────────────────────────────

describe("startTaskEmailProduction", () => {
  it("retorna no_workspace_target para task sem slug mapeado", async () => {
    const { startTaskEmailProduction } = await import("./email-task-sync.service")
    seedTask({ id: "t1", slug: "entrada_welcome", status: "pending", storeId: "s1" })
    const r = await startTaskEmailProduction("t1")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("no_workspace_target")
  })

  it("retorna checkbox-only sem criar flow/email", async () => {
    const { startTaskEmailProduction } = await import("./email-task-sync.service")
    seedTask({ id: "t1", slug: "preview_brand_brain", status: "pending", storeId: "s1" })
    const r = await startTaskEmailProduction("t1")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.target.kind).toBe("checkbox-only")
      expect(r.storeId).toBe("s1")
      expect(r.flowId).toBeUndefined()
    }
    expect(tables.email_flows?.rows ?? []).toHaveLength(0)
  })

  it("para piloto 1:1 garante flow + email criados", async () => {
    const { startTaskEmailProduction } = await import("./email-task-sync.service")
    seedTask({ id: "t1", slug: "preview_email_welcome", status: "pending", storeId: "s1" })
    const r = await startTaskEmailProduction("t1")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.flowId).toBeTruthy()
      expect(r.emailId).toBeTruthy()
    }
    expect(tables.email_flows!.rows).toHaveLength(1)
    expect(tables.email_flows!.rows[0].flow_type).toBe("welcome")
    expect(tables.email_flow_emails!.rows).toHaveLength(1)
    expect(tables.email_flow_emails!.rows[0].number).toBe(1)
  })

  it("idempotente: chamar 2x não duplica flow/email", async () => {
    const { startTaskEmailProduction } = await import("./email-task-sync.service")
    seedTask({ id: "t1", slug: "preview_email_carrinho_1", status: "pending", storeId: "s1" })
    await startTaskEmailProduction("t1")
    await startTaskEmailProduction("t1")
    expect(tables.email_flows!.rows).toHaveLength(1)
    expect(tables.email_flow_emails!.rows).toHaveLength(1)
  })

  it("resolve store_id via onboarding quando task não tem direto", async () => {
    const { startTaskEmailProduction } = await import("./email-task-sync.service")
    seedOnboarding("ob1", "store_via_onb")
    seedTask({
      id: "t1",
      slug: "preview_email_welcome",
      status: "pending",
      onboardingId: "ob1",
    })
    const r = await startTaskEmailProduction("t1")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.storeId).toBe("store_via_onb")
  })

  it("para flow 1:N garante todos os emails do flow", async () => {
    const { startTaskEmailProduction } = await import("./email-task-sync.service")
    seedTask({ id: "t1", slug: "flow_winback", status: "pending", storeId: "s1" })
    const r = await startTaskEmailProduction("t1")
    expect(r.ok).toBe(true)
    expect(tables.email_flow_emails!.rows).toHaveLength(3)
    const numbers = tables.email_flow_emails!.rows.map((r) => r.number).sort()
    expect(numbers).toEqual([1, 2, 3])
  })
})

describe("finishTaskOnEmailReady", () => {
  it("piloto 1:1: task in_progress → review", async () => {
    const { finishTaskOnEmailReady } = await import("./email-task-sync.service")
    seedFlow({ id: "f1", storeId: "s1", flowType: "welcome" })
    seedEmail({ id: "e1", flowId: "f1", number: 1, status: "ready" })
    seedTask({ id: "t1", slug: "preview_email_welcome", status: "in_progress", storeId: "s1" })
    await finishTaskOnEmailReady({ flowId: "f1", emailId: "e1" })
    expect(tables.tasks!.rows[0].status).toBe("review")
  })

  it("piloto 1:1 idempotente: se já review, no-op", async () => {
    const { finishTaskOnEmailReady } = await import("./email-task-sync.service")
    seedFlow({ id: "f1", storeId: "s1", flowType: "welcome" })
    seedEmail({ id: "e1", flowId: "f1", number: 1, status: "ready" })
    seedTask({ id: "t1", slug: "preview_email_welcome", status: "review", storeId: "s1" })
    await finishTaskOnEmailReady({ flowId: "f1", emailId: "e1" })
    expect(tables.tasks!.rows[0].status).toBe("review")
  })

  it("flow 1:N: marca sub_item completed sem avançar task quando faltam outros", async () => {
    const { finishTaskOnEmailReady } = await import("./email-task-sync.service")
    seedFlow({ id: "f1", storeId: "s1", flowType: "welcome" })
    seedEmail({ id: "e3", flowId: "f1", number: 3, status: "ready" })
    seedTask({
      id: "t1",
      slug: "flow_welcome",
      status: "in_progress",
      storeId: "s1",
      subItems: Array.from({ length: 8 }, (_, i) => ({
        slug: `welcome_email_${i + 1}`,
      })),
    })
    await finishTaskOnEmailReady({ flowId: "f1", emailId: "e3" })
    const task = tables.tasks!.rows[0]
    expect(task.status).toBe("in_progress")
    const subs = (task.metadata as { sub_items: Array<{ slug: string; completed?: boolean }> }).sub_items
    const target = subs.find((s) => s.slug === "welcome_email_3")
    expect(target?.completed).toBe(true)
    expect(subs.find((s) => s.slug === "welcome_email_1")?.completed).toBeFalsy()
  })

  it("flow 1:N: quando todos sub_items completos, task → review", async () => {
    const { finishTaskOnEmailReady } = await import("./email-task-sync.service")
    seedFlow({ id: "f1", storeId: "s1", flowType: "win_back" })
    seedEmail({ id: "e3", flowId: "f1", number: 3, status: "ready" })
    seedTask({
      id: "t1",
      slug: "flow_winback",
      status: "in_progress",
      storeId: "s1",
      subItems: [
        { slug: "winback_email_1", completed: true },
        { slug: "winback_email_2", completed: true },
        { slug: "winback_email_3" },
      ],
    })
    await finishTaskOnEmailReady({ flowId: "f1", emailId: "e3" })
    expect(tables.tasks!.rows[0].status).toBe("review")
  })

  it("sem task correspondente: no-op sem erro", async () => {
    const { finishTaskOnEmailReady } = await import("./email-task-sync.service")
    seedFlow({ id: "f1", storeId: "s1", flowType: "welcome" })
    seedEmail({ id: "e1", flowId: "f1", number: 1, status: "ready" })
    await expect(
      finishTaskOnEmailReady({ flowId: "f1", emailId: "e1" }),
    ).resolves.toBeUndefined()
  })
})

describe("approveTaskOnEmailApproved", () => {
  it("piloto 1:1: task review → completed", async () => {
    const { approveTaskOnEmailApproved } = await import("./email-task-sync.service")
    seedFlow({ id: "f1", storeId: "s1", flowType: "post_purchase" })
    seedEmail({ id: "e1", flowId: "f1", number: 1, status: "approved" })
    seedTask({ id: "t1", slug: "preview_email_pos_compra", status: "review", storeId: "s1" })
    await approveTaskOnEmailApproved({ flowId: "f1", emailId: "e1" })
    const task = tables.tasks!.rows[0]
    expect(task.status).toBe("completed")
    expect(task.completed_at).toBeTruthy()
  })

  it("piloto 1:1 idempotente: se completed, não revoga", async () => {
    const { approveTaskOnEmailApproved } = await import("./email-task-sync.service")
    seedFlow({ id: "f1", storeId: "s1", flowType: "welcome" })
    seedEmail({ id: "e1", flowId: "f1", number: 1, status: "approved" })
    seedTask({ id: "t1", slug: "preview_email_welcome", status: "completed", storeId: "s1" })
    await approveTaskOnEmailApproved({ flowId: "f1", emailId: "e1" })
    expect(tables.tasks!.rows[0].status).toBe("completed")
  })

  it("flow 1:N: só completa quando TODOS emails approved/live", async () => {
    const { approveTaskOnEmailApproved } = await import("./email-task-sync.service")
    seedFlow({ id: "f1", storeId: "s1", flowType: "win_back" })
    seedEmail({ id: "e1", flowId: "f1", number: 1, status: "approved" })
    seedEmail({ id: "e2", flowId: "f1", number: 2, status: "ready" })
    seedEmail({ id: "e3", flowId: "f1", number: 3, status: "approved" })
    seedTask({
      id: "t1",
      slug: "flow_winback",
      status: "review",
      storeId: "s1",
      subItems: [
        { slug: "winback_email_1", completed: true },
        { slug: "winback_email_2", completed: true },
        { slug: "winback_email_3", completed: true },
      ],
    })
    await approveTaskOnEmailApproved({ flowId: "f1", emailId: "e1" })
    expect(tables.tasks!.rows[0].status).toBe("review")
  })

  it("flow 1:N: quando todos approved/live, task → completed", async () => {
    const { approveTaskOnEmailApproved } = await import("./email-task-sync.service")
    seedFlow({ id: "f1", storeId: "s1", flowType: "win_back" })
    seedEmail({ id: "e1", flowId: "f1", number: 1, status: "approved" })
    seedEmail({ id: "e2", flowId: "f1", number: 2, status: "live" })
    seedEmail({ id: "e3", flowId: "f1", number: 3, status: "approved" })
    seedTask({
      id: "t1",
      slug: "flow_winback",
      status: "review",
      storeId: "s1",
      subItems: [
        { slug: "winback_email_1", completed: true },
        { slug: "winback_email_2", completed: true },
        { slug: "winback_email_3", completed: true },
      ],
    })
    await approveTaskOnEmailApproved({ flowId: "f1", emailId: "e1" })
    expect(tables.tasks!.rows[0].status).toBe("completed")
  })
})
