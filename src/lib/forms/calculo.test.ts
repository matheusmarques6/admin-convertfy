import { describe, it, expect } from "vitest"
import {
  arredondarParaBaixo,
  avaliarExpressao,
  calcular,
  formatarNumero,
  moedaDoFormulario,
  variaveisDasRespostas,
} from "./calculo"

describe("avaliarExpressao", () => {
  it("faz a aritmética com precedência e parênteses", () => {
    expect(avaliarExpressao("2 + 3 * 4", {})).toBe(14)
    expect(avaliarExpressao("(2 + 3) * 4", {})).toBe(20)
    expect(avaliarExpressao("10 / 4", {})).toBe(2.5)
    expect(avaliarExpressao("-5 + 2", {})).toBe(-3)
  })

  it("lê as variáveis pelo nome", () => {
    expect(avaliarExpressao("visitas * 0.10", { visitas: 2000 })).toBe(200)
    expect(avaliarExpressao("carrinhos - vendas", { carrinhos: 200, vendas: 30 })).toBe(170)
  })

  it("nome que não existe devolve null — o texto cai no fallback", () => {
    expect(avaliarExpressao("visitas * 2", {})).toBeNull()
    expect(avaliarExpressao("a + b", { a: 1 })).toBeNull()
  })

  it("divisão por zero devolve null, nunca Infinity na tela", () => {
    // "Infinity pedidos por mês" é o pior texto que este módulo pode
    // produzir, e ticket zero é resposta possível.
    expect(avaliarExpressao("fat / ticket", { fat: 100000, ticket: 0 })).toBeNull()
  })

  it("recusa tudo que não é número, nome ou operador", () => {
    // É o que mantém `eval` fora: a expressão vem de um schema editável
    // e roda no navegador de quem responde.
    expect(avaliarExpressao("process.exit(1)", {})).toBeNull()
    expect(avaliarExpressao("1; alert(1)", {})).toBeNull()
    expect(avaliarExpressao("`${x}`", { x: 1 })).toBeNull()
    expect(avaliarExpressao("1 ** 2", {})).toBeNull()
  })

  it("sintaxe quebrada devolve null em vez de meio resultado", () => {
    expect(avaliarExpressao("2 +", {})).toBeNull()
    expect(avaliarExpressao("(2 + 3", {})).toBeNull()
    expect(avaliarExpressao("2 3", {})).toBeNull()
    expect(avaliarExpressao("", {})).toBeNull()
  })
})

describe("arredondarParaBaixo", () => {
  it("abaixo de 10 mil, arredonda para a unidade", () => {
    expect(arredondarParaBaixo(89.6)).toBe(89)
    expect(arredondarParaBaixo(4350.9)).toBe(4350)
  })

  it("acima de 10 mil, para o milhar de baixo", () => {
    expect(arredondarParaBaixo(18437.5)).toBe(18000)
    expect(arredondarParaBaixo(103999)).toBe(103000)
  })

  it("nunca para CIMA — a conta mostrada não pode passar da real", () => {
    expect(arredondarParaBaixo(19999)).toBe(19000)
    expect(arredondarParaBaixo(9.99)).toBe(9)
  })
})

describe("formatarNumero", () => {
  it("contagem não leva símbolo de moeda", () => {
    expect(formatarNumero(2000, "numero")).toBe("2.000")
    expect(formatarNumero(89.7, "numero")).toBe("89")
  })

  it("dinheiro acima de 10 mil fala em 'mil'", () => {
    expect(formatarNumero(18437.5, "dinheiro", "BRL")).toBe("R$18 mil")
    expect(formatarNumero(103999, "dinheiro", "USD")).toBe("US$103 mil")
  })

  it("dinheiro abaixo de 10 mil sai cheio — 'R$4 mil' soaria inventado", () => {
    expect(formatarNumero(4350.9, "dinheiro", "BRL")).toBe("R$4.350")
  })

  it("moeda desconhecida cai no real em vez de sair sem símbolo", () => {
    expect(formatarNumero(500, "dinheiro", "XYZ")).toBe("R$500")
  })
})

