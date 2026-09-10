import { describe, expect, it } from "vitest"
import {
  comLimite,
  hojeNoFuso,
  janelaDoPeriodo,
  planoDeLote,
} from "./refresh-lote"

describe("hojeNoFuso", () => {
  it("é o dia no FUSO, não em UTC — 21h em Brasília ainda é hoje", () => {
    // 2026-09-10T00:30:00Z = 09/09 às 21:30 em São Paulo.
    const noite = new Date("2026-09-10T00:30:00Z")
    expect(hojeNoFuso("America/Sao_Paulo", noite)).toBe("2026-09-09")
    // Era daqui que vinha a recusa: em UTC já é o dia seguinte.
    expect(noite.toISOString().slice(0, 10)).toBe("2026-09-10")
  })

  it("fuso inválido cai no padrão em vez de derrubar o refresh", () => {
    const t = new Date("2026-09-09T15:00:00Z")
    expect(hojeNoFuso("Europe/Berlim", t)).toBe(hojeNoFuso("America/Sao_Paulo", t))
  })
})

describe("janelaDoPeriodo", () => {
  const hoje = "2026-09-09"

  it("período personalizado devolve as datas escolhidas", () => {
    expect(janelaDoPeriodo("custom:2026-09-09:2026-09-09", hoje)).toEqual({
      inicio: "2026-09-09",
      fim: "2026-09-09",
      dias: 1,
      emAndamento: true,
    })
    expect(janelaDoPeriodo("custom:2026-08-01:2026-08-31", hoje)).toEqual({
      inicio: "2026-08-01",
      fim: "2026-08-31",
      dias: 31,
      emAndamento: false,
    })
  })

  it("período RETROATIVO tem janela como qualquer outro — não é recusa", () => {
    // A rota devolvia "Omnisend não suporta range retroativo" e pulava a
    // loja. A janela existe e o sync sabe recebê-la.
    const j = janelaDoPeriodo("custom:2026-04-01:2026-04-30", hoje)
    expect(j.inicio).toBe("2026-04-01")
    expect(j.fim).toBe("2026-04-30")
    expect(j.emAndamento).toBe(false)
  })

  it("rótulo fixo é 'os últimos N dias terminando hoje'", () => {
    expect(janelaDoPeriodo("30d", hoje)).toMatchObject({ inicio: "2026-08-11", fim: hoje, dias: 30 })
    expect(janelaDoPeriodo("7d", hoje)).toMatchObject({ inicio: "2026-09-03", fim: hoje, dias: 7 })
    expect(janelaDoPeriodo("1d", hoje)).toMatchObject({ inicio: hoje, fim: hoje, dias: 1 })
  })

  it("rótulo desconhecido cai em 30 dias em vez de recusar", () => {
    expect(janelaDoPeriodo("1A", hoje).dias).toBe(30)
  })
})

describe("planoDeLote", () => {
  const lojas = [
    { id: "a", temDado: true },
    { id: "b", temDado: false },
    { id: "c", temDado: true, falhou: true },
    { id: "d", temDado: false },
    { id: "e", temDado: true },
  ]

  it("quem não tem dado vai primeiro; depois quem falhou", () => {
    const { lote } = planoDeLote(lojas, 5)
    expect(lote.map((l) => l.id)).toEqual(["b", "d", "c", "a", "e"])
  })

  it("a ordem dentro do grupo é estável entre passadas", () => {
    expect(planoDeLote(lojas, 5).lote.map((l) => l.id)).toEqual(
      planoDeLote(lojas, 5).lote.map((l) => l.id),
    )
  })

  it("o que não coube é CONTADO, não descartado em silêncio", () => {
    const p = planoDeLote(lojas, 2)
    expect(p.lote.map((l) => l.id)).toEqual(["b", "d"])
    expect(p.restantes).toBe(3)
  })

  it("concorrência nunca passa do tamanho do lote", () => {
    expect(planoDeLote(lojas, 1).concorrencia).toBe(1)
    expect(planoDeLote(lojas, 5, 5).concorrencia).toBe(5)
  })
})

describe("comLimite", () => {
  it("respeita o teto de simultâneos e preserva a ordem do resultado", async () => {
    let emVoo = 0
    let pico = 0
    const itens = [30, 5, 20, 1, 10, 2]
    const out = await comLimite(itens, 2, async (ms, i) => {
      emVoo++
      pico = Math.max(pico, emVoo)
      await new Promise((r) => setTimeout(r, ms))
      emVoo--
      return `${i}:${ms}`
    })
    expect(pico).toBeLessThanOrEqual(2)
    expect(out).toEqual(["0:30", "1:5", "2:20", "3:1", "4:10", "5:2"])
  })

  it("uma tarefa lenta não segura as rápidas (worker puxa o próximo)", async () => {
    const ordemDeTermino: number[] = []
    await comLimite([50, 1, 1, 1], 2, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms))
      ordemDeTermino.push(i)
    })
    // A lenta (0) termina por último, e as três rápidas passaram por ela.
    expect(ordemDeTermino[ordemDeTermino.length - 1]).toBe(0)
  })

  it("lista vazia não trava", async () => {
    expect(await comLimite([], 5, async () => 1)).toEqual([])
  })
})
