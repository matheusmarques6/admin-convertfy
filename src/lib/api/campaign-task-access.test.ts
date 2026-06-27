import { describe, it, expect, vi, beforeEach } from "vitest"

// Banco em memoria (mesmo padrao de onboarding-task-access.test.ts), agora com
// campaign_suggestions para o pipeline de design de campanha.
type Row = Record<string, unknown>
const db: Record<string, Row[]> = {
  tasks: [],
  campaign_suggestions: [],
  operational_pipeline_columns: [],
  onboardings: [],
}
function resetDb() {
  for (const k of Object.keys(db)) db[k] = []
}
function makeQuery(table: string) {
  const filters: Array<[string, unknown]> = []
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push([col, val])
      return chain
    },
    maybeSingle: async () => {
      const rows = (db[table] ?? []).filter((r) =>
        filters.every(([k, v]) => r[k] === v),
      )
      return { data: rows[0] ?? null, error: null }
    },
  }
  return chain
}
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: (t: string) => makeQuery(t) }),
}))

let mockMember:
  | { orgId: string; memberId: string; role: string; roles: string[] }
  | null = null
vi.mock("@/lib/api/onboarding-permissions", () => ({
  getUserOrgRole: async () => mockMember,
}))

import {
  getTaskAccessContext,
  guardOnboardingTask,
  requireTaskAccess,
} from "./onboarding-task-access"

const ORG = "org1"

function seedCampaignTask(opts: {
  taskColumnId: string
  taskVersion?: number
  designColumnId: string | null
  designVersion?: number
  columnSlug: string
  withPipeline?: boolean // false simula a design task LEGADA (sem pipeline)
}) {
  db.tasks.push({
    id: "ct1",
    org_id: ORG,
    onboarding_id: null,
    source_type: "campaign_suggestion",
    source_id: "camp1",
    operational_pipeline_id: opts.withPipeline === false ? null : "pipe-campaign",
    operational_column_id: opts.taskColumnId,
    version: opts.taskVersion ?? 1,
    status: "pending",
    assignee_role: null,
  })
  db.campaign_suggestions.push({
    id: "camp1",
    org_id: ORG,
    design_column_id: opts.designColumnId,
    design_version: opts.designVersion ?? 1,
  })
  db.operational_pipeline_columns.push({
    id: opts.taskColumnId,
    slug: opts.columnSlug,
  })
  if (opts.designColumnId && opts.designColumnId !== opts.taskColumnId) {
    db.operational_pipeline_columns.push({
      id: opts.designColumnId,
      slug: "outra_etapa",
    })
  }
}

beforeEach(() => {
  resetDb()
  mockMember = null
})

describe("getTaskAccessContext — pipeline de design de campanha", () => {
  it("designer acessa a etapa atual (estrutura)", async () => {
    mockMember = { orgId: ORG, memberId: "m1", role: "designer", roles: ["designer"] }
    seedCampaignTask({
      taskColumnId: "c-estrutura",
      designColumnId: "c-estrutura",
      columnSlug: "estrutura",
    })
    const ctx = await getTaskAccessContext("u1", "ct1")
    expect(ctx?.campaign?.id).toBe("camp1")
    expect(ctx?.onboarding).toBeNull()
    expect(ctx?.isCurrentStage).toBe(true)
    expect(ctx?.canWork).toBe(true)
    expect(ctx?.canAdmin).toBe(false)
  })

  it("designer NAO acessa a etapa de aprovacao (do COO)", async () => {
    mockMember = { orgId: ORG, memberId: "m1", role: "designer", roles: ["designer"] }
    seedCampaignTask({
      taskColumnId: "c-aprov",
      designColumnId: "c-aprov",
      columnSlug: "aprovacao",
    })
    const ctx = await getTaskAccessContext("u1", "ct1")
    expect(ctx?.canRead).toBe(false)
    expect(ctx?.canWork).toBe(false)
  })

  it("COO (bypass) acessa qualquer etapa, incl. aprovacao", async () => {
    mockMember = { orgId: ORG, memberId: "m1", role: "coo", roles: ["coo"] }
    seedCampaignTask({
      taskColumnId: "c-aprov",
      designColumnId: "c-aprov",
      columnSlug: "aprovacao",
    })
    const ctx = await getTaskAccessContext("u1", "ct1")
    expect(ctx?.canWork).toBe(true)
    expect(ctx?.canAdmin).toBe(true)
  })

  it("suporte nao enxerga o pipeline de campanha", async () => {
    mockMember = { orgId: ORG, memberId: "m1", role: "suporte", roles: ["suporte"] }
    seedCampaignTask({
      taskColumnId: "c-estrutura",
      designColumnId: "c-estrutura",
      columnSlug: "estrutura",
    })
    const ctx = await getTaskAccessContext("u1", "ct1")
    expect(ctx?.canRead).toBe(false)
  })

  it("mudanca de etapa: designer perde a task quando a campanha avanca de coluna", async () => {
    mockMember = { orgId: ORG, memberId: "m1", role: "designer", roles: ["designer"] }
    // Task ficou na coluna estrutura, mas a campanha ja avancou pra producao.
    seedCampaignTask({
      taskColumnId: "c-estrutura",
      designColumnId: "c-producao",
      columnSlug: "estrutura",
    })
    const ctx = await getTaskAccessContext("u1", "ct1")
    expect(ctx?.isCurrentStage).toBe(false)
    expect(ctx?.canRead).toBe(false)
  })

  it("versionamento: task de versao antiga (v1) some quando design_version=2", async () => {
    mockMember = { orgId: ORG, memberId: "m1", role: "designer", roles: ["designer"] }
    seedCampaignTask({
      taskColumnId: "c-estrutura",
      taskVersion: 1,
      designColumnId: "c-estrutura",
      designVersion: 2,
      columnSlug: "estrutura",
    })
    const ctx = await getTaskAccessContext("u1", "ct1")
    expect(ctx?.isCurrentStage).toBe(false)
    expect(ctx?.canRead).toBe(false)
  })

  it("GUARDA ARQUITETURAL: design task LEGADA (sem pipeline) cai como task comum", async () => {
    // source_type=campaign_suggestion mas SEM operational_pipeline_id -> nao e
    // tratada como pipeline de campanha; segue a regra de task comum
    // (assignee_role null = qualquer membro trabalha).
    mockMember = { orgId: ORG, memberId: "m1", role: "designer", roles: ["designer"] }
    seedCampaignTask({
      taskColumnId: "c-estrutura",
      designColumnId: "c-estrutura",
      columnSlug: "estrutura",
      withPipeline: false,
    })
    const ctx = await getTaskAccessContext("u1", "ct1")
    expect(ctx?.campaign).toBeNull()
    expect(ctx?.onboarding).toBeNull()
    expect(ctx?.canWork).toBe(true) // task comum, role null
  })
})

