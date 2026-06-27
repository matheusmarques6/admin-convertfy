import { describe, it, expect, vi, beforeEach } from "vitest"
import { CAMPAIGN_DESIGN_COLUMNS } from "./campaign-design-bootstrap.service"

/**
 * CONTRATO DA FASE 4 — gatilhos (o flip do caminho vivo).
 *
 * (A) approveSuggestion (de ./suggestion-approval.service) passa a INICIAR o
 *     pipeline de design: instancia a etapa `estrutura` para 1 loja piloto
 *     (a primeira marcada 'good' em copy_results.test), mantendo o gate
 *     existente (>=1 piloto 'good'). Seta design_pilot_store_id/design_column_id.
 *
 * (B) attemptCampaignDesignHandoffForTask (de ./campaign-design-trigger.service)
 *     é o dispatcher chamado pelos endpoints (conclusao de task / preenchimento
 *     de deliverable): resolve a task -> campanha -> chama o handoff. Task que
 *     nao for do pipeline de design de campanha = no-op.
 *
 * Mock permissivo (resultados, nao estilo de query) com UPDATE CAS-correto.
 */
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
        op === "eq"
          ? r[k] === v
          : op === "neq"
            ? r[k] !== v
            : Array.isArray(v) && v.includes(r[k]),
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
        const inserted = arr.map((x) => ({ id: x.id ?? `id-${++seq}`, ...x }))
        db[table].push(...inserted)
        return {
          select: () => ({
            single: async () => ({ data: inserted[0], error: null }),
            maybeSingle: async () => ({ data: inserted[0], error: null }),
            then: (r: (v: unknown) => unknown) =>
              r({ data: inserted, error: null }),
          }),
          then: (r: (v: unknown) => unknown) => r({ data: inserted, error: null }),
        }
      },
      update: (patch: Row) => {
        const uf: Array<[string, unknown]> = []
        let captured: Row[] | null = null
        const apply = () => {
          if (captured) return captured
          captured = db[table].filter((r) => uf.every(([k, v]) => r[k] === v))
          for (const r of captured) Object.assign(r, patch)
          return captured
        }
        const u: Record<string, unknown> = {
          eq: (k: string, v: unknown) => (uf.push([k, v]), u),
          select: () => u,
          maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
          single: async () => ({ data: apply()[0] ?? null, error: null }),
          then: (r: (v: unknown) => unknown) => r({ data: apply(), error: null }),
        }
        return u
      },
      delete: () => {
        const df: Array<[string, unknown]> = []
        const d: Record<string, unknown> = {
          eq: (k: string, v: unknown) => (df.push([k, v]), d),
          then: (r: (v: unknown) => unknown) => {
            db[table] = db[table].filter((x) => !df.every(([k, v]) => x[k] === v))
            return r({ data: null, error: null })
          },
        }
        return d
      },
    }
    return chain
  }
  return { db, reset, client: { from } }
})

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => h.client }))

import { approveSuggestion } from "./suggestion-approval.service"
import { attemptCampaignDesignHandoffForTask } from "./campaign-design-trigger.service"

const ORG = "org1"
const SUG = "sug1"
const PIPE = "pipe-campaign"
const colId = (slug: string) => `col-${slug}`

function seedPipeline() {
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
}

function seedSuggestion(overrides?: Record<string, unknown>) {
  h.db.campaign_suggestions.push({
    id: SUG,
    org_id: ORG,
    title: "Campanha X",
    type: "tema",
    status: "suggested",
    targets: [
      { store_id: "sA", store_name: "A" },
      { store_id: "sB", store_name: "B" },
    ],
    copy_results: { test: { sA: { quality: "good" }, sB: { quality: null } } },
    trigger: { label: "L", detail: "D" },
    angle: "angulo",
    channel: "email",
    subject: "assunto",
    email_draft: { subject: "s", preheader: "p", strategy: "strat", blocks: [] },
    confidence: 0.8,
    send_date: null,
    est_revenue: null,
    pipeline_item_id: null,
    design_pipeline_id: null,
    design_column_id: null,
    design_version: 1,
    design_pilot_store_id: null,
    design_task_id: null,
    ...overrides,
  })
}

const camp = () => h.db.campaign_suggestions.find((c) => c.id === SUG)!
const tasksIn = (slug: string, version = 1) =>
  h.db.tasks.filter(
    (t) => t.operational_column_id === colId(slug) && t.version === version,
  )

beforeEach(() => h.reset())

