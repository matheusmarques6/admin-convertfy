import { describe, it, expect, vi, beforeEach } from "vitest"
import { CAMPAIGN_DESIGN_COLUMNS } from "./campaign-design-bootstrap.service"

/**
 * CONTRATO DA FASE 8 — decisão do COO na etapa de aprovação.
 *
 * decideCampaignDesign({ suggestionId, orgId, userId, decision }) -> string
 *   - decision "approve"         -> approveCampaignDesign (aprovacao -> producao)
 *   - decision "request_changes" -> requestCampaignDesignChanges (version++, volta estrutura)
 *
 * Autorização: só quem PODE acessar a etapa `aprovacao` (coo/admin/dev = bypass)
 * pode decidir. Designer/suporte -> 403. Decisão inválida -> erro.
 */
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const db: Record<string, Row[]> = {
    operational_pipelines: [],
    operational_pipeline_columns: [],
    campaign_suggestions: [],
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

let mockMember:
  | { orgId: string; memberId: string; role: string; roles: string[] }
  | null = null
vi.mock("@/lib/api/onboarding-permissions", () => ({
  getUserOrgRole: async () => mockMember,
}))

import { decideCampaignDesign } from "./campaign-design-decision.service"

const ORG = "org1"
const SUG = "sug1"
const PIPE = "pipe-campaign"
const colId = (slug: string) => `col-${slug}`

function seedAprovacao() {
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
    design_pipeline_id: PIPE,
    design_column_id: colId("aprovacao"),
    design_version: 1,
    design_pilot_store_id: "store-a",
    targets: [{ store_id: "store-a", store_name: "A" }],
  })
}

const camp = () => h.db.campaign_suggestions.find((c) => c.id === SUG)!
const tasksIn = (slug: string, version = 1) =>
  h.db.tasks.filter((t) => t.operational_column_id === colId(slug) && t.version === version)

beforeEach(() => {
  h.reset()
  mockMember = null
})

describe("decideCampaignDesign — Fase 8", () => {
  it("COO approve: aprovacao -> producao", async () => {
    seedAprovacao()
    mockMember = { orgId: ORG, memberId: "m1", role: "coo", roles: ["coo"] }
    const status = await decideCampaignDesign({
      suggestionId: SUG,
      orgId: ORG,
      userId: "u1",
      decision: "approve",
    })
    expect(status).toBe("advanced")
    expect(camp().design_column_id).toBe(colId("producao"))
    expect(tasksIn("producao")).toHaveLength(3)
  })

  it("COO request_changes: version++ e volta p/ estrutura", async () => {
    seedAprovacao()
    mockMember = { orgId: ORG, memberId: "m1", role: "coo", roles: ["coo"] }
    const status = await decideCampaignDesign({
      suggestionId: SUG,
      orgId: ORG,
      userId: "u1",
      decision: "request_changes",
    })
    expect(status).toBe("reworked")
    expect(camp().design_version).toBe(2)
    expect(camp().design_column_id).toBe(colId("estrutura"))
  })

  it("admin (bypass) tambem pode decidir", async () => {
    seedAprovacao()
    mockMember = { orgId: ORG, memberId: "m1", role: "admin", roles: ["admin"] }
    const status = await decideCampaignDesign({
      suggestionId: SUG,
      orgId: ORG,
      userId: "u1",
      decision: "approve",
    })
    expect(status).toBe("advanced")
  })

  it("designer NAO pode decidir (403)", async () => {
    seedAprovacao()
    mockMember = { orgId: ORG, memberId: "m1", role: "designer", roles: ["designer"] }
    await expect(
      decideCampaignDesign({ suggestionId: SUG, orgId: ORG, userId: "u1", decision: "approve" }),
    ).rejects.toMatchObject({ statusCode: 403 })
    // nao avancou
    expect(camp().design_column_id).toBe(colId("aprovacao"))
  })

  it("suporte NAO pode decidir (403)", async () => {
    seedAprovacao()
    mockMember = { orgId: ORG, memberId: "m1", role: "suporte", roles: ["suporte"] }
    await expect(
      decideCampaignDesign({ suggestionId: SUG, orgId: ORG, userId: "u1", decision: "request_changes" }),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it("sem org membership -> 403", async () => {
    seedAprovacao()
    mockMember = null
    await expect(
      decideCampaignDesign({ suggestionId: SUG, orgId: ORG, userId: "u1", decision: "approve" }),
    ).rejects.toBeTruthy()
  })

  it("decisao invalida -> erro", async () => {
    seedAprovacao()
    mockMember = { orgId: ORG, memberId: "m1", role: "coo", roles: ["coo"] }
    await expect(
      decideCampaignDesign({
        suggestionId: SUG,
        orgId: ORG,
        userId: "u1",
        decision: "bogus" as unknown as "approve",
      }),
    ).rejects.toBeTruthy()
  })
})
