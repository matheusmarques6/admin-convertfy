import { describe, expect, it } from "vitest"
import {
  casarClientes,
  chaveDeDocumento,
  chaveDeEmail,
  statusDeAssinatura,
  type ClienteAsaas,
  type ClienteLocal,
} from "./asaas-clientes-match"

const asaas = (o: Partial<ClienteAsaas> = {}): ClienteAsaas => ({ id: "cus_1", ...o })
const local = (o: Partial<ClienteLocal> = {}): ClienteLocal => ({ id: "c1", ...o })

describe("chaves de comparação", () => {
  it("documento aceita só CPF e CNPJ completos", () => {
    expect(chaveDeDocumento("123.456.789-09")).toBe("12345678909")
    expect(chaveDeDocumento("12.345.678/0001-95")).toBe("12345678000195")
    // Meio documento casaria com qualquer outro meio documento.
    expect(chaveDeDocumento("123")).toBeNull()
    expect(chaveDeDocumento("")).toBeNull()
    expect(chaveDeDocumento(null)).toBeNull()
  })

  it("email normaliza caixa e espaço, e NÃO mexe em ponto nem +tag", () => {
    expect(chaveDeEmail("  Joao@Loja.com ")).toBe("joao@loja.com")
    // Fora do Gmail estes são endereços DIFERENTES; unificá-los daria a
    // fatura ao cliente errado.
    expect(chaveDeEmail("joao.silva@loja.com")).not.toBe(chaveDeEmail("joaosilva@loja.com"))
    expect(chaveDeEmail("joao+asaas@loja.com")).toBe("joao+asaas@loja.com")
    expect(chaveDeEmail("sem-arroba")).toBeNull()
  })
})

describe("casarClientes", () => {
  it("casa por documento e diz o critério", () => {
    const r = casarClientes(
      [asaas({ id: "cus_9", cpfCnpj: "12.345.678/0001-95", email: "outro@x.com" })],
      [local({ id: "c7", cpf_cnpj: "12345678000195", email: "nada@x.com" })],
    )
    expect(r.vincular).toEqual([
      { asaas_customer_id: "cus_9", client_id: "c7", criterio: "documento" },
    ])
    expect(r.sem).toHaveLength(0)
  })

  it("cai no email só quando o documento não resolve", () => {
    const r = casarClientes(
      [asaas({ id: "cus_9", email: "Joao@Loja.com" })],
      [local({ id: "c7", email: "joao@loja.com" })],
    )
    expect(r.vincular[0]).toMatchObject({ client_id: "c7", criterio: "email" })
  })

  it("documento VENCE email quando os dois casam clientes diferentes", () => {
    const r = casarClientes(
      [asaas({ id: "cus_9", cpfCnpj: "12345678909", email: "financeiro@grupo.com" })],
      [
        local({ id: "por_email", email: "financeiro@grupo.com" }),
        local({ id: "por_doc", cpf_cnpj: "12345678909" }),
      ],
    )
    expect(r.vincular[0].client_id).toBe("por_doc")
  })

  it("EMPATE não casa — atribuir dinheiro ao cliente errado é pior que a triagem", () => {
    const r = casarClientes(
      [asaas({ id: "cus_9", email: "financeiro@grupo.com" })],
      [
        local({ id: "a", email: "financeiro@grupo.com" }),
        local({ id: "b", email: "financeiro@grupo.com" }),
      ],
    )
    expect(r.vincular).toHaveLength(0)
    expect(r.sem).toEqual([{ asaas_customer_id: "cus_9", motivo: "ambiguo", candidatos: 2 }])
  })

  it("pagador sem documento e sem email não tem como ser casado", () => {
    const r = casarClientes([asaas({ id: "cus_9" })], [local({ email: "a@b.com" })])
    expect(r.sem).toEqual([{ asaas_customer_id: "cus_9", motivo: "sem_identificador" }])
  })

  it("sem correspondente vira 'nao_encontrado', não some", () => {
    const r = casarClientes(
      [asaas({ id: "cus_9", email: "ninguem@x.com" })],
      [local({ email: "outro@x.com" })],
    )
    expect(r.sem).toEqual([{ asaas_customer_id: "cus_9", motivo: "nao_encontrado" }])
  })

  it("cliente já vinculado a outro pagador não é reivindicado de novo", () => {
    const r = casarClientes(
      [asaas({ id: "cus_novo", email: "joao@loja.com" })],
      [local({ id: "c7", email: "joao@loja.com", asaas_customer_id: "cus_antigo" })],
    )
    expect(r.vincular).toHaveLength(0)
    expect(r.sem[0].motivo).toBe("nao_encontrado")
  })

  it("dois pagadores do Asaas não recebem o MESMO cliente local", () => {
    const r = casarClientes(
      [asaas({ id: "cus_1", email: "joao@loja.com" }), asaas({ id: "cus_2", email: "joao@loja.com" })],
      [local({ id: "c7", email: "joao@loja.com" })],
    )
    expect(r.vincular).toHaveLength(1)
    expect(r.vincular[0].asaas_customer_id).toBe("cus_1")
    expect(r.sem[0]).toMatchObject({ asaas_customer_id: "cus_2", motivo: "nao_encontrado" })
  })

  it("todo pagador entra em exatamente um dos dois baldes", () => {
    const entrada = [
      asaas({ id: "a", cpfCnpj: "12345678909" }),
      asaas({ id: "b", email: "x@y.com" }),
      asaas({ id: "c" }),
      asaas({ id: "d", email: "dup@y.com" }),
    ]
    const r = casarClientes(entrada, [
      local({ id: "l1", cpf_cnpj: "12345678909" }),
      local({ id: "l2", email: "x@y.com" }),
      local({ id: "l3", email: "dup@y.com" }),
      local({ id: "l4", email: "dup@y.com" }),
    ])
    expect(r.vincular.length + r.sem.length).toBe(entrada.length)
  })
})

describe("statusDeAssinatura", () => {
  it("traduz o que o Asaas manda para o domínio fechado da coluna", () => {
    expect(statusDeAssinatura("ACTIVE")).toEqual({ status: "active", reconhecido: true })
    // Era este que estourava o CHECK como "expired".
    expect(statusDeAssinatura("EXPIRED")).toEqual({ status: "inactive", reconhecido: true })
    expect(statusDeAssinatura("INACTIVE").status).toBe("inactive")
    expect(statusDeAssinatura("CANCELLED").status).toBe("cancelled")
  })

  it("desconhecido vira inactive e se declara — nunca active", () => {
    const r = statusDeAssinatura("ALGUM_STATUS_NOVO")
    expect(r).toEqual({ status: "inactive", reconhecido: false })
    expect(statusDeAssinatura(null).status).toBe("inactive")
    expect(statusDeAssinatura(undefined).reconhecido).toBe(false)
  })

  it("todo retorno cabe no CHECK do banco", () => {
    const aceitos = ["active", "inactive", "cancelled"]
    for (const bruto of ["ACTIVE", "expired", "  Inactive ", "x", "", null, 7]) {
      expect(aceitos).toContain(statusDeAssinatura(bruto).status)
    }
  })
})
