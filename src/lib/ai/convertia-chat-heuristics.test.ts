import { describe, expect, it } from "vitest"
import { describeToolArgs, isAnalyticalQuestion } from "./convertia-chat-heuristics"

describe("isAnalyticalQuestion", () => {
  it("reconhece perguntas de métricas e performance", () => {
    expect(isAnalyticalQuestion("Como foi a performance de email nos últimos 30 dias?")).toBe(true)
    expect(isAnalyticalQuestion("qual foi a receita desse mês?")).toBe(true)
    expect(isAnalyticalQuestion("Analise as campanhas da loja")).toBe(true)
    expect(isAnalyticalQuestion("teve queda de open rate?")).toBe(true)
    expect(isAnalyticalQuestion("quantos pedidos ontem?")).toBe(true)
    expect(isAnalyticalQuestion("faça uma auditoria dos flows")).toBe(true)
    expect(isAnalyticalQuestion("me dá um relatório da loja")).toBe(true)
    expect(isAnalyticalQuestion("compare essa semana com a anterior")).toBe(true)
  })

  it("não dispara em conversa comum ou pedidos criativos", () => {
    expect(isAnalyticalQuestion("oi, tudo bem?")).toBe(false)
    expect(isAnalyticalQuestion("escreva um email de boas-vindas")).toBe(false)
    expect(isAnalyticalQuestion("gera uma imagem de um tênis vermelho")).toBe(false)
    expect(isAnalyticalQuestion("obrigado!")).toBe(false)
  })

  it("mensagem curta demais nunca dispara", () => {
    expect(isAnalyticalQuestion("vendas")).toBe(false)
    expect(isAnalyticalQuestion("   ")).toBe(false)
  })
})

describe("describeToolArgs", () => {
  it("resume pares primitivos", () => {
    expect(describeToolArgs({ period: "30d", status: "paid" })).toBe(
      "period: 30d · status: paid",
    )
    expect(describeToolArgs({ limit: 50, ativo: true })).toBe("limit: 50 · ativo: true")
  })

  it("ignora objetos aninhados e strings vazias, mantém arrays curtas", () => {
    expect(
      describeToolArgs({ filtro: { a: 1 }, nome: "", tags: ["vip", "novo"] }),
    ).toBe("tags: vip, novo")
  })

  it("trunca valores longos e limita a 4 pares", () => {
    const out = describeToolArgs({
      a: "x".repeat(60),
      b: "1",
      c: "2",
      d: "3",
      e: "nunca aparece",
    })
    expect(out).toContain("a: " + "x".repeat(40) + "…")
    expect(out).not.toContain("nunca aparece")
  })

  it("devolve null sem nada útil", () => {
    expect(describeToolArgs(null)).toBeNull()
    expect(describeToolArgs("str")).toBeNull()
    expect(describeToolArgs({})).toBeNull()
    expect(describeToolArgs({ deep: { x: 1 } })).toBeNull()
  })

  it("resumo total é truncado no teto", () => {
    const out = describeToolArgs({
      campo_um: "valor bem comprido aqui dentro",
      campo_dois: "outro valor bem comprido aqui",
      campo_tres: "mais um valor comprido",
    })
    expect(out).not.toBeNull()
    expect(out!.length).toBeLessThanOrEqual(91)
  })
})
