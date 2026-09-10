import { describe, expect, it } from "vitest"
import { emBRL, moedasNaoConvertidas, normalizarMoeda, somarEmBRL } from "./converter-lote"

const taxas = new Map([
  ["BRL", 1],
  ["EUR", 6.2],
  ["GBP", 7.4],
  ["PLN", 1.45],
])

describe("somarEmBRL", () => {
  it("soma libra e euro como REAIS, não como unidades", () => {
    // O defeito: 1.000 libras entravam no total como 1.000 reais — sete
    // vezes menos, com o total ainda parecendo plausível.
    const linhas = [
      { v: 1000, m: "GBP" },
      { v: 1000, m: "EUR" },
      { v: 1000, m: "BRL" },
    ]
    const total = somarEmBRL(linhas, (l) => l.v, (l) => l.m, taxas)
    expect(total).toBeCloseTo(7400 + 6200 + 1000, 2)
    // A soma crua, que era o que a tela publicava:
    expect(total).toBeGreaterThan(3000)
  })

  it("moeda ausente conta como real, não some do total", () => {
    expect(emBRL(500, null, taxas)).toBe(500)
    expect(emBRL(500, "", taxas)).toBe(500)
  })

  it("moeda sem taxa entra na moeda ORIGINAL em vez de virar zero", () => {
    // Perder a linha seria pior que subestimá-la: o total ficaria menor
    // ainda, e sem nada dizendo que faltou.
    expect(emBRL(100, "JPY", taxas)).toBe(100)
  })

  it("caixa e espaço não fazem a mesma moeda virar duas", () => {
    expect(normalizarMoeda(" eur ")).toBe("EUR")
    expect(emBRL(100, " eur ", taxas)).toBeCloseTo(620, 2)
  })

  it("zero não multiplica nada e lista vazia soma zero", () => {
    expect(emBRL(0, "EUR", taxas)).toBe(0)
    expect(somarEmBRL([], () => 1, () => "EUR", taxas)).toBe(0)
  })

  it("moeda estrangeira com taxa 1 é DECLARADA como não convertida", () => {
    // Taxa 1 fora do BRL é o sinal de que o câmbio não respondeu — a tela
    // precisa poder dizer que o total mistura moedas.
    const t = new Map([["BRL", 1], ["EUR", 6.2], ["DKK", 1]])
    expect(moedasNaoConvertidas(t)).toEqual(["DKK"])
  })
})
