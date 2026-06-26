import { describe, it, expect, beforeEach, vi } from "vitest"

// ── In-memory Supabase admin mock ─────────────────────────────────────────
// Generic store keyed by table name. Supports the chain operations exercised
// by attemptOnboardingHandoff + ensureColumnTasks (select/eq/neq/in/order/
// limit/is/maybeSingle, update().select().maybeSingle(), insert, thenable).
type Row = Record<string, unknown>
const store: Record<string, Row[]> = {}

function tableRows(name: string): Row[] {
  store[name] ??= []
  return store[name]
}

let idSeq = 0
function nextId(prefix: string): string {
  idSeq += 1
  return `${prefix}-${idSeq}`
}

function buildQuery(name: string) {
  const eqs: Array<[string, unknown]> = []
  const neqs: Array<[string, unknown]> = []
  let inFilter: { col: string; values: unknown[] } | null = null
  let orderSpec: { col: string; asc: boolean } | null = null
  let limitN: number | null = null
  let op: "select" | "update" | "insert" | "upsert" = "select"
  let patch: Row | null = null
  let insertPayload: Row | Row[] | null = null

  function applyFilters(rows: Row[]): Row[] {
    let r = rows.filter((row) => eqs.every(([k, v]) => row[k] === v))
    r = r.filter((row) => neqs.every(([k, v]) => row[k] !== v))
    if (inFilter) {
      const f = inFilter
      r = r.filter((row) => f.values.includes(row[f.col]))
    }
    return r
  }

  function run(): Row[] {
    const rows = tableRows(name)
    if (op === "insert" || op === "upsert") {
      const payload = Array.isArray(insertPayload)
        ? insertPayload
        : [insertPayload as Row]
      const added = payload.map((x) => ({
        id: (x.id as string) ?? nextId(name),
        ...x,
      }))
      rows.push(...added)
      return added
    }
    let matched = applyFilters(rows)
    if (op === "update") {
      for (const row of matched) Object.assign(row, patch)
      return matched
    }
    if (orderSpec) {
      const s = orderSpec
      matched = [...matched].sort((a, b) => {
        const av = a[s.col] as number
        const bv = b[s.col] as number
        return s.asc ? av - bv : bv - av
      })
    }
    if (limitN != null) matched = matched.slice(0, limitN)
    return matched
  }

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (k: string, v: unknown) => {
      eqs.push([k, v])
      return chain
    },
    neq: (k: string, v: unknown) => {
      neqs.push([k, v])
      return chain
    },
    is: (k: string, v: unknown) => {
      eqs.push([k, v])
      return chain
    },
    in: (col: string, values: unknown[]) => {
      inFilter = { col, values }
      return chain
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      orderSpec = { col, asc: opts?.ascending !== false }
      return chain
    },
    limit: (n: number) => {
      limitN = n
      return chain
    },
    update: (p: Row) => {
      op = "update"
      patch = p
      return chain
    },
    insert: (p: Row | Row[]) => {
      op = "insert"
      insertPayload = p
      return chain
    },
    upsert: (p: Row | Row[]) => {
      op = "upsert"
      insertPayload = p
      return chain
    },
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: run(), error: null }),
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
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}))

import { reconcileStuckHandoffs } from "./onboarding-task-completion.service"

function seedFixture() {
  for (const k of Object.keys(store)) delete store[k]
  idSeq = 0

  store["operational_pipeline_columns"] = [
    {
      id: "colA",
      pipeline_id: "pipe1",
      name: "Preview Producao",
      slug: "preview_producao",
      position: 0,
      is_final: false,
      deliverables_template: null,
      checklist_template: [{ id: "a1", label: "Item A", order: 0 }],
      default_assignee_role: null,
      sla_hours: 24,
      color: null,
    },
    {
      id: "colB",
      pipeline_id: "pipe1",
      name: "Emails Iniciais",
      slug: "emails_iniciais",
      position: 1,
      is_final: false,
      deliverables_template: null,
      checklist_template: [{ id: "b1", label: "Item B", order: 0 }],
      default_assignee_role: null,
      sla_hours: 24,
      color: null,
    },
  ]

  store["onboardings"] = [
    {
      id: "onb1",
      org_id: "org1",
      pipeline_id: "pipe1",
      current_column_id: "colA",
      current_version: 1,
      status: "in_progress",
    },
  ]

  // Etapa A com TODAS as tasks completed, porém o onboarding NÃO avançou
  // (janela de corrida): exatamente o cenário que o reconciliador recupera.
  store["tasks"] = [
    {
      id: "taskA",
      onboarding_id: "onb1",
      operational_column_id: "colA",
      version: 1,
      status: "completed",
      metadata: {},
    },
  ]

  store["task_deliverables"] = []
  store["events"] = []
  // Mantém notifyResponsibleRole como no-op (sem membros com a função).
  store["org_member_roles"] = []
  store["notifications"] = []
}

describe("reconcileStuckHandoffs", () => {
  beforeEach(() => seedFixture())

  it("dispara o handoff para uma etapa concluída mas não avançada", async () => {
    const result = await reconcileStuckHandoffs()

    expect(result.scanned).toBe(1)
    expect(result.advanced).toBe(1)
    expect(result.completed).toBe(0)
    expect(result.failed).toBe(0)

    // O onboarding avançou de colA → colB.
    const onb = store["onboardings"][0]
    expect(onb.current_column_id).toBe("colB")

    // Exatamente 1 evento de mudança de coluna foi emitido.
    const columnChanges = store["events"].filter(
      (e) => e.event_type === "onboarding.column_changed",
    )
    expect(columnChanges).toHaveLength(1)

    // Tasks da nova etapa foram instanciadas (pending) sem duplicar a anterior.
    const colBTasks = store["tasks"].filter(
      (t) => t.operational_column_id === "colB",
    )
    expect(colBTasks.length).toBeGreaterThan(0)
    expect(colBTasks.every((t) => t.status === "pending")).toBe(true)
  })

  it("é idempotente: a segunda passagem não avança nem duplica eventos/tasks", async () => {
    await reconcileStuckHandoffs()
    const eventsAfterFirst = store["events"].length
    const tasksAfterFirst = store["tasks"].length

    const second = await reconcileStuckHandoffs()

    // Nada avança na segunda passagem (etapa colB ainda tem task pending).
    expect(second.scanned).toBe(1)
    expect(second.advanced).toBe(0)
    expect(second.completed).toBe(0)
    expect(second.failed).toBe(0)

    expect(store["onboardings"][0].current_column_id).toBe("colB")
    expect(store["events"].length).toBe(eventsAfterFirst)
    expect(store["tasks"].length).toBe(tasksAfterFirst)
  })
})
