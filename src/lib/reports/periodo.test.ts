import { describe, expect, it } from "vitest"
import {
  avaliarPeriodo,
  campanhaNoPeriodo,
  campanhasNoPeriodo,
  diasDoPeriodo,
  granularidadeParaJanela,
} from "./periodo"

describe("campanhaNoPeriodo", () => {
  it("entra pelo dia do ENVIO, não por quando o pedido aconteceu", () => {
    const c = { send_time: "2026-09-09T14:30:00Z", campaign_status: "sent" }
    expect(campanhaNoPeriodo(c, "2026-09-09", "2026-09-09")).toBe(true)
    expect(campanhaNoPeriodo(c, "2026-09-10", "2026-09-30")).toBe(false)
  })

  it("recusa a campanha enviada antes da janela — era o caso real", () => {
    // Blessed Choice, 09/09/2026: 75 das 78 campanhas gravadas para a
    // janela de um dia tinham envio fora dele, a mais antiga de 15/04.
    const abril = { send_time: "2026-04-15T09:00:00Z", campaign_status: "sent" }
    expect(campanhaNoPeriodo(abril, "2026-09-09", "2026-09-09")).toBe(false)
  })

  it("só conta quem foi enviada de fato", () => {
    const base = { send_time: "2026-09-09T10:00:00Z" }
    expect(campanhaNoPeriodo({ ...base, campaign_status: "scheduled" }, "2026-09-09", "2026-09-09")).toBe(false)
    expect(campanhaNoPeriodo({ ...base, campaign_status: "paused" }, "2026-09-09", "2026-09-09")).toBe(false)
    // Sem status declarado a data decide: o cache antigo não gravava o campo.
    expect(campanhaNoPeriodo(base, "2026-09-09", "2026-09-09")).toBe(true)
  })

  it("sem data de envio fica FORA — assumir que é do período é o bug", () => {
    expect(campanhaNoPeriodo({ send_time: null, campaign_status: "sent" }, "2026-09-01", "2026-09-30")).toBe(false)
    expect(campanhaNoPeriodo({ sendTime: "sei-la", status: "sent" }, "2026-09-01", "2026-09-30")).toBe(false)
  })

  it("lê tanto o cache (snake) quanto a API (camel)", () => {
    expect(campanhaNoPeriodo({ sendTime: "2026-09-09T00:10:00Z", status: "sent" }, "2026-09-09", "2026-09-09")).toBe(true)
  })

  it("a janela é fechada nos dois lados", () => {
    const dia = (d: string) => ({ send_time: `${d}T12:00:00Z`, campaign_status: "sent" })
    expect(campanhaNoPeriodo(dia("2026-09-01"), "2026-09-01", "2026-09-30")).toBe(true)
    expect(campanhaNoPeriodo(dia("2026-09-30"), "2026-09-01", "2026-09-30")).toBe(true)
    expect(campanhaNoPeriodo(dia("2026-08-31"), "2026-09-01", "2026-09-30")).toBe(false)
    expect(campanhaNoPeriodo(dia("2026-10-01"), "2026-09-01", "2026-09-30")).toBe(false)
  })
})

describe("campanhasNoPeriodo", () => {
  it("filtra preservando a ordem", () => {
    const lista = [
      { id: "a", send_time: "2026-09-09T08:00:00Z", campaign_status: "sent" },
      { id: "b", send_time: "2026-04-15T08:00:00Z", campaign_status: "sent" },
      { id: "c", send_time: "2026-09-09T20:00:00Z", campaign_status: "sent" },
    ]
    expect(campanhasNoPeriodo(lista, "2026-09-09", "2026-09-09").map((c) => c.id)).toEqual(["a", "c"])
  })
})

describe("diasDoPeriodo", () => {
  it("é inclusivo — o mesmo dia é um dia", () => {
    expect(diasDoPeriodo("2026-09-09", "2026-09-09")).toBe(1)
    expect(diasDoPeriodo("2026-09-01", "2026-09-30")).toBe(30)
    expect(diasDoPeriodo("2026-01-01", "2026-12-31")).toBe(365)
  })
})

describe("granularidadeParaJanela", () => {
  it("dia até o teto de 60 da Omnisend, semana depois", () => {
    expect(granularidadeParaJanela("2026-09-09", "2026-09-09")).toBe("day")
    expect(granularidadeParaJanela("2026-07-01", "2026-07-31")).toBe("day")
    // 60 dias exatos ainda cabem em `day`; 61 não.
    expect(granularidadeParaJanela("2026-07-01", "2026-08-29")).toBe("day")
    expect(granularidadeParaJanela("2026-07-01", "2026-08-30")).toBe("week")
    // 90 dias era o caso que devolvia 400 e morria no catch.
    expect(granularidadeParaJanela("2026-06-11", "2026-09-09")).toBe("week")
  })

  it("acima de 52 semanas cai em mês", () => {
    expect(granularidadeParaJanela("2025-01-01", "2026-09-09")).toBe("month")
  })
})

describe("avaliarPeriodo", () => {
  const hoje = "2026-09-09"

  it("recusa período invertido antes de custar uma geração", () => {
    const r = avaliarPeriodo("2026-09-30", "2026-09-01", hoje)
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/depois do fim/)
  })

  it("recusa período inteiro no futuro", () => {
    const r = avaliarPeriodo("2026-10-01", "2026-10-31", hoje)
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/futuro/)
  })

  it("aceita HOJE, avisando que o dia ainda está em andamento", () => {
    const r = avaliarPeriodo(hoje, hoje, hoje)
    expect(r.ok).toBe(true)
    expect(r.dias).toBe(1)
    expect(r.avisos.join(" ")).toMatch(/dia corrente/)
    expect(r.avisos.join(" ")).toMatch(/um dia/)
  })

  it("mês fechado passa limpo", () => {
    const r = avaliarPeriodo("2026-08-01", "2026-08-31", hoje)
    expect(r).toMatchObject({ ok: true, dias: 31 })
    expect(r.avisos).toEqual([])
  })

  it("recusa janela longa demais e data ilegível", () => {
    expect(avaliarPeriodo("2024-01-01", "2026-09-09", hoje).ok).toBe(false)
    expect(avaliarPeriodo("ontem", "hoje", hoje).ok).toBe(false)
  })
})
