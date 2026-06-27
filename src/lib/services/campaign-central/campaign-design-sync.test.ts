import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * CONTRATO DA FASE 6 — sync do sub-estagio de design para o Kanban do
 * Campaign Central (campaign_pipeline_items), para a campanha aparecer "nos
 * dois" lugares com o estado certo.
 *
 * syncCampaignDesignToPipelineItem({ suggestionId, orgId })
 *   -> { stage: string } | null
 *
 * Mapeamento sub-etapa -> stage do Kanban (default; ajustavel):
 *   estrutura | producao -> "design"
 *   aprovacao            -> "review"
 *   finalizacao          -> "ready_to_deploy"
 *
 * Tambem grava o sub-estagio em design_data (design_stage/design_version) pro
 * Campaign Central mostrar o detalhe. Sem design_column_id ou sem
 * pipeline_item_id -> null (no-op).
 */
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const db: Record<string, Row[]> = {
    campaign_suggestions: [],
    campaign_pipeline_items: [],
    operational_pipeline_columns: [],
  }
  let seq = 0
  function reset() {
    for (const k of Object.keys(db)) db[k] = []
    seq = 0
  }
  function from(table: string) {
    if (!db[table]) db[table] = []
    const filters: Array<[string, unknown, "eq" | "in"]> = []
    const match = (r: Row) =>
      filters.every(([k, v, op]) =>
        op === "eq" ? r[k] === v : Array.isArray(v) && v.includes(r[k]),
      )
    const rows = () => db[table].filter(match)
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (k: string, v: unknown) => (filters.push([k, v, "eq"]), chain),
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

import { syncCampaignDesignToPipelineItem } from "./campaign-design-sync.service"

const ORG = "org1"
const SUG = "sug1"
const PIPE_ITEM = "pi1"
const colId = (slug: string) => `col-${slug}`

function seed(designSlug: string | null, designVersion = 1, withItem = true) {
  if (designSlug) {
    h.db.operational_pipeline_columns.push({ id: colId(designSlug), slug: designSlug })
  }
  h.db.campaign_suggestions.push({
    id: SUG,
    org_id: ORG,
    design_column_id: designSlug ? colId(designSlug) : null,
    design_version: designVersion,
    pipeline_item_id: withItem ? PIPE_ITEM : null,
  })
  if (withItem) {
    h.db.campaign_pipeline_items.push({
      id: PIPE_ITEM,
      org_id: ORG,
      stage: "copy_creation",
      design_data: {},
    })
  }
}

const item = () => h.db.campaign_pipeline_items.find((p) => p.id === PIPE_ITEM)
beforeEach(() => h.reset())

describe("syncCampaignDesignToPipelineItem — Fase 6", () => {
  it("estrutura -> stage 'design'", async () => {
    seed("estrutura")
    const res = await syncCampaignDesignToPipelineItem({ suggestionId: SUG, orgId: ORG })
    expect(res?.stage).toBe("design")
    expect(item()?.stage).toBe("design")
  })

  it("aprovacao -> stage 'review'", async () => {
    seed("aprovacao")
    await syncCampaignDesignToPipelineItem({ suggestionId: SUG, orgId: ORG })
    expect(item()?.stage).toBe("review")
  })

  it("producao -> stage 'design'", async () => {
    seed("producao")
    await syncCampaignDesignToPipelineItem({ suggestionId: SUG, orgId: ORG })
    expect(item()?.stage).toBe("design")
  })

  it("finalizacao -> stage 'ready_to_deploy'", async () => {
    seed("finalizacao")
    await syncCampaignDesignToPipelineItem({ suggestionId: SUG, orgId: ORG })
    expect(item()?.stage).toBe("ready_to_deploy")
  })

  it("grava o sub-estagio em design_data (design_stage/design_version)", async () => {
    seed("producao", 2)
    await syncCampaignDesignToPipelineItem({ suggestionId: SUG, orgId: ORG })
    const dd = (item()?.design_data ?? {}) as Record<string, unknown>
    expect(dd.design_stage).toBe("producao")
    expect(dd.design_version).toBe(2)
  })

  it("sem design_column_id -> null (no-op, nao altera o item)", async () => {
    seed(null)
    const res = await syncCampaignDesignToPipelineItem({ suggestionId: SUG, orgId: ORG })
    expect(res).toBeNull()
    expect(item()?.stage).toBe("copy_creation")
  })

  it("sem pipeline_item_id -> null (no-op)", async () => {
    seed("estrutura", 1, false)
    const res = await syncCampaignDesignToPipelineItem({ suggestionId: SUG, orgId: ORG })
    expect(res).toBeNull()
  })
})
