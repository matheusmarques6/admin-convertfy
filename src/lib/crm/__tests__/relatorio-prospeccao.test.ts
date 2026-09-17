import { describe, it, expect } from "vitest"
import {
  META_DIARIA,
  contagemRegressiva,
  degrauAlcancado,
  evolucaoDiaria,
  extratoDoParceiro,
  montarRelatorio,
  type NegocioDoRelatorio,
} from "../relatorio-prospeccao"

function neg(over: Partial<NegocioDoRelatorio> = {}): NegocioDoRelatorio {
  return {
    id: "d1",
    segmento: "A · Aluno Luan",
    maturidade: null,
    status: "open",
    value: null,
    lost_reason: null,
    etapasVisitadas: ["A · Aluno Luan"],
    ...over,
  }
}

describe("degrauAlcancado", () => {
  it("usa o degrau MAIS ALTO por onde passou", () => {
    expect(
      degrauAlcancado(["A · Aluno Luan", "T1 · Abordado", "T2 · Follow-up com valor"]),
    ).toBe(2)
  })

  it("coluna de entrada não é degrau — ninguém foi abordado ainda", () => {
    expect(degrauAlcancado(["D · MQL sem conversa"])).toBe(0)
  })

  it("PERDIDO por silêncio não avança o degrau", () => {
    // Contar assim inflaria a taxa de resposta com exatamente quem NÃO
    // respondeu — o pior erro possível neste relatório.
    expect(
      degrauAlcancado(["T3 · Último toque", "Perdido · sem resposta"]),
    ).toBe(3)
  })

  it("Nutrir também não avança", () => {
    expect(
      degrauAlcancado(["Respondeu · qualificar", "Nutrir · loja sem vendas"]),
    ).toBe(4)
  })

  it("etapa desconhecida é ignorada em vez de derrubar a conta", () => {
    expect(degrauAlcancado(["Coluna inventada", "T1 · Abordado"])).toBe(1)
  })
})

describe("contagem por segmento é cumulativa", () => {
  it("quem chegou à proposta conta em abordado e respondeu também", () => {
    const r = montarRelatorio([
      neg({
        etapasVisitadas: [
          "A · Aluno Luan",
          "T1 · Abordado",
          "Respondeu · qualificar",
          "Diagnóstico agendado",
          "Diagnóstico feito",
          "Proposta enviada",
        ],
      }),
    ])
    const a = r.linhas.find((l) => l.segmento === "A · Aluno Luan")!
    expect(a).toMatchObject({
      total: 1,
      abordados: 1,
      responderam: 1,
      diagnosticosAgendados: 1,
      diagnosticosFeitos: 1,
      propostas: 1,
    })
  })

  it("segmento fora da lista ganha linha própria, não é somado no balde errado", () => {
    const r = montarRelatorio([neg({ segmento: null })])
    expect(r.linhas.map((l) => l.segmento)).toContain("Sem segmento")
    expect(r.linhas.find((l) => l.segmento === "A · Aluno Luan")!.total).toBe(0)
  })

  it("todos os segmentos aparecem, mesmo zerados — a linha ausente esconde o balde vazio", () => {
    const r = montarRelatorio([])
    expect(r.linhas).toHaveLength(5)
    expect(r.linhas.every((l) => l.total === 0)).toBe(true)
  })
})

describe("taxa sem denominador é null, NUNCA 0%", () => {
  it("sem ninguém abordado, a taxa de resposta não existe", () => {
    const r = montarRelatorio([neg()])
    const a = r.linhas.find((l) => l.segmento === "A · Aluno Luan")!
    expect(a.abordados).toBe(0)
    expect(a.taxaDeResposta).toBeNull()
  })

  it("abordado sem resposta dá 0% de verdade — aí o zero é medição", () => {
    const r = montarRelatorio([
      neg({ etapasVisitadas: ["A · Aluno Luan", "T1 · Abordado"] }),
    ])
    expect(r.linhas.find((l) => l.segmento === "A · Aluno Luan")!.taxaDeResposta).toBe(0)
  })

  it("% de vendendo é sobre quem RESPONDEU, e some sem resposta", () => {
    const r = montarRelatorio([
      neg({
        maturidade: "Vendendo",
        etapasVisitadas: ["A · Aluno Luan", "T1 · Abordado", "Respondeu · qualificar"],
      }),
      neg({
        id: "d2",
        maturidade: "Sem loja",
        etapasVisitadas: ["A · Aluno Luan", "T1 · Abordado", "Respondeu · qualificar"],
      }),
    ])
    const a = r.linhas.find((l) => l.segmento === "A · Aluno Luan")!
    expect(a.percentualVendendo).toBe(50)
    expect(montarRelatorio([neg()]).total.percentualVendendo).toBeNull()
  })

  it("maturidade compara sem acento e caixa", () => {
    const r = montarRelatorio([
      neg({ maturidade: "  VENDENDO " , etapasVisitadas: ["T1 · Abordado", "Respondeu · qualificar"] }),
    ])
    expect(r.total.vendendo).toBe(1)
  })
})