describe("calcular", () => {
  const CONTA = [
    { nome: "carrinhos", expressao: "visitas * 0.10" },
    { nome: "vendas", expressao: "visitas * 0.015" },
    { nome: "carrinhos_perdidos", expressao: "carrinhos - vendas" },
    { nome: "pedidos_dia", expressao: "carrinhos_perdidos * 0.05" },
    { nome: "receita_dia", expressao: "pedidos_dia * ticket", formato: "dinheiro" as const },
    { nome: "receita_mes", expressao: "receita_dia * 30", formato: "dinheiro" as const },
  ]

  it("encadeia: cada linha enxerga o resultado das anteriores", () => {
    const r = calcular(CONTA, { visitas: 2000, ticket: 300 })
    expect(r.numeros.carrinhos).toBe(200)
    expect(r.numeros.carrinhos_perdidos).toBe(170)
    expect(r.textos.receita_mes).toBe("R$72 mil")
  })

  it("a conta FECHA na tela: o que segue é o número exibido", () => {
    // 170 × 0,05 dá 8,5. O texto diz "8 pedidos"; se a cadeia seguisse
    // com 8,5, a receita do dia sairia R$2.550 e quem multiplicasse
    // 8 × 300 encontraria R$2.400. A conta é mostrada linha a linha
    // justamente para ser refeita de cabeça.
    const r = calcular(CONTA, { visitas: 2000, ticket: 300 })
    expect(r.numeros.pedidos_dia).toBe(8)
    expect(r.textos.pedidos_dia).toBe("8")
    expect(r.numeros.receita_dia).toBe(8 * 300)
    expect(r.textos.receita_dia).toBe("R$2.400")
    expect(r.numeros.receita_mes).toBe(8 * 300 * 30)
  })

  it("cada linha é <= o que a expressão dela produziu", () => {
    // O arredondamento LOCAL nunca sobe. Numa subtração o resultado
    // composto pode ficar acima do valor com decimais (arredondar o
    // subtraendo para baixo aumenta a diferença) — 105 contra 104,89 —,
    // e é por isso que a promessa é linha a linha, não da cadeia
    // inteira. O desvio é sempre menor que uma unidade por parcela.
    const r = calcular(CONTA, { visitas: 1234, ticket: 187 })
    expect(r.numeros.carrinhos).toBe(Math.floor(1234 * 0.1))
    expect(r.numeros.carrinhos_perdidos).toBe(r.numeros.carrinhos - r.numeros.vendas)
    expect(r.numeros.pedidos_dia).toBe(Math.floor(r.numeros.carrinhos_perdidos * 0.05))
    expect(r.numeros.receita_dia).toBeLessThanOrEqual(r.numeros.pedidos_dia * 187)
  })

  it("a moeda da trilha vale para a linha inteira", () => {
    const r = calcular(CONTA, { visitas: 2000, ticket: 90 }, "USD")
    expect(r.textos.receita_mes.startsWith("US$")).toBe(true)
  })

  it("linha que não avalia é pulada, e as que dependem dela também", () => {
    // Sem `ticket`, a receita não existe — e o texto que a cita cai no
    // fallback, em vez de imprimir uma conta pela metade.
    const r = calcular(CONTA, { visitas: 2000 })
    expect(r.numeros.carrinhos).toBe(200)
    expect(r.textos).not.toHaveProperty("receita_dia")
    expect(r.textos).not.toHaveProperty("receita_mes")
  })

  it("não muta a base recebida", () => {
    const base = { visitas: 1000 }
    calcular(CONTA, base)
    expect(base).toEqual({ visitas: 1000 })
  })

  it("lista vazia ou ausente devolve a base intacta", () => {
    expect(calcular(undefined, { a: 1 })).toEqual({ numeros: { a: 1 }, textos: {} })
  })
})

