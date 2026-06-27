import { describe, it, expect, vi, beforeEach } from "vitest"
import { CAMPAIGN_DESIGN_COLUMNS } from "./campaign-design-bootstrap.service"

/**
 * CONTRATO DA FASE 3 — orquestrador de handoff do pipeline de design.
 *
 * Funcoes esperadas (de ./campaign-design-handoff.service):
 *
 *   attemptCampaignDesignHandoff({ suggestionId, orgId, actorId })
 *     -> "advanced" | "not_ready" | "awaiting_decision" | "completed" | "no_design"
 *     - estrutura: avanca p/ aprovacao SE a task estrutura concluida E o
 *       deliverable Figma (required) preenchido. Senao "not_ready".
 *     - aprovacao: NUNCA auto-avanca -> "awaiting_decision".
 *     - producao: avanca p/ finalizacao SE as 3 tasks concluidas. Senao "not_ready".
 *     - finalizacao: SE todas as tasks por loja concluidas -> "completed".
 *
 *   approveCampaignDesign({ suggestionId, orgId, actorId })
 *     -> "advanced" | "not_applicable"   (aprovacao -> producao)
 *
 *   requestCampaignDesignChanges({ suggestionId, orgId, actorId })
 *     -> "reworked" | "not_applicable"   (aprovacao -> estrutura, design_version++)
 *
 * O mock e PERMISSIVO quanto ao estilo de query e suporta UPDATE condicional
 * (CAS): captura as linhas que casam ANTES de aplicar o patch (como o Postgres
 * RETURNING). O teste asserta ESTADO DO BANCO, dando liberdade ao implementador.
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
        return {
          select: () => ({
            single: async () => ({ data: inserted[0], error: null }),
            maybeSingle: async () => ({ data: inserted[0], error: null }),
            then: (resolve: (v: unknown) => unknown) =>
              resolve({ data: inserted, error: null }),
          }),
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: inserted, error: null }),
        }
      },
      update: (patch: Row) => {
        const uf: Array<[string, unknown]> = []
        let captured: Row[] | null = null
        // CAS-correto: casa as linhas ANTES de aplicar o patch.
        const apply = () => {
          if (captured) return captured
          captured = db[table].filter((r) => uf.every(([k, v]) => r[k] === v))
          for (const r of captured) Object.assign(r, patch)
          return captured
        }
        const uchain: Record<string, unknown> = {
          eq: (k: string, v: unknown) => (uf.push([k, v]), uchain),
          select: () => uchain,
          maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
          single: async () => ({ data: apply()[0] ?? null, error: null }),
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: apply(), error: null }),
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

import {
  attemptCampaignDesignHandoff,
  approveCampaignDesign,
  requestCampaignDesignChanges,
} from "./campaign-design-handoff.service"

const ORG = "org1"
const SUG = "sug1"
const PIPE = "pipe-campaign"
const colId = (slug: string) => `col-${slug}`

function seedBase(designStageSlug: string | null, designVersion = 1) {
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
    design_column_id: designStageSlug ? colId(designStageSlug) : null,
    design_version: designVersion,
    design_pilot_store_id: "store-a",
    targets: [
      { store_id: "store-a", store_name: "A" },
      { store_id: "store-b", store_name: "B" },
    ],
  })
}

function addTask(slug: string, status: string, version = 1) {
  const id = `task-${slug}-${h.db.tasks.length}`
  h.db.tasks.push({
    id,
    org_id: ORG,
    source_type: "campaign_suggestion",
    source_id: SUG,
    operational_pipeline_id: PIPE,
    operational_column_id: colId(slug),
    version,
    status,
    assignee_role: "designer",
  })
  return id
}

function addFigmaDeliverable(taskId: string, filled: boolean) {
  h.db.task_deliverables.push({
    id: `del-${h.db.task_deliverables.length}`,
    task_id: taskId,
    field_slug: "figma_structure_link",
    field_label: "Link do Figma",
    field_type: "url",
    required: true,
    value: filled ? "https://figma.com/x" : null,
    filled_at: filled ? "2026-06-27T00:00:00Z" : null,
  })
}

const camp = () => h.db.campaign_suggestions.find((c) => c.id === SUG)!
const tasksIn = (slug: string, version = 1) =>
  h.db.tasks.filter(
    (t) => t.operational_column_id === colId(slug) && t.version === version,
  )

beforeEach(() => h.reset())

describe("attemptCampaignDesignHandoff — estrutura", () => {
  it("avanca p/ aprovacao quando task concluida E Figma entregue", async () => {
    seedBase("estrutura")
    const t = addTask("estrutura", "completed")
    addFigmaDeliverable(t, true)
    const status = await attemptCampaignDesignHandoff({
      suggestionId: SUG,
      orgId: ORG,
      actorId: "u1",
    })
    expect(status).toBe("advanced")
    expect(camp().design_column_id).toBe(colId("aprovacao"))
    expect(tasksIn("aprovacao").length).toBeGreaterThanOrEqual(1)
  })

  it("NAO avanca se o Figma nao foi entregue (deliverable required vazio)", async () => {
    seedBase("estrutura")
    const t = addTask("estrutura", "completed")
    addFigmaDeliverable(t, false)
    const status = await attemptCampaignDesignHandoff({
      suggestionId: SUG,
      orgId: ORG,
      actorId: "u1",
    })
    expect(status).toBe("not_ready")
    expect(camp().design_column_id).toBe(colId("estrutura"))
    expect(tasksIn("aprovacao")).toHaveLength(0)
  })

  it("NAO avanca se a task da estrutura nao esta concluida", async () => {
    seedBase("estrutura")
    const t = addTask("estrutura", "pending")
    addFigmaDeliverable(t, true)
    const status = await attemptCampaignDesignHandoff({
      suggestionId: SUG,
      orgId: ORG,
      actorId: "u1",
    })
    expect(status).toBe("not_ready")
    expect(camp().design_column_id).toBe(colId("estrutura"))
  })

  it("re-entrada sequencial: 2 chamadas nao avancam duas vezes", async () => {
    seedBase("estrutura")
    const t = addTask("estrutura", "completed")
    addFigmaDeliverable(t, true)
    await attemptCampaignDesignHandoff({ suggestionId: SUG, orgId: ORG, actorId: "u1" })
    const second = await attemptCampaignDesignHandoff({ suggestionId: SUG, orgId: ORG, actorId: "u1" })
    // ja esta em aprovacao -> awaiting_decision, sem duplicar
    expect(second).toBe("awaiting_decision")
    expect(camp().design_column_id).toBe(colId("aprovacao"))
    expect(tasksIn("aprovacao").length).toBe(
      CAMPAIGN_DESIGN_COLUMNS.find((c) => c.slug === "aprovacao")!
        .checklist_template.length,
    )
  })
})

describe("aprovacao — decisao do COO", () => {
  it("attemptHandoff NUNCA auto-avanca a aprovacao", async () => {
    seedBase("aprovacao")
    addTask("aprovacao", "completed")
    const status = await attemptCampaignDesignHandoff({
      suggestionId: SUG,
      orgId: ORG,
      actorId: "u1",
    })
    expect(status).toBe("awaiting_decision")
    expect(camp().design_column_id).toBe(colId("aprovacao"))
  })

  it("approveCampaignDesign: aprovacao -> producao (cria as 3 tasks)", async () => {
    seedBase("aprovacao")
    const status = await approveCampaignDesign({
      suggestionId: SUG,
      orgId: ORG,
      actorId: "coo1",
    })
    expect(status).toBe("advanced")
    expect(camp().design_column_id).toBe(colId("producao"))
    expect(tasksIn("producao")).toHaveLength(3)
  })

  it("requestCampaignDesignChanges: version++ e volta p/ estrutura (nova versao)", async () => {
    seedBase("aprovacao", 1)
    const status = await requestCampaignDesignChanges({
      suggestionId: SUG,
      orgId: ORG,
      actorId: "coo1",
    })
    expect(status).toBe("reworked")
    expect(camp().design_version).toBe(2)
    expect(camp().design_column_id).toBe(colId("estrutura"))
    // nova task de estrutura na versao 2
    expect(tasksIn("estrutura", 2).length).toBeGreaterThanOrEqual(1)
  })

  it("approve/requestChanges fora da aprovacao = not_applicable", async () => {
    seedBase("producao")
    expect(
      await approveCampaignDesign({ suggestionId: SUG, orgId: ORG, actorId: "x" }),
    ).toBe("not_applicable")
    expect(
      await requestCampaignDesignChanges({ suggestionId: SUG, orgId: ORG, actorId: "x" }),
    ).toBe("not_applicable")
  })
})

describe("attemptCampaignDesignHandoff — producao e finalizacao", () => {
  it("producao: avanca p/ finalizacao quando as 3 tasks concluidas", async () => {
    seedBase("producao")
    addTask("producao", "completed")
    addTask("producao", "completed")
    addTask("producao", "completed")
    const status = await attemptCampaignDesignHandoff({
      suggestionId: SUG,
      orgId: ORG,
      actorId: "u1",
    })
    expect(status).toBe("advanced")
    expect(camp().design_column_id).toBe(colId("finalizacao"))
    // 1 task por loja (2 targets)
    expect(tasksIn("finalizacao")).toHaveLength(2)
  })

  it("producao: NAO avanca com 1 task pendente", async () => {
    seedBase("producao")
    addTask("producao", "completed")
    addTask("producao", "completed")
    addTask("producao", "pending")
    const status = await attemptCampaignDesignHandoff({
      suggestionId: SUG,
      orgId: ORG,
      actorId: "u1",
    })
    expect(status).toBe("not_ready")
    expect(camp().design_column_id).toBe(colId("producao"))
  })

  it("finalizacao: todas as tasks por loja concluidas -> completed", async () => {
    seedBase("finalizacao")
    addTask("finalizacao", "completed")
    addTask("finalizacao", "completed")
    const status = await attemptCampaignDesignHandoff({
      suggestionId: SUG,
      orgId: ORG,
      actorId: "u1",
    })
    expect(status).toBe("completed")
  })
})

describe("attemptCampaignDesignHandoff — sem design", () => {
  it("campanha sem design_column_id -> no_design", async () => {
    seedBase(null)
    const status = await attemptCampaignDesignHandoff({
      suggestionId: SUG,
      orgId: ORG,
      actorId: "u1",
    })
    expect(status).toBe("no_design")
  })
})
