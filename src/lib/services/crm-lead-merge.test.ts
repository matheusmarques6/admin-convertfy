import { describe, it, expect } from "vitest"
import {
  phoneKeys,
  findDuplicateGroups,
  planLeadMerge,
  suggestSurvivor,
  type DupLead,
} from "./crm-lead-merge"

const lead = (over: Partial<DupLead> & { id: string }): DupLead => ({
  name: "Lead",
  email: null,
  phone: null,
  company: null,
  role: null,
  source: null,
  status: "new",
  utm: null,
  tags: null,
  notes: null,
  custom_fields: null,
  converted_to_deal_id: null,
  created_at: "2026-07-01T00:00:00Z",
  ...over,
})

describe("phoneKeys", () => {
  it("normaliza para digitos", () => {
    expect(phoneKeys("+55 (11) 98765-4321")).toContain("5511987654321")
  })

  it("gera a variante sem o nono digito", () => {
    expect(phoneKeys("5511987654321")).toEqual(
      expect.arrayContaining(["5511987654321", "551187654321"]),
    )
  })

  it("gera a variante com o nono digito", () => {
    expect(phoneKeys("551187654321")).toEqual(
      expect.arrayContaining(["551187654321", "5511987654321"]),
    )
  })

  it("ignora vazio e numero curto demais", () => {
    expect(phoneKeys(null)).toEqual([])
    expect(phoneKeys("123")).toEqual([])
  })
})

describe("findDuplicateGroups", () => {
  it("agrupa por email ignorando caixa", () => {
    const groups = findDuplicateGroups([
      lead({ id: "a", email: "Joao@Empresa.com" }),
      lead({ id: "b", email: "joao@empresa.com" }),
      lead({ id: "c", email: "outra@pessoa.com" }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].matched_by).toBe("email")
    expect(groups[0].leads.map((l) => l.id).sort()).toEqual(["a", "b"])
  })

  it("agrupa telefones com e sem o nono digito — mesmo numero", () => {
    const groups = findDuplicateGroups([
      lead({ id: "a", phone: "5511987654321" }),
      lead({ id: "b", phone: "55 11 8765-4321" }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].matched_by).toBe("phone")
  })

  it("um lead entra em UM grupo so — email vence telefone", () => {
    const groups = findDuplicateGroups([
      lead({ id: "a", email: "x@y.com", phone: "5511987654321" }),
      lead({ id: "b", email: "x@y.com" }),
      lead({ id: "c", phone: "5511987654321" }),
    ])
    // a+b agrupam por email; c fica sem par (a ja foi usado)
    expect(groups).toHaveLength(1)
    expect(groups[0].leads.map((l) => l.id).sort()).toEqual(["a", "b"])
  })

  it("nome igual sozinho NAO e duplicado", () => {
    const groups = findDuplicateGroups([
      lead({ id: "a", name: "Joao Silva" }),
      lead({ id: "b", name: "Joao Silva" }),
    ])
    expect(groups).toHaveLength(0)
  })

  it("sugere como sobrevivente quem tem mais dados", () => {
    const groups = findDuplicateGroups([
      lead({ id: "vazio", email: "x@y.com", created_at: "2026-07-01T00:00:00Z" }),
      lead({
        id: "rico",
        email: "x@y.com",
        phone: "5511987654321",
        company: "ACME",
        tags: ["vip"],
        created_at: "2026-07-05T00:00:00Z",
      }),
    ])
    expect(groups[0].suggested_survivor_id).toBe("rico")
  })

  it("lead convertido e ancora preferida do merge", () => {
    const id = suggestSurvivor([
      lead({ id: "novo", email: "x@y.com", phone: "5511987654321", company: "ACME" }),
      lead({ id: "convertido", email: "x@y.com", converted_to_deal_id: "d1" }),
    ])
    expect(id).toBe("convertido")
  })
})

describe("planLeadMerge", () => {
  it("preenche-vazio: sobrevivente nunca perde dado", () => {
    const survivor = lead({ id: "s", email: "s@x.com", phone: null, company: null })
    const plan = planLeadMerge(survivor, [
      lead({ id: "d1", email: "OUTRO@x.com", phone: "5511987654321", company: "ACME" }),
    ])
    expect(plan.updates.email).toBeUndefined() // ja tinha — nao sobrescreve
    expect(plan.updates.phone).toBe("5511987654321")
    expect(plan.updates.company).toBe("ACME")
  })

  it("first touch: com varios doadores, vence o mais antigo", () => {
    const plan = planLeadMerge(lead({ id: "s" }), [
      lead({ id: "d2", phone: "222", created_at: "2026-07-10T00:00:00Z" }),
      lead({ id: "d1", phone: "111", created_at: "2026-07-02T00:00:00Z" }),
    ])
    expect(plan.updates.phone).toBe("111")
  })

  it("utm do sobrevivente vazia herda a do duplicado mais antigo", () => {
    const plan = planLeadMerge(lead({ id: "s", utm: {} }), [
      lead({ id: "d", utm: { source: "meta-ads" }, created_at: "2026-07-02T00:00:00Z" }),
    ])
    expect(plan.updates.utm).toEqual({ source: "meta-ads" })
  })

  it("tags fazem uniao sem duplicar", () => {
    const plan = planLeadMerge(lead({ id: "s", tags: ["vip"] }), [
      lead({ id: "d", tags: ["vip", "evento"] }),
    ])
    expect(plan.updates.tags).toEqual(["vip", "evento"])
  })

  it("notas concatenam preservando as do sobrevivente", () => {
    const plan = planLeadMerge(lead({ id: "s", notes: "nota original" }), [
      lead({ id: "d", notes: "contexto extra" }),
    ])
    expect(plan.updates.notes).toBe("nota original\n---\ncontexto extra")
  })

  it("custom_fields nao sobrescrevem os existentes", () => {
    const plan = planLeadMerge(
      lead({ id: "s", custom_fields: { origem: "site" } }),
      [lead({ id: "d", custom_fields: { origem: "evento", cargo: "CEO" } })],
    )
    expect(plan.updates.custom_fields).toEqual({ origem: "site", cargo: "CEO" })
  })

  it("herda status mais avancado — merge nao esconde conversao", () => {
    const plan = planLeadMerge(lead({ id: "s", status: "new" }), [
      lead({ id: "d", status: "converted", converted_to_deal_id: "deal1" }),
    ])
    expect(plan.updates.status).toBe("converted")
    expect(plan.updates.converted_to_deal_id).toBe("deal1")
  })

  it("sem nada a mudar devolve updates vazio", () => {
    const plan = planLeadMerge(
      lead({ id: "s", email: "s@x.com", phone: "111", status: "qualified" }),
      [lead({ id: "d", email: "s@x.com", status: "new" })],
    )
    expect(plan.updates).toEqual({})
    expect(plan.delete_ids).toEqual(["d"])
  })
})
