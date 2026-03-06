import { describe, it, expect } from "vitest"

/**
 * Testa a logica pura do CurrencyInput sem precisar de DOM/React.
 * Replica as funcoes internas do componente para validar comportamento.
 */

// Replica: formatCents do componente
const formatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatCents(cents: number): string {
  if (cents === 0) return ""
  return formatter.format(cents / 100)
}

// Replica: logica de digitacao (onKeyDown)
const MAX = 9999999999

function pressDigit(current: number, digit: number): number {
  const newValue = current * 10 + digit
  return newValue <= MAX ? newValue : current
}

function backspace(current: number): number {
  return Math.floor(current / 10)
}

// Replica: logica de paste
function simulatePaste(text: string): number {
  const digits = text.replace(/\D/g, "")
  if (!digits) return 0
  let val = parseInt(digits, 10)
  if (isNaN(val)) return 0
  if (val > MAX) val = MAX
  if (val < 0) val = 0
  return val
}

// ==========================================
// TESTES
// ==========================================

describe("CurrencyInput: formatCents", () => {
  it("valor 0 retorna string vazia", () => {
    expect(formatCents(0)).toBe("")
  })

  it("formata centavos corretamente", () => {
    expect(formatCents(1)).toBe("0,01")
    expect(formatCents(9)).toBe("0,09")
    expect(formatCents(10)).toBe("0,10")
    expect(formatCents(60)).toBe("0,60")
    expect(formatCents(99)).toBe("0,99")
  })

  it("formata reais sem milhar", () => {
    expect(formatCents(100)).toBe("1,00")
    expect(formatCents(600)).toBe("6,00")
    expect(formatCents(1999)).toBe("19,99")
  })

  it("formata centenas", () => {
    expect(formatCents(10000)).toBe("100,00")
    expect(formatCents(60000)).toBe("600,00")
    expect(formatCents(99999)).toBe("999,99")
  })

  it("formata milhares com separador de milhar", () => {
    expect(formatCents(100000)).toBe("1.000,00")
    expect(formatCents(600000)).toBe("6.000,00")
    expect(formatCents(1234567)).toBe("12.345,67")
  })

  it("formata valores altos", () => {
    expect(formatCents(100000000)).toBe("1.000.000,00")
    expect(formatCents(123456789)).toBe("1.234.567,89")
    expect(formatCents(9999999999)).toBe("99.999.999,99")
  })
})

describe("CurrencyInput: digitacao (calculator-style)", () => {
  it("digitar 6-0-0-0-0-0 resulta em 600000 centavos (R$ 6.000,00)", () => {
    let v = 0
    v = pressDigit(v, 6)  // 6
    expect(v).toBe(6)
    expect(formatCents(v)).toBe("0,06")

    v = pressDigit(v, 0)  // 60
    expect(v).toBe(60)
    expect(formatCents(v)).toBe("0,60")

    v = pressDigit(v, 0)  // 600
    expect(v).toBe(600)
    expect(formatCents(v)).toBe("6,00")

    v = pressDigit(v, 0)  // 6000
    expect(v).toBe(6000)
    expect(formatCents(v)).toBe("60,00")

    v = pressDigit(v, 0)  // 60000
    expect(v).toBe(60000)
    expect(formatCents(v)).toBe("600,00")

    v = pressDigit(v, 0)  // 600000
    expect(v).toBe(600000)
    expect(formatCents(v)).toBe("6.000,00")
  })

  it("digitar 1 resulta em 1 centavo (R$ 0,01)", () => {
    let v = 0
    v = pressDigit(v, 1)
    expect(v).toBe(1)
    expect(formatCents(v)).toBe("0,01")
  })

  it("digitar 9-9 resulta em 99 centavos (R$ 0,99)", () => {
    let v = 0
    v = pressDigit(v, 9)
    v = pressDigit(v, 9)
    expect(v).toBe(99)
    expect(formatCents(v)).toBe("0,99")
  })

  it("digitar 1-2-3-4-5-6-7-8-9 resulta em R$ 1.234.567,89", () => {
    let v = 0
    for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      v = pressDigit(v, d)
    }
    expect(v).toBe(123456789)
    expect(formatCents(v)).toBe("1.234.567,89")
  })

  it("nao ultrapassa o limite maximo (99.999.999,99)", () => {
    let v = 9999999999
    v = pressDigit(v, 1) // deve recusar
    expect(v).toBe(9999999999)
    expect(formatCents(v)).toBe("99.999.999,99")
  })

  it("limite maximo: 10 digitos aceitos, 11o recusado", () => {
    let v = 0
    // digitar 10 noves = 9999999999
    for (let i = 0; i < 10; i++) {
      v = pressDigit(v, 9)
    }
    expect(v).toBe(9999999999)

    // 11o digito recusado
    v = pressDigit(v, 9)
    expect(v).toBe(9999999999)
  })
})

