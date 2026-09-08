import { describe, expect, it } from "vitest"
import {
  avisoDeAssinaturaExistente,
  suspeitasDeDuplicata,
  type AssinaturaAsaas,
  type AssinaturaLocal,
} from "./assinatura-duplicada"

const local = (over: Partial<AssinaturaLocal> & { id: string }): AssinaturaLocal => ({
  value: 3500,
  cycle: "MONTHLY",
  status: "active",
  ...over,
})
const asaas = (over: Partial<AssinaturaAsaas> & { id: string }): AssinaturaAsaas => ({
  value: 3500,
  cycle: "MONTHLY",
  status: "active",
  ...over,
})

describe("suspeitasDeDuplicata", () => {
  it("o caso medido: espelho órfão do fechamento × assinatura do Asaas", () => {
    // Camila: "Assinatura — Camila" R$ 3.500 sem asaas_subscription_id,
    // e a assinatura do Asaas de R$ 3.500 do mesmo cliente. Dois cards,
    // uma assinatura.
    const s = suspeitasDeDuplicata(
      [local({ id: "loc", name: "Assinatura — Camila" })],
      [asaas({ id: "sub_x", name: "Plano Mensal" })],
    )
    expect(s).toEqual([{ localId: "loc", asaasId: "sub_x", asaasNome: "Plano Mensal" }])
  })

  it("local já vinculada não é suspeita — o merge do GET já a esconde", () => {
    const s = suspeitasDeDuplicata(
      [local({ id: "loc", asaas_subscription_id: "sub_x" })],
      [asaas({ id: "sub_x" })],
    )
    expect(s).toEqual([])
  })

  it("assinatura do Asaas já reivindicada por outra local fica fora", () => {
    // Oferecê-la de novo criaria duas locais apontando para a mesma
    // assinatura — o vínculo duplo que o índice único recusa.
    const s = suspeitasDeDuplicata(
      [local({ id: "vinculada", asaas_subscription_id: "sub_x" }), local({ id: "orfa" })],
      [asaas({ id: "sub_x" })],
    )
    expect(s).toEqual([])
  })

  it("JMJC: duas órfãs do mesmo valor não apontam nada", () => {
    // Duas de R$ 3.500 disputando a mesma do Asaas: escolher no chute
    // faria fundir a assinatura da loja errada.
    const s = suspeitasDeDuplicata(
      [local({ id: "a" }), local({ id: "b" })],
      [asaas({ id: "sub_x" })],
    )
    expect(s).toEqual([])
  })

  it("uma órfã e DUAS do Asaas do mesmo valor também se cala", () => {
    const s = suspeitasDeDuplicata(
      [local({ id: "a" })],
      [asaas({ id: "sub_x" }), asaas({ id: "sub_y" })],
    )
    expect(s).toEqual([])
  })

  it("valores diferentes no mesmo cliente casam cada um com o seu", () => {
    const s = suspeitasDeDuplicata(
      [local({ id: "a", value: 3500 }), local({ id: "b", value: "10000.00" })],
      [asaas({ id: "sub_10k", value: 10000 }), asaas({ id: "sub_35", value: "3500.00" })],
    )
    expect(s).toEqual([
      { localId: "a", asaasId: "sub_35", asaasNome: "Assinatura Asaas" },
      { localId: "b", asaasId: "sub_10k", asaasNome: "Assinatura Asaas" },
    ])
  })

  it("ciclo diferente não casa — Frederico tinha trimestral × mensal", () => {
    // "Plano Trimestral" de R$ 10.000 e "Assinatura — Frederico" mensal
    // de R$ 10.000 são cobranças MUITO diferentes; fundi-las mudaria o
    // que o cliente paga por ano.
    const s = suspeitasDeDuplicata(
      [local({ id: "a", value: 10000, cycle: "MONTHLY" })],
      [asaas({ id: "sub_x", value: 10000, cycle: "QUARTERLY" })],
    )
    expect(s).toEqual([])
  })

  it("ciclo ausente conta como mensal dos dois lados", () => {
    const s = suspeitasDeDuplicata(
      [local({ id: "a", cycle: null })],
      [asaas({ id: "sub_x", cycle: undefined })],
    )
    expect(s).toHaveLength(1)
  })

  it("string com casas decimais casa com número", () => {
    const s = suspeitasDeDuplicata(
      [local({ id: "a", value: "3500.00" })],
      [asaas({ id: "sub_x", value: 3500 })],
    )
    expect(s).toHaveLength(1)
  })

  it("cancelada dos dois lados fica fora", () => {
    expect(
      suspeitasDeDuplicata([local({ id: "a", status: "cancelled" })], [asaas({ id: "sub_x" })]),
    ).toEqual([])
    expect(
      suspeitasDeDuplicata([local({ id: "a" })], [asaas({ id: "sub_x", status: "EXPIRED" })]),
    ).toEqual([])
  })

  it("status ausente conta como ativa — sumir por campo vazio é o silêncio que isto acaba", () => {
    const s = suspeitasDeDuplicata(
      [local({ id: "a", status: null })],
      [asaas({ id: "sub_x", status: undefined })],
    )
    expect(s).toHaveLength(1)
  })

  it("valor ilegível não vira suspeita", () => {
    const s = suspeitasDeDuplicata([local({ id: "a", value: "n/d" })], [asaas({ id: "sub_x" })])
    expect(s).toEqual([])
  })

  it("listas vazias não quebram", () => {
    expect(suspeitasDeDuplicata([], [])).toEqual([])
  })
})

describe("avisoDeAssinaturaExistente", () => {
  it("cliente sem assinatura não recebe aviso", () => {
    expect(avisoDeAssinaturaExistente([], 3500)).toBeNull()
  })

  it("mesmo valor: pede confirmação de que é outra loja", () => {
    const msg = avisoDeAssinaturaExistente([local({ id: "a", value: 3500 })], 3500)
    expect(msg).toContain("mesmo valor")
    expect(msg).toContain("outra loja")
  })

  it("várias do mesmo valor diz quantas", () => {
    const msg = avisoDeAssinaturaExistente(
      [local({ id: "a" }), local({ id: "b" })],
      3500,
    )
    expect(msg).toContain("2 assinaturas ativas")
  })

  it("valor diferente ainda avisa que a nova SOMA", () => {
    const msg = avisoDeAssinaturaExistente([local({ id: "a", value: 3500 })], 9000)
    expect(msg).toContain("1 assinatura ativa")
    expect(msg).toContain("além")
  })

  it("assinatura cancelada não gera aviso", () => {
    expect(
      avisoDeAssinaturaExistente([local({ id: "a", status: "cancelled" })], 3500),
    ).toBeNull()
  })
})