describe("guardOnboardingTask — gateia campanha (e nao quebra task comum)", () => {
  it("campanha: esconde (404) de quem nao tem a funcao da etapa", async () => {
    mockMember = { orgId: ORG, memberId: "m1", role: "suporte", roles: ["suporte"] }
    seedCampaignTask({
      taskColumnId: "c-estrutura",
      designColumnId: "c-estrutura",
      columnSlug: "estrutura",
    })
    await expect(guardOnboardingTask("u1", "ct1", "read")).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it("campanha: designer trabalha (work) mas admin e so bypass (403)", async () => {
    mockMember = { orgId: ORG, memberId: "m1", role: "designer", roles: ["designer"] }
    seedCampaignTask({
      taskColumnId: "c-estrutura",
      designColumnId: "c-estrutura",
      columnSlug: "estrutura",
    })
    await expect(guardOnboardingTask("u1", "ct1", "work")).resolves.toBeTruthy()
    await expect(guardOnboardingTask("u1", "ct1", "admin")).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it("design task LEGADA (comum) NAO e restringida pelo gate", async () => {
    mockMember = { orgId: ORG, memberId: "m1", role: "suporte", roles: ["suporte"] }
    seedCampaignTask({
      taskColumnId: "c-estrutura",
      designColumnId: "c-estrutura",
      columnSlug: "estrutura",
      withPipeline: false,
    })
    await expect(guardOnboardingTask("u1", "ct1", "work")).resolves.toBeTruthy()
  })
})

describe("edge cases e fiacao completa da matriz", () => {
  it("designer tambem acessa a etapa de PRODUCAO (matriz alem de estrutura)", async () => {
    mockMember = { orgId: ORG, memberId: "m1", role: "designer", roles: ["designer"] }
    seedCampaignTask({
      taskColumnId: "c-prod",
      designColumnId: "c-prod",
      columnSlug: "producao",
    })
    const ctx = await getTaskAccessContext("u1", "ct1")
    expect(ctx?.stageSlug).toBe("producao")
    expect(ctx?.canWork).toBe(true)
  })

  it("campanha NAO encontrada (source_id orfao): cai como task comum", async () => {
    mockMember = { orgId: ORG, memberId: "m1", role: "designer", roles: ["designer"] }
    db.tasks.push({
      id: "ct1",
      org_id: ORG,
      onboarding_id: null,
      source_type: "campaign_suggestion",
      source_id: "fantasma",
      operational_pipeline_id: "pipe-campaign",
      operational_column_id: "c-estrutura",
      version: 1,
      status: "pending",
      assignee_role: null,
    })
    const ctx = await getTaskAccessContext("u1", "ct1")
    expect(ctx?.campaign).toBeNull()
    expect(ctx?.canWork).toBe(true) // comum, role null
  })

  it("design NAO iniciado (design_column_id null): task nao e da etapa atual", async () => {
    mockMember = { orgId: ORG, memberId: "m1", role: "designer", roles: ["designer"] }
    seedCampaignTask({
      taskColumnId: "c-estrutura",
      designColumnId: null,
      columnSlug: "estrutura",
    })
    const ctx = await getTaskAccessContext("u1", "ct1")
    expect(ctx?.campaign?.id).toBe("camp1")
    expect(ctx?.isCurrentStage).toBe(false)
    expect(ctx?.canRead).toBe(false)
  })

  it("requireTaskAccess: 404 pra quem nao tem a funcao; ok pro responsavel", async () => {
    seedCampaignTask({
      taskColumnId: "c-estrutura",
      designColumnId: "c-estrutura",
      columnSlug: "estrutura",
    })
    mockMember = { orgId: ORG, memberId: "m1", role: "suporte", roles: ["suporte"] }
    await expect(requireTaskAccess("u1", "ct1", "read")).rejects.toMatchObject({
      statusCode: 404,
    })
    mockMember = { orgId: ORG, memberId: "m2", role: "designer", roles: ["designer"] }
    await expect(requireTaskAccess("u1", "ct1", "work")).resolves.toBeTruthy()
  })
})
