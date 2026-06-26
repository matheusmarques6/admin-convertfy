import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock Supabase admin client ────────────────────────────────────────────
// Banco em memória keyed por tabela. Suporta o subconjunto de chain usado por
// getTaskAccessContext: select(...).eq(...).maybeSingle().
type Row = Record<string, unknown>
const db: Record<string, Row[]> = {
  tasks: [],
  onboardings: [],
  operational_pipeline_columns: [],
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

// getUserOrgRole é mockado pra controlar as funções do usuário no teste.
let mockMember:
  | { orgId: string; memberId: string; role: string; roles: string[] }
  | null = null
vi.mock("@/lib/api/onboarding-permissions", () => ({
  getUserOrgRole: async () => mockMember,
}))

import { getTaskAccessContext, requireTaskAccess } from "./onboarding-task-access"
import { AppError } from "@/lib/api/errors"

const ORG = "org1"

function seedOnboardingTask(opts: {
  taskColumnId: string
  taskVersion?: number
  assigneeRole?: string | null
  assigneeId?: string | null
  onboardingColumnId: string
  onboardingVersion?: number
  columnSlug: string
  status?: string
}) {
  db.tasks.push({
    id: "t1",
    org_id: ORG,
    onboarding_id: "o1",
    operational_column_id: opts.taskColumnId,
    version: opts.taskVersion ?? 1,
    status: "pending",
    assignee_role: opts.assigneeRole ?? null,
    assignee_id: opts.assigneeId ?? null,
  })
  db.onboardings.push({
    id: "o1",
    org_id: ORG,
    status: opts.status ?? "in_progress",
    current_column_id: opts.onboardingColumnId,
    current_version: opts.onboardingVersion ?? 1,
  })
  db.operational_pipeline_columns.push({
    id: opts.onboardingColumnId,
    slug: opts.columnSlug,
  })
  if (opts.taskColumnId !== opts.onboardingColumnId) {
    db.operational_pipeline_columns.push({
      id: opts.taskColumnId,
      slug: "preview_producao",
    })
  }
}

beforeEach(() => {
  resetDb()
  mockMember = null
})

describe("getTaskAccessContext — visibilidade estrita por etapa", () => {
  it("designer acessa task da etapa atual (emails_finais)", async () => {
    mockMember = {
      orgId: ORG,
      memberId: "m1",
      role: "designer",
      roles: ["designer"],
    }
    seedOnboardingTask({
      taskColumnId: "c-emails",
      onboardingColumnId: "c-emails",
      columnSlug: "emails_finais",
      assigneeRole: "designer",
    })
    const ctx = await getTaskAccessContext("u1", "t1")
    expect(ctx?.canRead).toBe(true)
    expect(ctx?.canWork).toBe(true)
    expect(ctx?.canAdmin).toBe(false)
    expect(ctx?.isCurrentStage).toBe(true)
  })

  it("suporte NÃO acessa task de etapa do designer (emails_finais)", async () => {
    mockMember = {
      orgId: ORG,
      memberId: "m1",
      role: "suporte",
      roles: ["suporte"],
    }
    seedOnboardingTask({
      taskColumnId: "c-emails",
      onboardingColumnId: "c-emails",
      columnSlug: "emails_finais",
      assigneeRole: "designer",
    })
    const ctx = await getTaskAccessContext("u1", "t1")
    expect(ctx?.canRead).toBe(false)
    expect(ctx?.canWork).toBe(false)
  })

  it("bypass (coo) tem acesso administrativo total", async () => {
    mockMember = { orgId: ORG, memberId: "m1", role: "coo", roles: ["coo"] }
    seedOnboardingTask({
      taskColumnId: "c-emails",
      onboardingColumnId: "c-emails",
      columnSlug: "emails_finais",
      assigneeRole: "designer",
    })
    const ctx = await getTaskAccessContext("u1", "t1")
    expect(ctx?.canRead).toBe(true)
    expect(ctx?.canWork).toBe(true)
    expect(ctx?.canAdmin).toBe(true)
  })

  it("atribuição individual NÃO concede acesso (regra é função × etapa)", async () => {
    // O usuário é suporte e está atribuído individualmente (assignee_id = m1),
    // mas a etapa atual é do designer. A atribuição é ignorada → sem acesso.
    mockMember = {
      orgId: ORG,
      memberId: "m1",
      role: "suporte",
      roles: ["suporte"],
    }
    seedOnboardingTask({
      taskColumnId: "c-emails",
      onboardingColumnId: "c-emails",
      columnSlug: "emails_finais",
      assigneeRole: "designer",
      assigneeId: "m1",
    })
    const ctx = await getTaskAccessContext("u1", "t1")
    expect(ctx?.canRead).toBe(false)
    expect(ctx?.canWork).toBe(false)
  })

  it("mudança de etapa transfere visibilidade: designer perde a task quando o onboarding sai de preview_producao", async () => {
    // Task ficou na coluna preview_producao (designer), mas o onboarding já
    // avançou pra preview_aprovacao (suporte). A task não é mais da etapa
    // atual → designer perde acesso.
    mockMember = {
      orgId: ORG,
      memberId: "m1",
      role: "designer",
      roles: ["designer"],
    }
    seedOnboardingTask({
      taskColumnId: "c-preview",
      onboardingColumnId: "c-aprovacao",
      columnSlug: "preview_aprovacao",
      assigneeRole: "designer",
    })
    const ctx = await getTaskAccessContext("u1", "t1")
    expect(ctx?.isCurrentStage).toBe(false)
    expect(ctx?.canRead).toBe(false)
  })

  it("projetos comuns (não-onboarding) sem assignee_role permanecem visíveis", async () => {
    mockMember = {
      orgId: ORG,
      memberId: "m1",
      role: "designer",
      roles: ["designer"],
    }
    db.tasks.push({
      id: "t1",
      org_id: ORG,
      onboarding_id: null,
      operational_column_id: null,
      version: null,
      status: "pending",
      assignee_role: null,
      assignee_id: null,
    })
    const ctx = await getTaskAccessContext("u1", "t1")
    expect(ctx?.onboarding).toBeNull()
    expect(ctx?.canRead).toBe(true)
    expect(ctx?.canWork).toBe(true)
  })
})

describe("requireTaskAccess — guards de API", () => {
  it("esconde a task (404) de quem não tem a função da etapa", async () => {
    mockMember = {
      orgId: ORG,
      memberId: "m1",
      role: "suporte",
      roles: ["suporte"],
    }
    seedOnboardingTask({
      taskColumnId: "c-emails",
      onboardingColumnId: "c-emails",
      columnSlug: "emails_finais",
      assigneeRole: "designer",
    })
    await expect(requireTaskAccess("u1", "t1", "read")).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it("nega ação administrativa (403) pra quem só tem a função operacional", async () => {
    mockMember = {
      orgId: ORG,
      memberId: "m1",
      role: "designer",
      roles: ["designer"],
    }
    seedOnboardingTask({
      taskColumnId: "c-emails",
      onboardingColumnId: "c-emails",
      columnSlug: "emails_finais",
      assigneeRole: "designer",
    })
    // Lê/trabalha OK, mas admin é exclusivo de bypass → 403.
    await expect(requireTaskAccess("u1", "t1", "work")).resolves.toBeTruthy()
    await expect(requireTaskAccess("u1", "t1", "admin")).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it("permite ação administrativa pra bypass", async () => {
    mockMember = { orgId: ORG, memberId: "m1", role: "dev", roles: ["dev"] }
    seedOnboardingTask({
      taskColumnId: "c-emails",
      onboardingColumnId: "c-emails",
      columnSlug: "emails_finais",
      assigneeRole: "designer",
    })
    const ctx = await requireTaskAccess("u1", "t1", "admin")
    expect(ctx.canAdmin).toBe(true)
  })
})

// Garante que AppError expõe statusCode (contrato usado nos guards acima).
describe("AppError contract", () => {
  it("carrega statusCode", () => {
    expect(new AppError("x", 403).statusCode).toBe(403)
  })
})
