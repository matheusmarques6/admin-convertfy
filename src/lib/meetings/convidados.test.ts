import { describe, expect, it } from "vitest"
import {
  chaveDeEmail,
  contatoSugerido,
  externosNaoCobertos,
  montarConvidados,
  pareceEmail,
  resumoDeConvidados,
  type ContatoDoCliente,
} from "./convidados"

const contato = (over: Partial<ContatoDoCliente> & { id: string }): ContatoDoCliente => ({
  name: "Contato",
  email: "contato@loja.com",
  is_primary: false,
  store_id: null,
  ...over,
})

describe("chaveDeEmail", () => {
  it("apara e baixa a caixa", () => {
    expect(chaveDeEmail("  Joao@Loja.COM ")).toBe("joao@loja.com")
  })

  it("NÃO remove ponto nem +tag do local", () => {
    // Só o Gmail ignora ponto. Tratar joao.silva@ e joaosilva@ como o mesmo
    // endereço em outros provedores faria a gente deixar de convidar uma
    // pessoa real — deduplicar demais custa um convidado ausente.
    expect(chaveDeEmail("joao.silva@outra.com")).not.toBe(chaveDeEmail("joaosilva@outra.com"))
    expect(chaveDeEmail("joao+cf@loja.com")).toBe("joao+cf@loja.com")
  })
})

describe("pareceEmail", () => {
  it("aceita endereços comuns", () => {
    expect(pareceEmail("joao@loja.com.br")).toBe(true)
    expect(pareceEmail("joao+cf@sub.loja.io")).toBe(true)
  })

  it("recusa o que o Google recusaria de cara", () => {
    expect(pareceEmail("joao")).toBe(false)
    expect(pareceEmail("joao@")).toBe(false)
    expect(pareceEmail("@loja.com")).toBe(false)
    expect(pareceEmail("joao@localhost")).toBe(false)
    expect(pareceEmail("joao silva@loja.com")).toBe(false)
    expect(pareceEmail("joao@a..com")).toBe(false)
    expect(pareceEmail("joao@loja.com@x.com")).toBe(false)
    expect(pareceEmail("")).toBe(false)
  })
})

describe("contatoSugerido", () => {
  it("o primário da loja vence o primário do cliente", () => {
    // Feedback de UMA loja é com quem cuida daquela loja, não com o dono
    // do grupo.
    const escolhido = contatoSugerido(
      [
        contato({ id: "dono", is_primary: true, email: "dono@grupo.com" }),
        contato({ id: "gerente", store_id: "loja-1", is_primary: true, email: "ger@loja.com" }),
      ],
      "loja-1",
    )
    expect(escolhido?.id).toBe("gerente")
  })

  it("sem primário da loja, usa qualquer contato daquela loja", () => {
    const escolhido = contatoSugerido(
      [
        contato({ id: "dono", is_primary: true, email: "dono@grupo.com" }),
        contato({ id: "aux", store_id: "loja-1", email: "aux@loja.com" }),
      ],
      "loja-1",
    )
    expect(escolhido?.id).toBe("aux")
  })

  it("sem loja, cai no primário do cliente", () => {
    const escolhido = contatoSugerido([
      contato({ id: "a", email: "a@x.com" }),
      contato({ id: "b", is_primary: true, email: "b@x.com" }),
    ])
    expect(escolhido?.id).toBe("b")
  })

  it("nunca sugere contato sem email", () => {
    // Marcado na tela, ele daria a impressão de que o convite vai sair.
    const escolhido = contatoSugerido([
      contato({ id: "sem", is_primary: true, email: null }),
      contato({ id: "com", email: "com@x.com" }),
    ])
    expect(escolhido?.id).toBe("com")
  })

  it("devolve null quando ninguém tem email", () => {
    expect(contatoSugerido([contato({ id: "a", email: null })])).toBeNull()
    expect(contatoSugerido([])).toBeNull()
  })

  it("ignora email cadastrado inválido", () => {
    const escolhido = contatoSugerido([
      contato({ id: "quebrado", is_primary: true, email: "sem-arroba" }),
      contato({ id: "bom", email: "bom@x.com" }),
    ])
    expect(escolhido?.id).toBe("bom")
  })
})

