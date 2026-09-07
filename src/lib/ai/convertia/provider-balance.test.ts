import { describe, expect, it } from "vitest"
import { classificarSaldo, deveAlertar } from "./provider-balance"

describe("classificarSaldo", () => {
  it("acima do piso é ok; abaixo é baixo; zero ou negativo é esgotado", () => {
    expect(classificarSaldo(50, 5)).toBe("ok")
    expect(classificarSaldo(5, 5)).toBe("baixo") // no piso já é baixo
    expect(classificarSaldo(4.99, 5)).toBe("baixo")
    expect(classificarSaldo(0, 5)).toBe("esgotado")
    expect(classificarSaldo(-1.2, 5)).toBe("esgotado")
  })

  it("null é DESCONHECIDO, nunca esgotado", () => {
    // A consulta falhar (timeout, 500 do OpenRouter) não é notícia sobre o
    // saldo. Tratar como "acabou" dispararia alerta falso, e alerta falso é
    // como a equipe aprende a ignorar o alerta verdadeiro.
    expect(classificarSaldo(null, 5)).toBe("desconhecido")
    expect(classificarSaldo(Number.NaN, 5)).toBe("desconhecido")
    expect(classificarSaldo(Number.POSITIVE_INFINITY, 5)).toBe("desconhecido")
  })
})

describe("deveAlertar", () => {
  it("avisa na primeira medição ruim", () => {
    expect(deveAlertar(null, "baixo")).toBe(true)
    expect(deveAlertar(null, "esgotado")).toBe(true)
  })

  it("NÃO repete enquanto continua ruim", () => {
    // O cron roda de hora em hora. Sem esta regra seriam 24 notificações
    // por dia dizendo a mesma coisa até alguém recarregar.
    expect(deveAlertar("baixo", "baixo")).toBe(false)
    expect(deveAlertar("esgotado", "esgotado")).toBe(false)
  })

  it("avisa de novo quando PIORA, e cala quando melhora", () => {
    expect(deveAlertar("baixo", "esgotado")).toBe(true)
    expect(deveAlertar("esgotado", "baixo")).toBe(false)
    expect(deveAlertar("esgotado", "ok")).toBe(false)
    expect(deveAlertar("baixo", "ok")).toBe(false)
  })

  it("volta a avisar depois de recarregar e cair de novo", () => {
    expect(deveAlertar("ok", "baixo")).toBe(true)
    expect(deveAlertar("ok", "esgotado")).toBe(true)
  })

  it("desconhecido não dispara nem silencia o próximo alerta", () => {
    expect(deveAlertar("baixo", "desconhecido")).toBe(false)
    expect(deveAlertar("ok", "desconhecido")).toBe(false)
    // Uma falha de consulta no meio não pode fazer o alerta seguinte ser
    // engolido como "já avisei".
    expect(deveAlertar("desconhecido", "esgotado")).toBe(true)
    expect(deveAlertar("desconhecido", "baixo")).toBe(true)
  })
})
