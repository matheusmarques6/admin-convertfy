import { describe, expect, it } from "vitest"
import {
  causasProvaveis,
  compararMetrica,
  TOLERANCIA,
  type ContextoDaAuditoria,
  type Divergencia,
} from "./auditoria-receita"

const OK: ContextoDaAuditoria = {
  fusoDoCadastro: "America/Sao_Paulo",
  fusoDaBrand: "America/Sao_Paulo",
  atribuidoComparavelComOPainel: true,
  houveDegradacao: false,
}

describe("compararMetrica", () => {
  it("mede o caso real relatado (Blue Wolf, agosto)", () => {
    const d = compararMetrica("Faturamento total", 214_100, 213_193.59)
    expect(d.diferenca).toBeCloseTo(906.41, 2)
    expect(d.diferencaPct!).toBeCloseTo(0.00425, 5)
    expect(d.relevante).toBe(true)
  })

  it("diferença abaixo da tolerância não vira alarme", () => {
    // A plataforma reprocessa atribuição entre leituras; apontar isso
    // como defeito ensina o operador a ignorar o aviso de verdade.
    const d = compararMetrica("Receita atribuída", 51_176.9, 51_176.38)
    expect(Math.abs(d.diferencaPct!)).toBeLessThan(TOLERANCIA)
    expect(d.relevante).toBe(false)
  })

  it("sem número nosso, não inventa comparação", () => {
    const d = compararMetrica("Pedidos", null, 2267)
    expect(d.diferenca).toBeNull()
    expect(d.diferencaPct).toBeNull()
    expect(d.relevante).toBe(false)
  })

  it("plataforma em zero não vira percentual infinito", () => {
    const d = compararMetrica("Receita atribuída", 500, 0)
    expect(d.diferencaPct).toBeNull()
    expect(d.relevante).toBe(true)
  })

  it("zero contra zero não é divergência", () => {
    const d = compararMetrica("Receita atribuída", 0, 0)
    expect(d.relevante).toBe(false)
  })
})

describe("causasProvaveis", () => {
  const grande: Divergencia[] = [compararMetrica("Faturamento total", 214_100, 213_193.59)]

  it("sem divergência relevante, não lista causa nenhuma", () => {
    const iguais = [compararMetrica("Faturamento total", 213_193.59, 213_193.59)]
    expect(causasProvaveis(iguais, { ...OK, atribuidoComparavelComOPainel: false })).toEqual([])
  })

  it("fuso diferente do da conta é a primeira causa", () => {
    const c = causasProvaveis(grande, { ...OK, fusoDaBrand: "America/New_York" })
    expect(c[0]).toContain("America/New_York")
    expect(c[0]).toContain("America/Sao_Paulo")
  })

  it("loja sem fuso cadastrado é dita como fuso assumido", () => {
    const c = causasProvaveis(grande, { ...OK, fusoDoCadastro: null })
    expect(c[0]).toContain("não tem fuso cadastrado")
  })

  it("atribuído sem calibração é nomeado", () => {
    const c = causasProvaveis(grande, { ...OK, atribuidoComparavelComOPainel: false })
    expect(c.join(" ")).toContain("data do pedido")
  })

  it("nenhuma causa conhecida devolve lista vazia, não um palpite", () => {
    expect(causasProvaveis(grande, OK)).toEqual([])
  })

  it("acumula as causas quando há mais de uma", () => {
    const c = causasProvaveis(grande, {
      fusoDoCadastro: "America/Sao_Paulo",
      fusoDaBrand: "Europe/Berlin",
      atribuidoComparavelComOPainel: false,
      houveDegradacao: true,
    })
    expect(c).toHaveLength(3)
  })
})
