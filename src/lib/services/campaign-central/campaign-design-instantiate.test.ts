import { describe, it, expect, vi, beforeEach } from "vitest"
import { CAMPAIGN_DESIGN_COLUMNS } from "./campaign-design-bootstrap.service"

/**
 * CONTRATO DA FASE 2 — instantiateCampaignStage.
 *
 * Cria as tasks de uma etapa do pipeline de design de campanha a partir do
 * template da coluna, espelhando as convencoes do onboarding (1 task por item
 * de checklist; deliverables na task ancora; idempotencia por coluna+versao).
 *
 * O mock e PERMISSIVO quanto ao estilo de query (suporta select/eq/in/neq/
 * order/limit/maybeSingle/single/insert/update/delete) e o teste asserta
 * RESULTADOS (estado do banco), dando liberdade ao implementador no "como".
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
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: rows(), error: null }),
      insert: (input: Row | Row[]) => {
        const arr = Array.isArray(input) ? input : [input]
        const inserted = arr.map((r) => ({ id: r.id ?? `id-${++seq}`, ...r }))
        db[table].push(...inserted)
        const res = {
          select: () => ({
            single: async () => ({ data: inserted[0], error: null }),
            maybeSingle: async () => ({ data: inserted[0], error: null }),
            then: (resolve: (v: unknown) => unknown) =>
              resolve({ data: inserted, error: null }),
          }),
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: inserted, error: null }),
        }
        return res
      },
      update: (patch: Row) => {
        const uf: Array<[string, unknown]> = []
        const uchain: Record<string, unknown> = {
          eq: (k: string, v: unknown) => (uf.push([k, v]), uchain),
          select: () => uchain,
          maybeSingle: async () => {
            applyUpdate()
            return { data: rows()[0] ?? null, error: null }
          },
          then: (resolve: (v: unknown) => unknown) => {
            applyUpdate()
            return resolve({ data: null, error: null })
          },
        }
        function applyUpdate() {
          for (const r of db[table]) {
            if (uf.every(([k, v]) => r[k] === v)) Object.assign(r, patch)
          }
        }
        return uchain
      },
      delete: () => {
        const df: Array<[string, unknown]> = []
        const dchain: Record<string, unknown> = {
          eq: (k: string, v: unknown) => (df.push([k, v]), dchain),
          then: (resolve: (v: unknown) => unknown) => {
            db[table] = db[table].filter(
              (r) => !df.every(([k, v]) => r[k] === v),
            )
            return resolve({ data: null, error: null })
          },
        }
        return dchain
      },
    }
    return chain
  }
  return { db, reset, client: { from } }
})

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => h.client }))

import { instantiateCampaignStage } from "./campaign-design-instantiate.service"

const ORG = "org1"
const SUG = "sug1"
const PIPE = "pipe-campaign"

function colId(slug: string) {
  return `col-${slug}`
}

function seedPipelineAndCampaign(opts?: {
  designVersion?: number
  targets?: Array<{ store_id: string; store_name: string }>
}) {
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
    design_version: opts?.designVersion ?? 1,
    design_column_id: null,
    design_pipeline_id: null,
    targets: opts?.targets ?? [
      { store_id: "store-a", store_name: "Loja A" },
      { store_id: "store-b", store_name: "Loja B" },
    ],
  })
}

function tasksInColumn(slug: string) {
  return h.db.tasks.filter((t) => t.operational_column_id === colId(slug))
}

beforeEach(() => h.reset())

describe("instantiateCampaignStage — Fase 2", () => {
  it("estrutura: cria EXATAMENTE 1 task (1 loja piloto) com role designer", async () => {
    seedPipelineAndCampaign()
    const res = await instantiateCampaignStage({
      suggestionId: SUG,
      orgId: ORG,
      stageSlug: "estrutura",
      pilotStoreId: "store-a",
      createdBy: "u1",
    })
    const tasks = tasksInColumn("estrutura")
    expect(tasks).toHaveLength(1)
    expect(res.taskIds).toHaveLength(1)
    const t = tasks[0]
    expect(t.org_id).toBe(ORG)
    expect(t.source_type).toBe("campaign_suggestion")
    expect(t.source_id).toBe(SUG)
    expect(t.operational_pipeline_id).toBe(PIPE)
    expect(t.assignee_role).toBe("designer")
    expect(t.version).toBe(1)
  })

  it("estrutura: cria o deliverable do Figma (required) na task ancora", async () => {
    seedPipelineAndCampaign()
    await instantiateCampaignStage({
      suggestionId: SUG,
      orgId: ORG,
      stageSlug: "estrutura",
      pilotStoreId: "store-a",
    })
    const figma = h.db.task_deliverables.find(
      (d) => d.field_slug === "figma_structure_link",
    )
    expect(figma).toBeTruthy()
    expect(figma?.required).toBe(true)
  })

  it("estrutura: marca a loja piloto na campanha (design_pilot_store_id)", async () => {
    seedPipelineAndCampaign()
    await instantiateCampaignStage({
      suggestionId: SUG,
      orgId: ORG,
      stageSlug: "estrutura",
      pilotStoreId: "store-a",
    })
    const camp = h.db.campaign_suggestions.find((c) => c.id === SUG)
    expect(camp?.design_pilot_store_id).toBe("store-a")
  })

  it("estrutura: seta design_column_id e design_pipeline_id na campanha", async () => {
    seedPipelineAndCampaign()
    await instantiateCampaignStage({
      suggestionId: SUG,
      orgId: ORG,
      stageSlug: "estrutura",
      pilotStoreId: "store-a",
    })
    const camp = h.db.campaign_suggestions.find((c) => c.id === SUG)
    expect(camp?.design_column_id).toBe(colId("estrutura"))
    expect(camp?.design_pipeline_id).toBe(PIPE)
  })

  it("producao: cria EXATAMENTE 3 tasks (imagens, textos, identidade)", async () => {
    seedPipelineAndCampaign()
    await instantiateCampaignStage({
      suggestionId: SUG,
      orgId: ORG,
      stageSlug: "producao",
    })
    const tasks = tasksInColumn("producao")
    expect(tasks).toHaveLength(3)
    expect(tasks.every((t) => t.assignee_role === "designer")).toBe(true)
  })

  it("finalizacao: cria 1 task por loja-alvo da campanha", async () => {
    seedPipelineAndCampaign({
      targets: [
        { store_id: "s1", store_name: "S1" },
        { store_id: "s2", store_name: "S2" },
        { store_id: "s3", store_name: "S3" },
      ],
    })
    await instantiateCampaignStage({
      suggestionId: SUG,
      orgId: ORG,
      stageSlug: "finalizacao",
    })
    expect(tasksInColumn("finalizacao")).toHaveLength(3)
  })

  it("IDEMPOTENTE: 2 chamadas na mesma etapa+versao nao duplicam tasks", async () => {
    seedPipelineAndCampaign()
    await instantiateCampaignStage({
      suggestionId: SUG,
      orgId: ORG,
      stageSlug: "producao",
    })
    await instantiateCampaignStage({
      suggestionId: SUG,
      orgId: ORG,
      stageSlug: "producao",
    })
    expect(tasksInColumn("producao")).toHaveLength(3)
  })

  it("respeita design_version: tasks nascem com a versao atual da campanha", async () => {
    seedPipelineAndCampaign({ designVersion: 2 })
    await instantiateCampaignStage({
      suggestionId: SUG,
      orgId: ORG,
      stageSlug: "estrutura",
      pilotStoreId: "store-a",
    })
    expect(tasksInColumn("estrutura")[0].version).toBe(2)
  })
})