describe("ganhos, receita e perdas", () => {
  it("soma a receita dos ganhos", () => {
    const r = montarRelatorio([
      neg({ status: "won", value: 2500, etapasVisitadas: ["Ganho"] }),
      neg({ id: "d2", status: "won", value: 1500, etapasVisitadas: ["Ganho"] }),
    ])
    expect(r.total).toMatchObject({ ganhos: 2, receita: 4000 })
  })

  it("agrupa as perdas por motivo, da maior pra menor", () => {
    const r = montarRelatorio([
      neg({ status: "lost", lost_reason: "Preço" }),
      neg({ id: "d2", status: "lost", lost_reason: "Sem interesse" }),
      neg({ id: "d3", status: "lost", lost_reason: "Sem interesse" }),
    ])
    expect(r.perdidosPorMotivo).toEqual([
      { motivo: "Sem interesse", quantidade: 2 },
      { motivo: "Preço", quantidade: 1 },
    ])
  })

  it("perda sem motivo é NOMEADA em vez de sumir da contagem", () => {
    const r = montarRelatorio([neg({ status: "lost", lost_reason: "  " })])
    expect(r.perdidosPorMotivo).toEqual([{ motivo: "Sem motivo registrado", quantidade: 1 }])
  })
})

describe("evolução diária", () => {
  it("conta por dia e mede contra a meta", () => {
    const s = evolucaoDiaria([
      "2026-09-21T10:00:00Z",
      "2026-09-21T14:00:00Z",
      "2026-09-22T09:00:00Z",
    ])
    expect(s).toEqual([
      { dia: "2026-09-21", abordados: 2, faltaParaMeta: META_DIARIA - 2 },
      { dia: "2026-09-22", abordados: 1, faltaParaMeta: META_DIARIA - 1 },
    ])
  })

  it("dia sem abordagem aparece com ZERO — buraco se leria como 'não medimos'", () => {
    const s = evolucaoDiaria(["2026-09-21T10:00:00Z", "2026-09-23T10:00:00Z"])
    expect(s.map((d) => d.dia)).toEqual(["2026-09-21", "2026-09-22", "2026-09-23"])
    expect(s[1].abordados).toBe(0)
  })

  it("passar da meta dá falta negativa", () => {
    const s = evolucaoDiaria(
      Array.from({ length: 45 }, () => "2026-09-21T10:00:00Z"),
    )
    expect(s[0].faltaParaMeta).toBe(-5)
  })

  it("data ilegível e vazia são descartadas em vez de virar dia inventado", () => {
    expect(evolucaoDiaria([null, undefined, "ontem", ""])).toEqual([])
  })
})

describe("contagem regressiva", () => {
  it("conta dias inteiros até os marcos", () => {
    const m = contagemRegressiva(new Date("2026-10-20T23:00:00Z"))
    expect(m[0]).toMatchObject({ data: "2026-10-23", diasRestantes: 3 })
    expect(m[1]).toMatchObject({ data: "2026-11-27", diasRestantes: 38 })
  })

  it("marco passado fica negativo, não some", () => {
    expect(contagemRegressiva(new Date("2026-10-25T12:00:00Z"))[0].diasRestantes).toBe(-2)
  })

  it("o dia do marco é zero, não um", () => {
    expect(contagemRegressiva(new Date("2026-10-23T01:00:00Z"))[0].diasRestantes).toBe(0)
  })
})

describe("extrato do parceiro", () => {
  const total = montarRelatorio([
    neg({ status: "won", value: 10000, etapasVisitadas: ["Ganho"] }),
  ]).total

  it("calcula a comissão pelo percentual cadastrado", () => {
    expect(extratoDoParceiro(total, 15)).toMatchObject({
      ganhos: 1,
      receita: 10000,
      percentual: 15,
      comissao: 1500,
    })
  })

  it("sem percentual a comissão é null — 0 diria que não há comissão", () => {
    expect(extratoDoParceiro(total, null).comissao).toBeNull()
    expect(extratoDoParceiro(total, undefined).comissao).toBeNull()
  })

  it("percentual zero é uma decisão e vale zero", () => {
    expect(extratoDoParceiro(total, 0).comissao).toBe(0)
  })
})
