import { describe, it, expect } from "vitest"

import { classificarFalha, planejarRetentativa, avisoDeContaPerdida } from "./retry-teto"

describe("classificarFalha", () => {
  // A evidência FORTE é o finishReason. Os dois serviços hoje decidem só por
  // tokensOutput >= max_tokens, que é a fraca — o provedor pode reportar
  // consumo abaixo do teto e ainda assim ter cortado.
  it("finishReason 'length' é truncado mesmo com consumo abaixo do teto", () => {
    expect(
      classificarFalha({ finishReason: "length", tokensOutput: 100, maxTokens: 8192 }),
    ).toBe("truncado")
    expect(
      classificarFalha({ finishReason: "max_tokens", tokensOutput: 100, maxTokens: 8192 }),
    ).toBe("truncado")
  })

  it("consumo no teto, sem finishReason, ainda é truncado", () => {
    expect(classificarFalha({ tokensOutput: 8192, maxTokens: 8192 })).toBe("truncado")
  })

  // O abort do relógio vira `new Error("timeout")` em llm-invoke.ts.
  it("timeout e abort são timeout, venham de onde vierem", () => {
    expect(classificarFalha({ erro: "timeout", maxTokens: 8192 })).toBe("timeout")
    expect(classificarFalha({ erro: "The operation was aborted", maxTokens: 8192 })).toBe(
      "timeout",
    )
    expect(
      classificarFalha({ erro: "sem orçamento: o que resta da janela…", maxTokens: 8192 }),
    ).toBe("timeout")
  })

  it("JSON quebrado com finish normal é ilegível", () => {
    expect(
      classificarFalha({
        finishReason: "stop",
        tokensOutput: 900,
        maxTokens: 8192,
        erro: "Unexpected end of JSON input",
      }),
    ).toBe("ilegivel")
  })

  it("reprovação do validador é validacao, não ilegível", () => {
    expect(
      classificarFalha({
        finishReason: "stop",
        tokensOutput: 900,
        maxTokens: 8192,
        ehValidacao: true,
      }),
    ).toBe("validacao")
  })

  // Timeout vence tudo: sem resposta não há finishReason em que confiar.
  it("timeout vence o finishReason", () => {
    expect(
      classificarFalha({ finishReason: "length", erro: "timeout", maxTokens: 8192 }),
    ).toBe("timeout")
  })
})

describe("planejarRetentativa", () => {
  const base = { tentativa: 1, maxAttempts: 2, tetoAtual: 8192, tetoMaximo: 24000 }

  it("truncado com folga sobe o teto, limitado ao máximo", () => {
    const p = planejarRetentativa({ ...base, causa: "truncado" })
    expect(p.repetir).toBe(true)
    expect(p.maxTokens).toBe(Math.floor(8192 * 1.5))
    expect(p.motivo).toContain("8192")

    // O fator não pode passar do teto do agente: cada token a mais é tempo
    // (~90 tok/s) e reserva de crédito em voo.
    const noLimite = planejarRetentativa({
      ...base,
      causa: "truncado",
      tetoAtual: 20000,
      tetoMaximo: 24000,
    })
    expect(noLimite.maxTokens).toBe(24000)
  })

  // É a regra do llm-invoke.ts:147, que nunca desceu para o loop dos serviços.
  it("truncado JÁ no teto máximo não repete, e o motivo diz o número", () => {
    const p = planejarRetentativa({
      ...base,
      causa: "truncado",
      tetoAtual: 24000,
      tetoMaximo: 24000,
    })
    expect(p.repetir).toBe(false)
    expect(p.motivo).toContain("24000")
    expect(p.motivo).toContain("0%")
  })

  // A 2ª tentativa teria o mesmo relógio e menos orçamento — morreria igual,
  // mais tarde, tendo comido o tempo do Curador (que não é pulável).
  it("timeout nunca repete", () => {
    const p = planejarRetentativa({ ...base, causa: "timeout" })
    expect(p.repetir).toBe(false)
    expect(p.maxTokens).toBe(8192)
    expect(p.motivo).toContain("tempo")
  })

  it("ilegível e validação repetem com o MESMO teto — o retry existe para eles", () => {
    for (const causa of ["ilegivel", "validacao"] as const) {
      const p = planejarRetentativa({ ...base, causa })
      expect(p.repetir).toBe(true)
      expect(p.maxTokens).toBe(8192)
    }
  })

  it("tentativas esgotadas nunca repetem, qualquer que seja a causa", () => {
    for (const causa of ["truncado", "ilegivel", "validacao", "timeout"] as const) {
      const p = planejarRetentativa({ ...base, causa, tentativa: 2, maxAttempts: 2 })
      expect(p.repetir).toBe(false)
      expect(p.motivo).toContain("esgotadas")
    }
  })

  // O incidente inteiro em um teste: teto 8.192, truncou, e a 2ª chamada
  // idêntica gastou outros 7.513 tokens para morrer igual.
  it("regressão 10/09: o seletor não repete mais com 8192 quando 8192 truncou", () => {
    const causa = classificarFalha({
      finishReason: "length",
      tokensOutput: 8192,
      maxTokens: 8192,
    })
    const p = planejarRetentativa({ ...base, causa })
    expect(p.maxTokens).toBeGreaterThan(8192)
  })
})

describe("avisoDeContaPerdida", () => {
  // A run gravaria 0 tokens e $0,00 numa chamada paga. Se o número não
  // existe, a run diz que não existe — não afirma zero.
  it("declara que a conta se perdeu, com o tempo em segundos", () => {
    const t = avisoDeContaPerdida(240_000)
    expect(t).toContain("240s")
    expect(t).toContain("não foram contabilizados")
  })
})