describe("(A) approveSuggestion — inicia o pipeline de design", () => {
  it("aprova e instancia a etapa estrutura para a loja piloto 'good'", async () => {
    seedPipeline()
    seedSuggestion()
    await approveSuggestion({ suggestionId: SUG, orgId: ORG, userId: "u1" })
    expect(camp().status).toBe("approved")
    expect(camp().design_column_id).toBe(colId("estrutura"))
    expect(camp().design_pilot_store_id).toBe("sA")
    expect(tasksIn("estrutura")).toHaveLength(1)
  })

  it("cria o deliverable do Figma na task de estrutura", async () => {
    seedPipeline()
    seedSuggestion()
    await approveSuggestion({ suggestionId: SUG, orgId: ORG, userId: "u1" })
    expect(
      h.db.task_deliverables.some((d) => d.field_slug === "figma_structure_link"),
    ).toBe(true)
  })

  it("mantem o GATE: sem piloto 'good' lanca erro e NAO inicia design", async () => {
    seedPipeline()
    seedSuggestion({ copy_results: { test: { sA: { quality: null } } } })
    await expect(
      approveSuggestion({ suggestionId: SUG, orgId: ORG, userId: "u1" }),
    ).rejects.toBeTruthy()
    expect(camp().design_column_id).toBeNull()
    expect(tasksIn("estrutura")).toHaveLength(0)
  })

  it("idempotente: ja aprovada nao re-instancia a estrutura", async () => {
    seedPipeline()
    seedSuggestion()
    await approveSuggestion({ suggestionId: SUG, orgId: ORG, userId: "u1" })
    await approveSuggestion({ suggestionId: SUG, orgId: ORG, userId: "u1" })
    expect(tasksIn("estrutura")).toHaveLength(1)
  })
})

describe("(B) attemptCampaignDesignHandoffForTask — dispatcher", () => {
  function seedCampaignTaskAt(slug: string, taskStatus: string) {
    seedPipeline()
    seedSuggestion({
      design_pipeline_id: PIPE,
      design_column_id: colId(slug),
      status: "approved",
    })
    const id = `t-${slug}`
    h.db.tasks.push({
      id,
      org_id: ORG,
      source_type: "campaign_suggestion",
      source_id: SUG,
      operational_pipeline_id: PIPE,
      operational_column_id: colId(slug),
      version: 1,
      status: taskStatus,
      assignee_role: "designer",
    })
    return id
  }

  it("task de campanha concluida delega pro handoff (estrutura -> aprovacao)", async () => {
    const taskId = seedCampaignTaskAt("estrutura", "completed")
    h.db.task_deliverables.push({
      id: "d1",
      task_id: taskId,
      field_slug: "figma_structure_link",
      field_label: "Figma",
      field_type: "url",
      required: true,
      value: "https://figma.com/x",
      filled_at: "2026-06-27T00:00:00Z",
    })
    await attemptCampaignDesignHandoffForTask({ taskId, actorId: "u1" })
    expect(camp().design_column_id).toBe(colId("aprovacao"))
  })

  it("nao avanca se o Figma nao foi entregue (delega, mas handoff retorna not_ready)", async () => {
    const taskId = seedCampaignTaskAt("estrutura", "completed")
    h.db.task_deliverables.push({
      id: "d1",
      task_id: taskId,
      field_slug: "figma_structure_link",
      field_label: "Figma",
      field_type: "url",
      required: true,
      value: null,
      filled_at: null,
    })
    await attemptCampaignDesignHandoffForTask({ taskId, actorId: "u1" })
    expect(camp().design_column_id).toBe(colId("estrutura"))
  })

  it("task que NAO e do pipeline de campanha = no-op (nao quebra)", async () => {
    seedPipeline()
    h.db.tasks.push({
      id: "t-onb",
      org_id: ORG,
      source_type: "onboarding",
      source_id: "onb1",
      onboarding_id: "onb1",
      operational_pipeline_id: "pipe-onb",
      operational_column_id: "c-x",
      version: 1,
      status: "completed",
    })
    const res = await attemptCampaignDesignHandoffForTask({
      taskId: "t-onb",
      actorId: "u1",
    })
    expect(res).toBeNull()
  })

  it("task inexistente = no-op (retorna null)", async () => {
    const res = await attemptCampaignDesignHandoffForTask({
      taskId: "fantasma",
      actorId: "u1",
    })
    expect(res).toBeNull()
  })
})
