import { describe, it, expect } from "vitest"
import { escolherOrg, ORDEM_DA_CASCATA } from "./org-do-negocio"

describe("escolherOrg", () => {
  it("prefere o vínculo com o cliente a qualquer outra ponta", () => {
    const r = escolherOrg({
      cliente: "org-cliente",
      loja: "org-loja",
      dono: "org-dono",
      lead: "org-lead",
      operador: "org-operador",
    })
    expect(r).toEqual({ orgId: "org-cliente", fonte: "cliente" })
  })

  it("desce a cascata na ordem declarada", () => {
    expect(escolherOrg({ loja: "L", dono: "D" })?.fonte).toBe("loja")
    expect(escolherOrg({ dono: "D", lead: "X" })?.fonte).toBe("dono")
    expect(escolherOrg({ lead: "X" })?.fonte).toBe("lead")
  })

  it("o operador é o último degrau, nunca o primeiro", () => {
    expect(ORDEM_DA_CASCATA.at(-1)).toBe("operador")
    // Um negócio com dono resolve pelo dono mesmo com operador presente:
    // arrastar o card de outra org não pode redefinir a org do negócio.
    expect(escolherOrg({ dono: "D", operador: "O" })).toEqual({
      orgId: "D",
      fonte: "dono",
    })
    expect(escolherOrg({ operador: "O" })).toEqual({ orgId: "O", fonte: "operador" })
  })

  it("sem nenhuma ponta devolve null — não inventa a org do banco", () => {
    expect(escolherOrg({})).toBeNull()
    expect(escolherOrg({ cliente: null, loja: null, dono: null, lead: null })).toBeNull()
  })

  it("string vazia ou só espaço NÃO conta como org", () => {
    // Um coalesce cru a aceitaria, e o .eq('org_id','') seguinte
    // devolveria lista vazia — que se lê como "a org não configurou nada".
    expect(escolherOrg({ cliente: "", dono: "D" })).toEqual({ orgId: "D", fonte: "dono" })
    expect(escolherOrg({ cliente: "   " })).toBeNull()
  })

  it("apara o espaço em volta do id resolvido", () => {
    expect(escolherOrg({ lead: " org-1 " })).toEqual({ orgId: "org-1", fonte: "lead" })
  })

  it("undefined e null se comportam igual", () => {
    expect(escolherOrg({ cliente: undefined, loja: null, dono: "D" })?.fonte).toBe("dono")
  })
})
