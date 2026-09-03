import { describe, expect, it, vi, beforeEach } from "vitest"

// resolveOrgId consulta org_members com o admin client — mocka o módulo
// inteiro pra manter o teste puro (sem Supabase).
const resolveOrgIdMock = vi.fn()
vi.mock("@/lib/api/resolve-org", () => ({
  resolveOrgId: (userId: string) => resolveOrgIdMock(userId),
}))

import {
  assertReportInUserOrg,
  assertStoreInUserOrg,
  canAccessReport,
} from "./store-org-guard"

/**
 * Stub mínimo do SupabaseClient: cada tabela responde a
 * .select().eq().maybeSingle() com a linha configurada.
 */
function makeAdmin(rows: {
  profile?: { role: string } | null
  store?: { id: string; org_id: string } | null
  report?: { store_id: string } | null
}) {
  const table = (data: unknown) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data, error: null }),
      }),
    }),
  })
  return {
    from: (name: string) => {
      if (name === "profiles") return table(rows.profile ?? null)
      if (name === "client_stores") return table(rows.store ?? null)
      if (name === "client_monthly_reports") return table(rows.report ?? null)
      throw new Error(`tabela inesperada: ${name}`)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

beforeEach(() => {
  resolveOrgIdMock.mockReset()
})

describe("assertStoreInUserOrg", () => {
  it("deixa passar loja da mesma org", async () => {
    resolveOrgIdMock.mockResolvedValue("org-1")
    const admin = makeAdmin({
      profile: { role: "member" },
      store: { id: "store-1", org_id: "org-1" },
    })
    await expect(assertStoreInUserOrg(admin, "user-1", "store-1")).resolves.toBeUndefined()
  })

  it("bloqueia loja de OUTRA org com 404", async () => {
    resolveOrgIdMock.mockResolvedValue("org-1")
    const admin = makeAdmin({
      profile: { role: "member" },
      store: { id: "store-b", org_id: "org-2" },
    })
    await expect(assertStoreInUserOrg(admin, "user-1", "store-b")).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it("bloqueia loja inexistente", async () => {
    resolveOrgIdMock.mockResolvedValue("org-1")
    const admin = makeAdmin({ profile: { role: "member" }, store: null })
    await expect(assertStoreInUserOrg(admin, "user-1", "sumiu")).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it("admin de sistema passa sem consultar org", async () => {
    const admin = makeAdmin({ profile: { role: "admin" } })
    await expect(assertStoreInUserOrg(admin, "root", "qualquer")).resolves.toBeUndefined()
    expect(resolveOrgIdMock).not.toHaveBeenCalled()
  })

  it("usuário sem org ativa é bloqueado (resolveOrgId lança)", async () => {
    resolveOrgIdMock.mockRejectedValue(new Error("Acesso negado"))
    const admin = makeAdmin({ profile: { role: "member" } })
    await expect(assertStoreInUserOrg(admin, "user-sem-org", "store-1")).rejects.toThrow()
  })
})

describe("assertReportInUserOrg", () => {
  it("resolve a loja do relatório e valida a org", async () => {
    resolveOrgIdMock.mockResolvedValue("org-1")
    const admin = makeAdmin({
      profile: { role: "member" },
      report: { store_id: "store-1" },
      store: { id: "store-1", org_id: "org-1" },
    })
    await expect(assertReportInUserOrg(admin, "user-1", "rep-1")).resolves.toBeUndefined()
  })

  it("relatório de loja de outra org é 404", async () => {
    resolveOrgIdMock.mockResolvedValue("org-1")
    const admin = makeAdmin({
      profile: { role: "member" },
      report: { store_id: "store-b" },
      store: { id: "store-b", org_id: "org-2" },
    })
    await expect(assertReportInUserOrg(admin, "user-1", "rep-b")).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it("relatório inexistente é 404", async () => {
    const admin = makeAdmin({ profile: { role: "member" }, report: null })
    await expect(assertReportInUserOrg(admin, "user-1", "nada")).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe("canAccessReport", () => {
  it("false sem usuário (sessão ausente no RSC)", async () => {
    const admin = makeAdmin({})
    await expect(canAccessReport(admin, null, "rep-1")).resolves.toBe(false)
    await expect(canAccessReport(admin, undefined, "rep-1")).resolves.toBe(false)
  })

  it("true para relatório da própria org", async () => {
    resolveOrgIdMock.mockResolvedValue("org-1")
    const admin = makeAdmin({
      profile: { role: "member" },
      report: { store_id: "store-1" },
      store: { id: "store-1", org_id: "org-1" },
    })
    await expect(canAccessReport(admin, "user-1", "rep-1")).resolves.toBe(true)
  })

  it("false para relatório de outra org (sem lançar)", async () => {
    resolveOrgIdMock.mockResolvedValue("org-1")
    const admin = makeAdmin({
      profile: { role: "member" },
      report: { store_id: "store-b" },
      store: { id: "store-b", org_id: "org-2" },
    })
    await expect(canAccessReport(admin, "user-1", "rep-b")).resolves.toBe(false)
  })
})