describe("montarConvidados", () => {
  it("junta as três origens", () => {
    const lista = montarConvidados({
      membros: [{ email: "csm@convertfy.me", displayName: "CSM", refId: "p1" }],
      contatos: [contato({ id: "c1", name: "Ana", email: "ana@loja.com" })],
      externos: ["socio@loja.com"],
    })
    expect(lista.map((c) => c.origem)).toEqual(["membro", "contato", "externo"])
    expect(lista.map((c) => c.email)).toEqual([
      "csm@convertfy.me",
      "ana@loja.com",
      "socio@loja.com",
    ])
  })

  it("membro vence contato no mesmo email — entra uma vez, com o nome do time", () => {
    const lista = montarConvidados({
      membros: [{ email: "Duplo@x.com", displayName: "Do time", refId: "p1" }],
      contatos: [contato({ id: "c1", name: "Do cliente", email: "duplo@X.com" })],
    })
    expect(lista).toHaveLength(1)
    expect(lista[0].origem).toBe("membro")
    expect(lista[0].displayName).toBe("Do time")
  })

  it("contato vence externo no mesmo email", () => {
    const lista = montarConvidados({
      contatos: [contato({ id: "c1", name: "Ana", email: "ana@loja.com" })],
      externos: [" ANA@loja.com "],
    })
    expect(lista).toHaveLength(1)
    expect(lista[0].origem).toBe("contato")
    expect(lista[0].refId).toBe("c1")
  })

  it("descarta entradas sem email ou com email inválido", () => {
    const lista = montarConvidados({
      membros: [{ email: "", displayName: "Vazio" }],
      contatos: [contato({ id: "c1", email: null }), contato({ id: "c2", email: "nao-email" })],
      externos: [null, undefined, "  ", "ok@x.com"],
    })
    expect(lista.map((c) => c.email)).toEqual(["ok@x.com"])
  })

  it("preserva o email como digitado, deduplicando pela chave", () => {
    // O Google recebe o endereço original; a caixa baixa serve só para
    // comparar.
    const lista = montarConvidados({ externos: ["Joao@Loja.com", "joao@loja.com"] })
    expect(lista).toHaveLength(1)
    expect(lista[0].email).toBe("Joao@Loja.com")
  })

  it("sem nenhuma origem, devolve lista vazia", () => {
    expect(montarConvidados({})).toEqual([])
  })
})

describe("externosNaoCobertos", () => {
  it("tira o externo que já é um convidado", () => {
    const sobra = externosNaoCobertos(
      ["ana@loja.com", "outro@loja.com"],
      [{ email: "ANA@LOJA.COM" }],
    )
    expect(sobra).toEqual(["outro@loja.com"])
  })

  it("deduplica os externos entre si", () => {
    expect(externosNaoCobertos(["a@x.com", " A@X.com "], [])).toEqual(["a@x.com"])
  })

  it("descarta inválidos", () => {
    expect(externosNaoCobertos(["", null, "nao-email", "b@x.com"], [])).toEqual(["b@x.com"])
  })
})

describe("resumoDeConvidados", () => {
  it("diz quem do cliente recebe, nominalmente", () => {
    const texto = resumoDeConvidados(
      montarConvidados({
        membros: [{ email: "a@convertfy.me" }, { email: "b@convertfy.me" }],
        contatos: [contato({ id: "c1", name: "Ana", email: "ana@loja.com" })],
      }),
    )
    expect(texto).toBe("Receberão o convite: 2 pessoas do time · Ana.")
  })

  it("resume quando há muitos do lado do cliente", () => {
    const texto = resumoDeConvidados(
      montarConvidados({
        contatos: [
          contato({ id: "1", name: "Ana", email: "a@x.com" }),
          contato({ id: "2", name: "Bia", email: "b@x.com" }),
          contato({ id: "3", name: "Caio", email: "c@x.com" }),
          contato({ id: "4", name: "Dan", email: "d@x.com" }),
        ],
      }),
    )
    expect(texto).toBe("Receberão o convite: Ana, Bia, Caio e mais 1.")
  })

  it("usa o email quando não há nome", () => {
    const texto = resumoDeConvidados(montarConvidados({ externos: ["x@y.com"] }))
    expect(texto).toBe("Receberão o convite: x@y.com.")
  })

  it("diz explicitamente quando ninguém recebe", () => {
    expect(resumoDeConvidados([])).toBe("Ninguém será convidado.")
  })

  it("uma pessoa do time no singular", () => {
    const texto = resumoDeConvidados(montarConvidados({ membros: [{ email: "a@convertfy.me" }] }))
    expect(texto).toBe("Receberão o convite: 1 pessoa do time.")
  })
})