describe("variaveisDasRespostas", () => {
  const BLOCOS = [
    {
      ref: "f-acessos",
      variavel: "visitas",
      options: [
        { value: "ate_300", valor: 300 },
        { value: "1000_3000", valor: 2000 },
        { value: "nao_sei" },
      ],
    },
    { ref: "f-ticket", variavel: "ticket", options: [{ value: "200_400", valor: 300 }] },
    { ref: "f-nome", options: [{ value: "x", valor: 9 }] },
  ]

  it("traduz a escolha no número que a opção representa", () => {
    const v = variaveisDasRespostas(BLOCOS, { "f-acessos": "1000_3000", "f-ticket": "200_400" })
    expect(v).toEqual({ visitas: 2000, ticket: 300 })
  })

  it("bloco sem `variavel` não entra na conta", () => {
    expect(variaveisDasRespostas(BLOCOS, { "f-nome": "x" })).toEqual({})
  })

  it("opção sem `valor` NÃO vira zero", () => {
    // Zero é plausível e sairia impresso — "0 carrinhos por dia" —
    // contaminando toda a cadeia. Sem a variável, o texto cai no fallback.
    expect(variaveisDasRespostas(BLOCOS, { "f-acessos": "nao_sei" })).toEqual({})
  })

  it("resposta que não é opção conhecida é ignorada", () => {
    expect(variaveisDasRespostas(BLOCOS, { "f-acessos": "inventada" })).toEqual({})
    expect(variaveisDasRespostas(BLOCOS, { "f-acessos": ["a"] })).toEqual({})
  })
})

describe("a moeda da conta", () => {
  const BLOCOS = [
    { ref: "f-regiao", variavel: null },
    {
      ref: "f-fat",
      variavel: "faturamento",
      opcoes_por_moeda: true,
      moeda_de: "f-regiao",
    },
  ]

  it("sai da região respondida", () => {
    expect(moedaDoFormulario(BLOCOS, { "f-regiao": "Estados Unidos" })).toBe("USD")
    expect(moedaDoFormulario(BLOCOS, { "f-regiao": "Europa" })).toBe("EUR")
    expect(moedaDoFormulario(BLOCOS, { "f-regiao": "Brasil" })).toBe("BRL")
  })

  it("região sem resposta devolve null — quem chama escolhe o padrão", () => {
    // Cair no real aqui dentro faria a loja americana ver a conta em real
    // sem nada dizendo por quê.
    expect(moedaDoFormulario(BLOCOS, {})).toBeNull()
    expect(moedaDoFormulario(BLOCOS, { "f-regiao": "Marte" })).toBeNull()
    expect(moedaDoFormulario([{ ref: "x", variavel: "a" }], { x: "Brasil" })).toBeNull()
  })

  it("a faixa por moeda entra na conta NA MOEDA da pessoa, pelo piso", () => {
    // O que viaja na opção é o piso em REAL (a régua da qualificação).
    // Na conta ele volta à moeda de quem respondeu: 50 mil dólares, não
    // 250 mil de coisa nenhuma.
    const v = variaveisDasRespostas(BLOCOS, {
      "f-regiao": "Estados Unidos",
      "f-fat": "US$50k – US$100k",
    })
    expect(v).toEqual({ faturamento: 50_000 })

    const br = variaveisDasRespostas(BLOCOS, {
      "f-regiao": "Brasil",
      "f-fat": "R$200k – R$500k",
    })
    expect(br).toEqual({ faturamento: 200_000 })
  })

  it("faixa respondida antes da região não vira número", () => {
    expect(variaveisDasRespostas(BLOCOS, { "f-fat": "US$50k – US$100k" })).toEqual({})
  })

  it("rótulo de outra moeda não casa — e não vira zero", () => {
    // Trocar a região poda a resposta (podarRespostasDependentes); se
    // escapar, a conta some em vez de sair na unidade errada.
    expect(
      variaveisDasRespostas(BLOCOS, { "f-regiao": "Brasil", "f-fat": "US$50k – US$100k" }),
    ).toEqual({})
  })
})
