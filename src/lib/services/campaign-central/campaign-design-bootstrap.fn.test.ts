import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock write-capable do admin client (insert/update/select/eq/maybeSingle/single)
// para testar a FUNCAO ensureCampaignDesignPipeline de verdade (idempotencia +
// mapeamento dos inserts), nao so o seed.
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const db: Record<string, Row[]> = {
    operational_pipelines: [],
    operational_pipeline_columns: [],
  }
  let seq = 0
  function reset() {
    db.operational_pipelines = []
    db.operational_pipeline_columns = []
    seq = 0
  }
  function from(table: string) {
    const filters: Array<[string, unknown]> = []
    const rows = () =>
      (db[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v))
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (k: string, v: unknown) => {
        filters.push([k, v])
        return chain
      },
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
          }),
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: inserted, error: null }),
        }
      },
      update: (patch: Row) => {
        const uf: Array<[string, unknown]> = []
        const uchain: Record<string, unknown> = {
          eq: (k: string, v: unknown) => {
            uf.push([k, v])
            return uchain
          },
          then: (resolve: (v: unknown) => unknown) => {
            for (const r of db[table]) {
              if (uf.every(([k, v]) => r[k] === v)) Object.assign(r, patch)
            }
            return resolve({ data: null, error: null })
          },
        }
        return uchain
      },
    }
    return chain
  }
  return { db, reset, client: { from } }
})

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => h.client,
}))

import {
  ensureCampaignDesignPipeline,
  CAMPAIGN_DESIGN_COLUMNS,
} from "./campaign-design-bootstrap.service"

beforeEach(() => h.reset())

describe("ensureCampaignDesignPipeline — funcao real", () => {
  it("cria 1 pipeline + 4 colunas e retorna columnsBySlug", async () => {
    const result = await ensureCampaignDesignPipeline("org1", "user1")

    expect(h.db.operational_pipelines).toHaveLength(1)
    expect(h.db.operational_pipelines[0]).toMatchObject({
      org_id: "org1",
      type: "campaign_design",
      slug: "campaign_design",
    })
    expect(h.db.operational_pipeline_columns).toHaveLength(4)
    expect(Object.keys(result.columnsBySlug).sort()).toEqual([
      "aprovacao",
      "estrutura",
      "finalizacao",
      "producao",
    ])
  })

  it("mapeia default_assignee_role corretamente em cada coluna inserida", async () => {
    await ensureCampaignDesignPipeline("org1", "user1")
    for (const seed of CAMPAIGN_DESIGN_COLUMNS) {
      const inserted = h.db.operational_pipeline_columns.find(
        (c) => c.slug === seed.slug,
      )
      expect(inserted?.default_assignee_role).toBe(seed.default_assignee_role)
    }
  })

  it("IDEMPOTENTE: segunda chamada nao duplica pipeline nem colunas", async () => {
    const first = await ensureCampaignDesignPipeline("org1", "user1")
    const second = await ensureCampaignDesignPipeline("org1", "user1")

    expect(h.db.operational_pipelines).toHaveLength(1)
    expect(h.db.operational_pipeline_columns).toHaveLength(4)
    expect(second.pipelineId).toBe(first.pipelineId)
    expect(second.columnsBySlug).toEqual(first.columnsBySlug)
  })

  it("orgs diferentes tem pipelines separados", async () => {
    await ensureCampaignDesignPipeline("org1", "user1")
    await ensureCampaignDesignPipeline("org2", "user1")
    expect(h.db.operational_pipelines).toHaveLength(2)
    expect(h.db.operational_pipeline_columns).toHaveLength(8)
  })
})