describe("CurrencyInput: backspace", () => {
  it("remove ultimo digito", () => {
    expect(backspace(600000)).toBe(60000) // R$ 6.000,00 -> R$ 600,00
    expect(backspace(60000)).toBe(6000)   // R$ 600,00 -> R$ 60,00
    expect(backspace(6000)).toBe(600)     // R$ 60,00 -> R$ 6,00
    expect(backspace(600)).toBe(60)       // R$ 6,00 -> R$ 0,60
    expect(backspace(60)).toBe(6)         // R$ 0,60 -> R$ 0,06
    expect(backspace(6)).toBe(0)          // R$ 0,06 -> vazio
  })

  it("backspace em zero continua zero", () => {
    expect(backspace(0)).toBe(0)
  })

  it("backspace em 1 centavo retorna zero", () => {
    expect(backspace(1)).toBe(0)
  })

  it("backspace sequencial ate zero", () => {
    let v = 12345
    v = backspace(v) // 1234
    v = backspace(v) // 123
    v = backspace(v) // 12
    v = backspace(v) // 1
    v = backspace(v) // 0
    expect(v).toBe(0)
    v = backspace(v) // still 0
    expect(v).toBe(0)
  })
})

describe("CurrencyInput: paste", () => {
  it("paste 'R$ 6.000,00' -> 600000 centavos (R$ 6.000,00)", () => {
    const result = simulatePaste("R$ 6.000,00")
    expect(result).toBe(600000)
    expect(formatCents(result)).toBe("6.000,00")
  })

  it("paste '6000' -> 6000 centavos (R$ 60,00)", () => {
    const result = simulatePaste("6000")
    expect(result).toBe(6000)
    expect(formatCents(result)).toBe("60,00")
  })

  it("paste '123456789' -> 123456789 centavos (R$ 1.234.567,89)", () => {
    const result = simulatePaste("123456789")
    expect(result).toBe(123456789)
    expect(formatCents(result)).toBe("1.234.567,89")
  })

  it("paste texto sem numeros -> 0", () => {
    expect(simulatePaste("abc")).toBe(0)
    expect(simulatePaste("")).toBe(0)
    expect(simulatePaste("R$")).toBe(0)
  })

  it("paste '6.5' -> 65 centavos (R$ 0,65)", () => {
    const result = simulatePaste("6.5")
    expect(result).toBe(65)
    expect(formatCents(result)).toBe("0,65")
  })

  it("paste valor acima do limite -> capped no max", () => {
    const result = simulatePaste("99999999999999")
    expect(result).toBe(MAX)
  })

  it("paste 'R$1.234.567,89' -> 123456789", () => {
    const result = simulatePaste("R$1.234.567,89")
    expect(result).toBe(123456789)
  })
})

describe("CurrencyInput: fluxo completo (digitar -> formatar -> converter -> validar)", () => {
  it("usuario digita R$ 6.000,00 e sistema envia 6000.00 para API", () => {
    // Simula digitacao
    let cents = 0
    for (const d of [6, 0, 0, 0, 0, 0]) {
      cents = pressDigit(cents, d)
    }
    expect(cents).toBe(600000)

    // Display formatado
    expect(formatCents(cents)).toBe("6.000,00")

    // Conversao para API (centsToReais)
    const reais = cents / 100
    expect(reais).toBe(6000)

    // Validacao server-side
    expect(Number.isFinite(reais)).toBe(true)
    expect(reais > 0).toBe(true)
    expect(reais <= 99999999.99).toBe(true)
  })

  it("usuario digita R$ 0,01 (valor minimo)", () => {
    let cents = 0
    cents = pressDigit(cents, 1)
    expect(cents).toBe(1)
    expect(formatCents(cents)).toBe("0,01")

    const reais = cents / 100
    expect(reais).toBe(0.01)
    expect(reais > 0).toBe(true)
  })

  it("parcelas: R$ 6.000,00 / 12 = R$ 500,00", () => {
    const cents = 600000
    const reais = cents / 100
    const parcela = reais / 12
    expect(parcela).toBe(500)
  })

  it("parcelas: R$ 6.000,00 / 7 = ~R$ 857,14", () => {
    const cents = 600000
    const reais = cents / 100
    const parcela = reais / 7
    expect(parcela).toBeCloseTo(857.14, 2)
  })

  it("valor zero nao passa validacao", () => {
    const cents = 0
    const reais = cents / 100
    expect(reais).toBe(0)
    expect(reais > 0).toBe(false) // server rejeitaria
  })
})
