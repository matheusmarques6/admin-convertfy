import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * CONTRATO DA FASE 7 — projeção das campanhas em design como grupos virtuais
 * no board de Projetos (espelha a projeção de onboarding do /api/productivity).
 *
 * listCampaignDesignProjectGroups({ orgId, roles }) -> CampaignDesignGroup[]
 *   - 1 grupo por campanha com design ATIVO (design_column_id != null) cuja
 *     etapa atual a FUNÇÃO do usuário pode acessar (bypass vê todas).
 *   - items = tasks da etapa atual (operational_column_id = design_column_id)
 *     na versão atual (version = design_version), exceto cancelled.
 *   - cada grupo expõe can_work/can_admin/responsible_role/suggestion_id/design_stage.
 */
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const db: Record<string, Row[]> = {
    campaign_suggestions: [],
    operational_pipeline_columns: [],
    tasks: [],
  }
  function reset() {
    for (const k of Object.keys(db)) db[k] = []
  }
  function from(table: string) {
    if (!db[table]) db[table] = []
    const filters: Array<[string, unknown, "eq" | "neq" | "in" | "not_null"]> = []
    const match = (r: Row) =>
      filters.every(([k, v, op]) =>
        op === "eq"
          ? r[k] === v
          : op === "neq"
            ? r[k] !== v
            : op === "not_null"
              ? r[k] !== null && r[k] !== undefined
              : Array.isArray(v) && v.includes(r[k]),
      )
    const rows = () => db[table].filter(match)
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (k: string, v: unknown) => (filters.push([k, v, "eq"]), chain),
      neq: (k: string, v: unknown) => (filters.push([k, v, "neq"]), chain),
      in: (k: string, v: unknown[]) => (filters.push([k, v, "in"]), chain),
      not: (k: string, _op: string, _v: unknown) => (
        filters.push([k, null, "not_null"]), chain
      ),
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (r: (v: unknown) => unknown) => r({ data: rows(), error: null }),
    }
    return chain
  }
  return { db, reset, client: { from } }
})

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => h.client }))

import { listCampaignDesignProjectGroups } from "./campaign-design-board.service"

const ORG = "org1"
const colId = (slug: string) => `col-${slug}`

function seedColumns() {
  for (const slug of ["estrutura", "aprovacao", "producao", "finalizacao"]) {
    h.db.operational_pipeline_columns.push({ id: colId(slug), slug })
  }
}

function seedCampaign(
  sug: string,
  designSlug: string | null,
  designVersion = 1,
  title = "Camp",
) {
  h.db.campaign_suggestions.push({
    id: sug,
    org_id: ORG,
    title,
    design_column_id: designSlug ? colId(designSlug) : null,
    design_version: designVersion,
  })
}

function seedTask(sug: string, slug: string, version: number, status = "pending") {
  h.db.tasks.push({
    id: `t-${sug}-${h.db.tasks.length}`,
    org_id: ORG,
    source_type: "campaign_suggestion",
    source_id: sug,
    operational_column_id: colId(slug),
    version,
    status,
    assignee_role: "designer",
  })
}

beforeEach(() => h.reset())

describe("listCampaignDesignProjectGroups — Fase 7", () => {
  it("designer: inclui campanha em estrutura com suas tasks", async () => {
    seedColumns()
    seedCampaign("s1", "estrutura")
    seedTask("s1", "estrutura", 1)
    const groups = await listCampaignDesignProjectGroups({ orgId: ORG, roles: ["designer"] })
    expect(groups).toHaveLength(1)
    expect(groups[0].suggestion_id).toBe("s1")
    expect(groups[0].items).toHaveLength(1)
    expect(groups[0].can_work).toBe(true)
    expect(groups[0].can_admin).toBe(false)
  })

  it("designer: NAO inclui campanha em aprovacao (etapa do COO)", async () => {
    seedColumns()
    seedCampaign("s1", "aprovacao")
    seedTask("s1", "aprovacao", 1)
    const groups = await listCampaignDesignProjectGroups({ orgId: ORG, roles: ["designer"] })
    expect(groups).toHaveLength(0)
  })

  it("coo/bypass: enxerga campanhas em qualquer etapa", async () => {
    seedColumns()
    seedCampaign("s1", "estrutura")
    seedCampaign("s2", "aprovacao")
    const groups = await listCampaignDesignProjectGroups({ orgId: ORG, roles: ["coo"] })
    expect(groups.map((g) => g.suggestion_id).sort()).toEqual(["s1", "s2"])
    expect(groups.every((g) => g.can_admin)).toBe(true)
  })

  it("filtra items pela versao atual (rework): tasks v1 somem quando design_version=2", async () => {
    seedColumns()
    seedCampaign("s1", "estrutura", 2)
    seedTask("s1", "estrutura", 1) // versao antiga
    seedTask("s1", "estrutura", 2) // versao atual
    const groups = await listCampaignDesignProjectGroups({ orgId: ORG, roles: ["designer"] })
    expect(groups[0].items).toHaveLength(1)
    expect((groups[0].items[0] as { version: number }).version).toBe(2)
  })

  it("filtra items pela coluna atual: tasks de outra coluna nao entram", async () => {
    seedColumns()
    seedCampaign("s1", "producao")
    seedTask("s1", "producao", 1)
    seedTask("s1", "estrutura", 1) // coluna antiga
    const groups = await listCampaignDesignProjectGroups({ orgId: ORG, roles: ["designer"] })
    expect(groups[0].items).toHaveLength(1)
  })

  it("ignora tasks cancelled", async () => {
    seedColumns()
    seedCampaign("s1", "estrutura")
    seedTask("s1", "estrutura", 1, "completed")
    seedTask("s1", "estrutura", 1, "cancelled")
    const groups = await listCampaignDesignProjectGroups({ orgId: ORG, roles: ["designer"] })
    expect(groups[0].items).toHaveLength(1)
  })

  it("campanha sem design ativo (design_column_id null) nao entra", async () => {
    seedColumns()
    seedCampaign("s1", null)
    const groups = await listCampaignDesignProjectGroups({ orgId: ORG, roles: ["coo"] })
    expect(groups).toHaveLength(0)
  })

  it("expoe design_stage e responsible_role do grupo", async () => {
    seedColumns()
    seedCampaign("s1", "producao")
    seedTask("s1", "producao", 1)
    const groups = await listCampaignDesignProjectGroups({ orgId: ORG, roles: ["designer"] })
    expect(groups[0].design_stage).toBe("producao")
    expect(groups[0].responsible_role).toBe("designer")
  })

  it("expoe source_type/stage_name/stage_color/stage_role pro header do board", async () => {
    h.db.operational_pipeline_columns.push({
      id: colId("estrutura"),
      slug: "estrutura",
      name: "Estrutura de design",
      color: "#A855F7",
    })
    seedCampaign("s1", "estrutura")
    seedTask("s1", "estrutura", 1)
    const groups = await listCampaignDesignProjectGroups({ orgId: ORG, roles: ["designer"] })
    expect(groups[0].source_type).toBe("campaign_design")
    expect(groups[0].stage_name).toBe("Estrutura de design")
    expect(groups[0].stage_color).toBe("#A855F7")
    expect(groups[0].stage_role).toBe("designer")
  })
})
