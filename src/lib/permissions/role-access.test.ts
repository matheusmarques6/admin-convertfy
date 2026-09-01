import { describe, it, expect } from "vitest"
import {
  canAccess,
  isReadOnly,
  canCreateAccounts,
  toCanonicalRole,
  resolveMemberRoles,
  ACCESS_BY_ROLE,
  ALL_ORG_ROLES,
  type NavItemId,
} from "./role-access"
import type { OrgRole } from "@/types/organization"

// ---------------------------------------------------------------------------
// Matriz item × função — espelho do que o usuário definiu. Cada célula é uma
// asserção independente. Se o produto mudar, atualizar AQUI e em role-access.ts.
// ---------------------------------------------------------------------------

type Matrix = Record<NavItemId, Partial<Record<OrgRole, boolean>>>

const MATRIX: Matrix = {
  // Comercial
  "comercial.dashboard":    { admin: true, dev: true, coo: false, suporte: true,  designer: false, implementacao: false },
  "comercial.pipelines":    { admin: true, dev: true, coo: false, suporte: true,  designer: false, implementacao: false },
  "comercial.leads":        { admin: true, dev: true, coo: false, suporte: true,  designer: false, implementacao: false },
  "comercial.produtos":     { admin: true, dev: true, coo: false, suporte: true,  designer: false, implementacao: false },
  "comercial.forms":        { admin: true, dev: true, coo: false, suporte: true,  designer: false, implementacao: false },
  "comercial.inbox":        { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "comercial.canais":       { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "comercial.instagram":    { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "comercial.automacoes":   { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "comercial.meetings":     { admin: true, dev: true, coo: false, suporte: true,  designer: false, implementacao: false },
  "comercial.agenda":       { admin: true, dev: true, coo: false, suporte: true,  designer: false, implementacao: false },
  "comercial.funil":        { admin: true, dev: true, coo: false, suporte: true,  designer: false, implementacao: false },
  "comercial.reports":      { admin: true, dev: true, coo: false, suporte: true,  designer: false, implementacao: false },
  "comercial.ia":           { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  // Operacional
  "ops.dashboard":          { admin: true, dev: true, coo: true,  suporte: true,  designer: true,  implementacao: true },
  "ops.ia":                 { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "ops.clients":            { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "ops.stores":             { admin: true, dev: true, coo: true,  suporte: true,  designer: true,  implementacao: true },
  "ops.health":             { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "ops.cs.painel":          { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "ops.cs.forms":           { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "ops.cs.pipelines":       { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "ops.cs.ritual":          { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "ops.onboarding":         { admin: true, dev: true, coo: true,  suporte: true,  designer: true,  implementacao: true },
  "ops.cs.cadences":        { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "ops.onboarding.tutorial":{ admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "ops.pipelines.admin":    { admin: true, dev: true, coo: true,  suporte: false, designer: false, implementacao: false },
  "ops.campaigns.central":  { admin: true, dev: true, coo: true,  suporte: false, designer: false, implementacao: false },
  "ops.campaigns.list":     { admin: true, dev: true, coo: true,  suporte: false, designer: false, implementacao: false },
  "ops.insights":           { admin: true, dev: true, coo: true,  suporte: false, designer: false, implementacao: false },
  "ops.list_hygiene":       { admin: true, dev: true, coo: true,  suporte: false, designer: false, implementacao: false },
  "ops.image_studio":       { admin: true, dev: true, coo: true,  suporte: true,  designer: true,  implementacao: true },
  "ops.reports":            { admin: true, dev: true, coo: true,  suporte: false, designer: false, implementacao: false },
  // Geral
  "geral.home":             { admin: true, dev: true, coo: true,  suporte: true,  designer: true,  implementacao: true },
  "geral.board":            { admin: true, dev: true, coo: true,  suporte: true,  designer: true,  implementacao: true },
  "geral.meetings":         { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "geral.team":             { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "geral.financial":        { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  "geral.reports":          { admin: true, dev: true, coo: true,  suporte: true,  designer: false, implementacao: false },
  // Ferramentas
  "tools.tools":            { admin: true, dev: true, coo: false, suporte: false, designer: false, implementacao: false },
  "tools.currency_audit":   { admin: true, dev: true, coo: false, suporte: false, designer: false, implementacao: false },
  "tools.email_generation": { admin: true, dev: true, coo: false, suporte: false, designer: false, implementacao: false },
  "tools.ai_usage":         { admin: true, dev: true, coo: false, suporte: false, designer: false, implementacao: false },
  "tools.agent_studio":     { admin: true, dev: true, coo: false, suporte: false, designer: false, implementacao: false },
}

describe("canAccess — matriz item × função", () => {
  for (const [itemId, byRole] of Object.entries(MATRIX) as [NavItemId, Partial<Record<OrgRole, boolean>>][]) {
    for (const role of ALL_ORG_ROLES) {
      const expected = byRole[role]
      if (expected === undefined) continue
      it(`${role} ${expected ? "vê" : "NÃO vê"} ${itemId}`, () => {
        expect(canAccess(itemId, [role])).toBe(expected)
      })
    }
  }
})

describe("canAccess — multi-função (união)", () => {
  it("Designer + Suporte vê o que Suporte libera", () => {
    expect(canAccess("comercial.leads", ["designer", "suporte"])).toBe(true)
  })

  it("Designer + Implementação NÃO vê Comercial (nenhum dos dois libera)", () => {
    expect(canAccess("comercial.leads", ["designer", "implementacao"])).toBe(false)
  })

  it("COO + Designer vê o que COO libera, ainda sem Comercial", () => {
    expect(canAccess("ops.campaigns.list", ["coo", "designer"])).toBe(true)
    expect(canAccess("comercial.dashboard", ["coo", "designer"])).toBe(false)
  })
})

describe("canAccess — bypass admin/dev", () => {
  it("Admin vê 100% dos itens", () => {
    for (const itemId of Object.keys(MATRIX) as NavItemId[]) {
      expect(canAccess(itemId, ["admin"])).toBe(true)
    }
  })

  it("Dev vê 100% dos itens", () => {
    for (const itemId of Object.keys(MATRIX) as NavItemId[]) {
      expect(canAccess(itemId, ["dev"])).toBe(true)
    }
  })
})

describe("canAccess — sem funções", () => {
  it("Conta sem nenhuma função não vê nada", () => {
    expect(canAccess("geral.home", [])).toBe(false)
    expect(canAccess("ops.dashboard", [])).toBe(false)
  })
})

describe("isReadOnly", () => {
  it("Suporte tem Equipe em leitura", () => {
    expect(isReadOnly("geral.team", ["suporte"])).toBe(true)
  })

  it("Admin nunca está em modo leitura", () => {
    expect(isReadOnly("geral.team", ["admin"])).toBe(false)
  })

  it("Suporte + Admin: admin sobrepõe e libera escrita", () => {
    expect(isReadOnly("geral.team", ["suporte", "admin"])).toBe(false)
  })

  it("Suporte + COO: COO tem write em Equipe → não é read-only", () => {
    expect(isReadOnly("geral.team", ["suporte", "coo"])).toBe(false)
  })

  it("isReadOnly = false quando o item nem é acessível", () => {
    expect(isReadOnly("tools.email_generation", ["suporte"])).toBe(false)
    expect(canAccess("tools.email_generation", ["suporte"])).toBe(false)
  })
})

describe("canCreateAccounts", () => {
  it.each([
    [["admin"] as OrgRole[], true],
    [["dev"] as OrgRole[], true],
    [["coo"] as OrgRole[], true],
    [["suporte"] as OrgRole[], false],
    [["designer"] as OrgRole[], false],
    [["implementacao"] as OrgRole[], false],
    [["suporte", "designer"] as OrgRole[], false],
    [["suporte", "coo"] as OrgRole[], true],
  ])("roles=%j → %s", (roles, expected) => {
    expect(canCreateAccounts(roles)).toBe(expected)
  })
})

describe("ACCESS_BY_ROLE — sanidade", () => {
  it("toda função canônica tem um set", () => {
    for (const role of ALL_ORG_ROLES) {
      expect(ACCESS_BY_ROLE[role]).toBeInstanceOf(Set)
    }
  })
})

describe("toCanonicalRole — legado → 6 canônicas", () => {
  it.each([
    ["owner", "admin"],
    ["developer", "implementacao"],
    ["support", "suporte"],
    ["manager", "suporte"],
    ["coordinator", "suporte"],
    ["copywriter", "suporte"],
    ["analyst", "suporte"],
    ["techlead", "dev"],
    ["coo", "coo"],
    ["designer", "designer"],
    // passthrough das canônicas
    ["admin", "admin"],
    ["dev", "dev"],
    ["suporte", "suporte"],
    ["implementacao", "implementacao"],
    // desconhecido / vazio → suporte
    ["xpto", "suporte"],
    ["", "suporte"],
  ])("%s → %s", (raw, expected) => {
    expect(toCanonicalRole(raw)).toBe(expected)
  })

  it("null/undefined → suporte", () => {
    expect(toCanonicalRole(null)).toBe("suporte")
    expect(toCanonicalRole(undefined)).toBe("suporte")
  })
})

describe("resolveMemberRoles — junction vence, legado é fallback", () => {
  it("usa a junction quando presente (mapeando legados)", () => {
    expect(resolveMemberRoles(["coo", "designer"], "owner")).toEqual(["coo", "designer"])
  })

  it("fallback pro org_members.role legado quando junction vazia", () => {
    expect(resolveMemberRoles([], "owner")).toEqual(["admin"])
    expect(resolveMemberRoles(null, "developer")).toEqual(["implementacao"])
  })

  it("dedup após canonicalizar (manager e support → suporte)", () => {
    expect(resolveMemberRoles(["manager", "support"], null)).toEqual(["suporte"])
  })

  it("sempre retorna ao menos uma função", () => {
    expect(resolveMemberRoles(null, null)).toEqual(["suporte"])
  })
})
