import { describe, it, expect, vi, beforeEach } from "vitest"
import { CAMPAIGN_DESIGN_COLUMNS } from "./campaign-design-bootstrap.service"

/**
 * CONTRATO DA FASE 9 (gap #3) — ao aprovar, gerar copy de PRODUCAO para TODAS
 * as lojas-alvo da campanha (alem de iniciar o design da loja piloto).
 *
 * approveSuggestion, apos aprovar, dispara `dispatchCampaignCopyToN8n` com
 * mode="production" e storeIds = todas as lojas de `targets`, de forma
 * NON-BLOCKING (uma falha do dispatch nao pode abortar a aprovacao).
 */
const dispatchSpy = vi.fn(
  async (..._args: unknown[]) => ({ jobId: "job1", storesCount: 0 }),
)
vi.mock("./campaign-copy-dispatch.service", () => ({
  dispatchCampaignCopyToN8n: (...args: unknown[]) => dispatchSpy(...args),
}))

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const db: Record<string, Row[]> = {
    operational_pipelines: [],
    operational_pipeline_columns: [],
    campaign_suggestions: [],
    campaign_pipeline_items: [],
    tasks: [],
    task_deliverables: [],
  }
  let seq = 0
  function reset() {
    for (const k of Object.keys(db)) db[k] = []
    seq = 0
  }
  function from(table: string) {
    if (!db[table]) db[table] = []
    const filters: Array<[string, unknown, "eq" | "neq" | "in"]> = []
    const match = (r: Row) =>
      filters.every(([k, v, op]) =>
        op === "eq" ? r[k] === v : op === "neq" ? r[k] !== v : Array.isArray(v) && v.includes(r[k]),
      )
    const rows = () => db[table].filter(match)
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (k: string, v: unknown) => (filters.push([k, v, "eq"]), chain),
      neq: (k: string, v: unknown) => (filters.push([k, v, "neq"]), chain),
      in: (k: string, v: unknown[]) => (filters.push([k, v, "in"]), chain),
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (r: (v: unknown) => unknown) => r({ data: rows(), error: null }),
      insert: (input: Row | Row[]) => {
        const arr = Array.isArray(input) ? input : [input]
        const ins = arr.map((x) => ({ id: x.id ?? `id-${++seq}`, ...x }))
        db[table].push(...ins)
        return {
          select: () => ({ single: async () => ({ data: ins[0], error: null }) }),
          then: (r: (v: unknown) => unknown) => r({ data: ins, error: null }),
        }
      },
      update: (patch: Row) => {
        const uf: Array<[string, unknown]> = []
        let cap: Row[] | null = null
        const apply = () => {
          if (cap) return cap
          cap = db[table].filter((r) => uf.every(([k, v]) => r[k] === v))
          for (const r of cap) Object.assign(r, patch)
          return cap
        }
        const u: Record<string, unknown> = {
          eq: (k: string, v: unknown) => (uf.push([k, v]), u),
          select: () => u,
          maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
          then: (r: (v: unknown) => unknown) => r({ data: apply(), error: null }),
        }
        return u
      },
    }
    return chain
  }
  return { db, reset, client: { from } }
})

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => h.client }))

import { approveSuggestion } from "./suggestion-approval.service"

const ORG = "org1"
const SUG = "sug1"
const PIPE = "pipe-campaign"
const colId = (slug: string) => `col-${slug}`

function seed() {
  h.db.operational_pipelines.push({
    id: PIPE,
    org_id: ORG,
    type: "campaign_design",
    slug: "campaign_design",
    is_active: true,
  })
  for (const c of CAMPAIGN_DESIGN_COLUMNS) {
    h.db.operational_pipeline_columns.push({
      id: colId(c.slug),
      pipeline_id: PIPE,
      name: c.name,
      slug: c.slug,
      position: c.position,
      default_assignee_role: c.default_assignee_role,
      sla_hours: c.sla_hours,
      checklist_template: c.checklist_template,
      deliverables_template: c.deliverables_template,
    })
  }
  h.db.campaign_suggestions.push({
    id: SUG,
    org_id: ORG,
    title: "Camp X",
    type: "tema",
    status: "suggested",
    targets: [
      { store_id: "sA", store_name: "A" },
      { store_id: "sB", store_name: "B" },
      { store_id: "sC", store_name: "C" },
    ],
    copy_results: { test: { sA: { quality: "good" } } },
    trigger: { label: "L", detail: "D" },
    angle: "a",
    channel: "email",
    subject: "s",
    email_draft: { subject: "s", preheader: "p", strategy: "st", blocks: [] },
    confidence: 0.8,
    pipeline_item_id: null,
    design_column_id: null,
    design_version: 1,
    design_pilot_store_id: null,
    design_task_id: null,
  })
}

beforeEach(() => {
  h.reset()
  dispatchSpy.mockClear()
})

describe("Fase 9 (gap #3) — copy de producao para todas as lojas na aprovacao", () => {
  it("dispara dispatchCampaignCopyToN8n com mode=production e TODAS as lojas", async () => {
    seed()
    await approveSuggestion({ suggestionId: SUG, orgId: ORG, userId: "u1" })
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    const arg = dispatchSpy.mock.calls[0][0] as {
      suggestionId: string
      orgId: string
      mode: string
      storeIds: string[]
    }
    expect(arg.suggestionId).toBe(SUG)
    expect(arg.mode).toBe("production")
    expect([...arg.storeIds].sort()).toEqual(["sA", "sB", "sC"])
  })

  it("non-blocking: se o dispatch falhar, a aprovacao ainda conclui", async () => {
    seed()
    dispatchSpy.mockRejectedValueOnce(new Error("n8n down"))
    const res = await approveSuggestion({ suggestionId: SUG, orgId: ORG, userId: "u1" })
    expect(res.pipeline_item_id).toBeTruthy()
    const camp = h.db.campaign_suggestions.find((c) => c.id === SUG)!
    expect(camp.status).toBe("approved")
  })

  it("nao dispara copy quando barrada pelo gate (sem copy de teste gerada)", async () => {
    seed()
    const camp = h.db.campaign_suggestions.find((c) => c.id === SUG)!
    camp.copy_results = { test: {} }
    await expect(
      approveSuggestion({ suggestionId: SUG, orgId: ORG, userId: "u1" }),
    ).rejects.toBeTruthy()
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it("aprova e dispara copy mesmo SEM loja marcada 'good'", async () => {
    seed()
    const camp = h.db.campaign_suggestions.find((c) => c.id === SUG)!
    camp.copy_results = { test: { sA: { quality: null }, sB: { quality: null } } }
    await approveSuggestion({ suggestionId: SUG, orgId: ORG, userId: "u1" })
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect(camp.status).toBe("approved")
  })

  it("idempotente: ja-aprovada nao re-dispara copy", async () => {
    seed()
    await approveSuggestion({ suggestionId: SUG, orgId: ORG, userId: "u1" })
    dispatchSpy.mockClear()
    await approveSuggestion({ suggestionId: SUG, orgId: ORG, userId: "u1" })
    expect(dispatchSpy).not.toHaveBeenCalled()
  })
})
