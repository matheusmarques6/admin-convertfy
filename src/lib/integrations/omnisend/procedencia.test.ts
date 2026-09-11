import { describe, expect, it } from "vitest"
import {
  formatarEspera,
  mensagemDaDegradacao,
  procedenciaDoAtribuido,
  type Degradacao,
} from "./procedencia"

describe("procedenciaDoAtribuido", () => {
  it("com a Reports API respondendo, o número bate com o painel", () => {
    const p = procedenciaDoAtribuido({ reportsRespondeu: true })
    expect(p.agrupamento).toBe("send_date")
    expect(p.comparavelComOPainel).toBe(true)
  })

  it("sem a Reports API, o número NÃO é apresentado como comparável", () => {
    // Era exatamente este o caso silencioso: o sync caía no Statistics,
    // logava "may be inflated" e gravava como se fosse o do painel.
    const p = procedenciaDoAtribuido({ reportsRespondeu: false })
    expect(p.agrupamento).toBe("event_date")
    expect(p.comparavelComOPainel).toBe(false)
    expect(p.ressalva).toContain("data do pedido")
  })

  it("declara a mistura de agrupamentos no percentual", () => {
    // Atribuído por send-date sobre total por event-date: é o quociente
    // que o slide publica como "% da loja que veio da Convertfy".
    const p = procedenciaDoAtribuido({ reportsRespondeu: true, agrupamentoDoTotal: "event_date" })
    expect(p.percentualMisturaAgrupamentos).toBe(true)
    expect(p.ressalva).toContain("não cobrem exatamente as mesmas vendas")
  })

  it("sem mistura, não inventa ressalva", () => {
    const p = procedenciaDoAtribuido({ reportsRespondeu: true, agrupamentoDoTotal: "send_date" })
    expect(p.percentualMisturaAgrupamentos).toBe(false)
    expect(p.ressalva).toBeNull()
  })
})

describe("mensagemDaDegradacao", () => {
  it("sem degradação, não há mensagem", () => {
    expect(mensagemDaDegradacao([])).toBeNull()
  })

  it("limite da plataforma manda ESPERAR, nunca clicar de novo", () => {
    // A ação é oposta à da falha comum: insistir queima a cota diária.
    const d: Degradacao[] = [
      { etapa: "reportsTotals", causa: "limite_da_plataforma", liberaEmMs: 120_000 },
    ]
    const msg = mensagemDaDegradacao(d)!
    expect(msg).toContain("Limite de consultas da Omnisend")
    expect(msg).toContain("2 min")
    expect(msg).not.toContain("Clique em sincronizar de novo")
  })

  it("o limite vence a falha comum quando os dois acontecem", () => {
    const d: Degradacao[] = [
      { etapa: "activityUniques", causa: "falha_na_chamada" },
      { etapa: "reportsTotals", causa: "limite_da_plataforma", liberaEmMs: 60_000 },
    ]
    expect(mensagemDaDegradacao(d)).toContain("Limite de consultas")
  })

  it("usa a maior espera informada", () => {
    const d: Degradacao[] = [
      { etapa: "a", causa: "limite_da_plataforma", liberaEmMs: 60_000 },
      { etapa: "b", causa: "limite_da_plataforma", liberaEmMs: 3_600_000 },
    ]
    expect(mensagemDaDegradacao(d)).toContain("1 h")
  })

  it("sem espera informada, não inventa prazo", () => {
    const d: Degradacao[] = [{ etapa: "a", causa: "limite_da_plataforma" }]
    const msg = mensagemDaDegradacao(d)!
    expect(msg).toContain("Limite de consultas")
    expect(msg).not.toMatch(/Libera em/)
  })

  it("falha comum nomeia as etapas, sem repetir", () => {
    const d: Degradacao[] = [
      { etapa: "activityBreakdown", causa: "falha_na_chamada" },
      { etapa: "activityBreakdown", causa: "falha_na_chamada" },
    ]
    const msg = mensagemDaDegradacao(d)!
    expect(msg).toBe(
      "A plataforma não respondeu em activityBreakdown — a receita do sync anterior foi preservada.",
    )
  })
})

describe("formatarEspera", () => {
  it("formata as três faixas", () => {
    expect(formatarEspera(45_000)).toBe("45 s")
    expect(formatarEspera(120_000)).toBe("2 min")
    expect(formatarEspera(4_800_000)).toBe("1 h 20 min")
    expect(formatarEspera(3_600_000)).toBe("1 h")
  })

  it("não devolve tempo negativo", () => {
    expect(formatarEspera(-5000)).toBe("0 s")
  })
})
