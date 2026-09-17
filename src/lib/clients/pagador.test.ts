import { describe, expect, it } from "vitest"
import {
  documentoBRValido,
  documentoDoCliente,
  dvDoDocumentoConfere,
  ehSequenciaRepetida,
  formatarDocumento,
  gravarPagador,
  lerPagador,
  podeCriarNoAsaas,
  podeSincronizarNoAsaas,
  resumoDoPagador,
  validarPagador,
} from "./pagador"

describe("pagador do cliente", () => {
  it("o modo exterior deixa salvar SEM CPF/CNPJ — que é o pedido", () => {
    // O caso real: "JFJA DIGITAL LLC 30 N GOULD ST STE R" digitado no campo
    // do documento porque não havia outro lugar, e o save recusado.
    const r = validarPagador({ tipo: "exterior", razao_social: "JFJA DIGITAL LLC", endereco: "30 N Gould St Ste R, Sheridan, WY" })
    expect(r.ok).toBe(true)
    expect(r.erros).toEqual({})
  })

  it("exterior sem razão social não passa: seria o campo vazio de antes", () => {
    const r = validarPagador({ tipo: "exterior", razao_social: "  " })
    expect(r.ok).toBe(false)
    expect(r.erros.razao_social).toMatch(/raz[ãa]o social/i)
  })

  it("o documento BR não é apagado ao virar exterior", () => {
    // Cliente que já foi cobrado pelo Asaas mantém o documento gravado;
    // apagar em silêncio perderia o vínculo com o histórico.
    const r = validarPagador({ tipo: "exterior", razao_social: "Vivazz Ltd", cpf_cnpj: "50578775000117" })
    expect(r.ok).toBe(true)
    expect(r.erros.cpf_cnpj).toBeUndefined()
  })

  it("no modo BR o tamanho continua sendo régua, com a saída apontada", () => {
    const r = validarPagador({ tipo: "br", cpf_cnpj: "JFJA DIGITAL LLC 30 N GOULD ST" })
    expect(r.ok).toBe(false)
    // A mensagem antiga só dizia "11 ou 14 dígitos" e deixava o operador sem
    // saída — é assim que o nome da empresa acaba no campo do documento.
    expect(r.erros.cpf_cnpj).toMatch(/exterior/i)
  })

  it("sequência repetida é recusada — foi a fuga que o banco registrou", () => {
    // Medido: 1 cliente com `0000000000000000000000`.
    expect(ehSequenciaRepetida("00000000000")).toBe(true)
    expect(ehSequenciaRepetida("50578775000117")).toBe(false)
    expect(documentoBRValido("00000000000")).toBe(false)
    const r = validarPagador({ tipo: "br", cpf_cnpj: "000.000.000-00" })
    expect(r.ok).toBe(false)
    expect(r.erros.cpf_cnpj).toMatch(/d[ií]gitos iguais/i)
  })

  it("dígito verificador é AVISO, nunca bloqueio", () => {
    // Bloquear criaria atrito retroativo: abrir cadastro antigo para mexer em
    // outro campo passaria a não salvar por causa do documento.
    const r = validarPagador({ tipo: "br", cpf_cnpj: "12345678901" })
    expect(r.ok).toBe(true)
    expect(r.avisos.cpf_cnpj).toMatch(/Asaas/i)
  })

  it("o DV confere nos documentos de verdade e não opina fora do tamanho", () => {
    expect(dvDoDocumentoConfere("11144477735")).toBe(true) // CPF válido
    expect(dvDoDocumentoConfere("11222333000181")).toBe(true) // CNPJ válido
    expect(dvDoDocumentoConfere("11144477700")).toBe(false)
    expect(dvDoDocumentoConfere("123")).toBeNull()
    expect(dvDoDocumentoConfere("")).toBeNull()
  })

  it("país fora do formato ISO é recusado, e vazio é aceito", () => {
    expect(validarPagador({ tipo: "exterior", razao_social: "X LLC", pais: "Estados Unidos" }).ok).toBe(false)
    expect(validarPagador({ tipo: "exterior", razao_social: "X LLC", pais: "us" }).ok).toBe(true)
    expect(validarPagador({ tipo: "exterior", razao_social: "X LLC" }).ok).toBe(true)
  })

  it("o Asaas recusa o exterior ANTES da chamada, com o motivo", () => {
    const v = podeCriarNoAsaas({ tipo: "exterior", razao_social: "JFJA DIGITAL LLC" })
    expect(v.pode).toBe(false)
    // Sem o motivo, a recusa vira mistério e alguém tenta de novo amanhã.
    expect(v.motivo).toMatch(/pagamento por fora/i)
    expect(podeCriarNoAsaas({ tipo: "br", cpf_cnpj: "11144477735" }).pode).toBe(true)
    expect(podeCriarNoAsaas({ tipo: "br", cpf_cnpj: "" }).pode).toBe(false)
  })

  it("sincronizar não exige documento — 25 clientes o têm só no Asaas", () => {
    // Medido em 09/2026: 25 dos 56 têm `asaas_customer_id` e nenhum
    // documento gravado aqui. Exigir documento para sincronizar quebraria
    // justamente esses; quem não sincroniza é o exterior, que não tem
    // cadastro lá para atualizar.
    expect(podeSincronizarNoAsaas({ tipo: "br" }).pode).toBe(true)
    expect(podeSincronizarNoAsaas({ tipo: "exterior" }).pode).toBe(false)
  })

  it("cadastro sem `pagador` é BR — são os 56 de hoje", () => {
    expect(lerPagador(null).tipo).toBe("br")
    expect(lerPagador({ cpf_cnpj: "11144477735", custom_fields: {} }).tipo).toBe("br")
    expect(lerPagador({ custom_fields: { pagador: "lixo" } as never }).tipo).toBe("br")
  })

  it("exterior gravado sem nome cai para BR em vez de virar empresa sem nome", () => {
    expect(lerPagador({ custom_fields: { pagador: { tipo: "exterior", razao_social: "   " } } }).tipo).toBe("br")
  })

  it("lê o exterior inteiro, com país em caixa alta", () => {
    const p = lerPagador({
      custom_fields: { pagador: { tipo: "exterior", razao_social: " JFJA DIGITAL LLC ", tax_id: "88-1234567", pais: "us", endereco: "30 N Gould St" } },
    })
    expect(p).toEqual({ tipo: "exterior", razao_social: "JFJA DIGITAL LLC", tax_id: "88-1234567", pais: "US", endereco: "30 N Gould St" })
  })

  it("BR não grava chave nenhuma — a consulta de quem paga por fora é de uma linha", () => {
    expect(gravarPagador({ tipo: "br", cpf_cnpj: "11144477735" })).toBeUndefined()
    expect(gravarPagador({ tipo: "exterior", razao_social: "X LLC", tax_id: "  " })).toEqual({
      tipo: "exterior",
      razao_social: "X LLC",
      tax_id: undefined,
      pais: undefined,
      endereco: undefined,
    })
  })

  it("o resumo diz quem paga, sem inventar o que falta", () => {
    expect(resumoDoPagador({ tipo: "exterior", razao_social: "JFJA DIGITAL LLC", pais: "US" })).toBe("JFJA DIGITAL LLC · US")
    expect(resumoDoPagador({ tipo: "br" }, "11144477735")).toBe("111.444.777-35")
    expect(resumoDoPagador({ tipo: "br" }, null)).toBe("Sem CPF/CNPJ")
  })

  it("o documento é o da COLUNA, e o JSONB é fallback de leitura", () => {
    // Medido: 26 dos 56 clientes têm o documento SÓ em custom_fields (a tela
    // de criação nunca escreveu na coluna) — e é a coluna que o casamento de
    // faturas, a exportação e o sync leem.
    expect(documentoDoCliente({ cpf_cnpj: "11144477735", custom_fields: {} })).toEqual({ valor: "11144477735", legado: false })
    expect(documentoDoCliente({ cpf_cnpj: null, custom_fields: { cpf_cnpj: "11144477735" } })).toEqual({ valor: "11144477735", legado: true })
    expect(documentoDoCliente(null)).toEqual({ valor: "", legado: false })
  })

  it("formatação diferente não é conflito; dígito diferente é", () => {
    // Das 11 divergências medidas, 5 são só pontuação e 6 são documentos
    // DIFERENTES — duas verdades sobre quem é o cliente, que código nenhum
    // pode escolher sozinho.
    expect(documentoDoCliente({ cpf_cnpj: "11144477735", custom_fields: { cpf_cnpj: "111.444.777-35" } }).conflito).toBeUndefined()
    expect(documentoDoCliente({ cpf_cnpj: "11144477735", custom_fields: { cpf_cnpj: "11222333000181" } }).conflito).toEqual({
      coluna: "11144477735",
      custom_fields: "11222333000181",
    })
  })

  it("formata os dois tamanhos e devolve o original fora deles", () => {
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81")
    expect(formatarDocumento("123")).toBe("123")
  })
})
