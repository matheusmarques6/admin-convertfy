import { describe, expect, it } from "vitest"
import {
  decidirCriacaoNoAsaas,
  explicarDuplicataAsaas,
  JANELA_CLIQUE_DUPLO_MS,
  type AssinaturaAsaas,
} from "./asaas-assinatura-duplicada"

const AGORA = new Date("2026-09-08T19:00:00Z")
const haMinutos = (m: number) => new Date(AGORA.getTime() - m * 60_000).toISOString()

const sub = (over: Partial<AssinaturaAsaas> = {}): AssinaturaAsaas => ({
  id: "sub_x",
  value: 2497,
  cycle: "MONTHLY",
  status: "ACTIVE",
  description: "Aplicação da Metodologia de E-mail Marketing",
  dateCreated: haMinutos(120),
  ...over,
})

const pedido = { value: 2497, cycle: "MONTHLY", description: "Aplicação da Metodologia de E-mail Marketing" }

describe("decidirCriacaoNoAsaas", () => {
  it("cliente sem assinatura: cria", () => {
    expect(decidirCriacaoNoAsaas([], pedido, AGORA)).toEqual({ acao: "criar" })
  })

  it("clique duplo (2 min): REUSA — nunca cria a segunda", () => {
    // É o caso da EP Negócios: duas de R$ 2.497 idênticas no Asaas,
    // cobrando o cliente duas vezes por mês.
    const d = decidirCriacaoNoAsaas([sub({ dateCreated: haMinutos(2) })], pedido, AGORA)
    expect(d.acao).toBe("reusar")
  })

  it("na borda da janela ainda reusa", () => {
    const borda = new Date(AGORA.getTime() - JANELA_CLIQUE_DUPLO_MS).toISOString()
    expect(decidirCriacaoNoAsaas([sub({ dateCreated: borda })], pedido, AGORA).acao).toBe("reusar")
  })

  it("idêntica antiga: pede CONFIRMAÇÃO, não recusa", () => {
    // Pode ser a segunda loja do cliente — e recusar em silêncio faria a
    // venda nova não ser cobrada.
    const d = decidirCriacaoNoAsaas([sub({ dateCreated: haMinutos(60 * 24 * 30) })], pedido, AGORA)
    expect(d.acao).toBe("confirmar")
    if (d.acao === "confirmar") expect(d.existente.id).toBe("sub_x")
  })

  it("sem dateCreated pede confirmação — não afirma recência que não tem", () => {
    const d = decidirCriacaoNoAsaas([sub({ dateCreated: null })], pedido, AGORA)
    expect(d.acao).toBe("confirmar")
  })

  it("data ilegível cai em confirmar, não quebra", () => {
    expect(decidirCriacaoNoAsaas([sub({ dateCreated: "n/d" })], pedido, AGORA).acao).toBe("confirmar")
  })

  it("valor diferente: cria", () => {
    expect(decidirCriacaoNoAsaas([sub({ value: 3500 })], pedido, AGORA)).toEqual({ acao: "criar" })
  })

  it("ciclo diferente: cria — trimestral e mensal não são a mesma cobrança", () => {
    expect(decidirCriacaoNoAsaas([sub({ cycle: "QUARTERLY" })], pedido, AGORA)).toEqual({ acao: "criar" })
  })

  it("descrição diferente: cria", () => {
    expect(
      decidirCriacaoNoAsaas([sub({ description: "Consultoria avulsa" })], pedido, AGORA),
    ).toEqual({ acao: "criar" })
  })

  it("acento e caixa não separam a mesma descrição", () => {
    // Quem digita escreve "Portatil" numa vez e "Portátil" na outra.
    const d = decidirCriacaoNoAsaas(
      [sub({ description: "energia  PORTATIL", dateCreated: haMinutos(1) })],
      { value: 2497, cycle: "MONTHLY", description: "Energia Portátil" },
      AGORA,
    )
    expect(d.acao).toBe("reusar")
  })

  it("descrição vazia dos dois lados ainda casa por valor e ciclo", () => {
    const d = decidirCriacaoNoAsaas(
      [sub({ description: null, dateCreated: haMinutos(1) })],
      { value: 2497, cycle: "MONTHLY" },
      AGORA,
    )
    expect(d.acao).toBe("reusar")
  })

  it("cancelada no Asaas não bloqueia a nova", () => {
    expect(
      decidirCriacaoNoAsaas([sub({ status: "EXPIRED", dateCreated: haMinutos(1) })], pedido, AGORA),
    ).toEqual({ acao: "criar" })
  })

  it("status ausente conta como ativa — ignorar seria liberar a duplicata", () => {
    const d = decidirCriacaoNoAsaas([sub({ status: null, dateCreated: haMinutos(1) })], pedido, AGORA)
    expect(d.acao).toBe("reusar")
  })

  it("string com decimais casa com número", () => {
    const d = decidirCriacaoNoAsaas(
      [sub({ value: "2497.00", dateCreated: haMinutos(1) })],
      pedido,
      AGORA,
    )
    expect(d.acao).toBe("reusar")
  })

  it("valor pedido ilegível não casa com nada", () => {
    expect(
      decidirCriacaoNoAsaas([sub()], { value: Number.NaN, cycle: "MONTHLY" }, AGORA),
    ).toEqual({ acao: "criar" })
  })

  it("entre várias idênticas, a mais recente decide", () => {
    const d = decidirCriacaoNoAsaas(
      [
        sub({ id: "velha", dateCreated: haMinutos(60 * 24 * 90) }),
        sub({ id: "nova", dateCreated: haMinutos(3) }),
      ],
      pedido,
      AGORA,
    )
    expect(d.acao).toBe("reusar")
    if (d.acao === "reusar") expect(d.existente.id).toBe("nova")
  })
})

describe("explicarDuplicataAsaas", () => {
  it("diz a consequência em dinheiro, não o estado interno", () => {
    const msg = explicarDuplicataAsaas(sub({ dateCreated: "2026-07-24T10:00:00Z" }))
    expect(msg).toContain("24/07/2026")
    expect(msg).toContain("duas vezes por ciclo")
  })

  it("sem data, ainda explica", () => {
    expect(explicarDuplicataAsaas(sub({ dateCreated: null }))).toContain("já tem uma assinatura")
  })
})
