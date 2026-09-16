import { describe, expect, it } from "vitest"

import {
  avisoDeCapturaParcial,
  cabeMaisUmCluster,
  ciclosInterrompidos,
  orcamentoDaCaptura,
  ordemDaCaptura,
  type CicloEmAndamento,
} from "./ciclo-saude"

describe("orcamentoDaCaptura", () => {
  // Tendência é enriquecimento; sugestão é o produto. A reserva é o que
  // garante que a geração aconteça — sem ela, a captura come os 300 s e
  // o ciclo morre antes de gerar qualquer sugestão (o retrato de 16/09).
  it("desconta a reserva da geração", () => {
    expect(orcamentoDaCaptura(300_000, 120_000)).toBe(180_000)
  })

  it("desconta também o que já passou antes da captura começar", () => {
    expect(orcamentoDaCaptura(300_000, 120_000, 30_000)).toBe(150_000)
  })

  it("nunca devolve orçamento negativo", () => {
    expect(orcamentoDaCaptura(300_000, 120_000, 250_000)).toBe(0)
  })
})

describe("cabeMaisUmCluster", () => {
  // A conta é sobre TERMINAR, não sobre começar: um cluster que começa
  // aos 170 s e leva 81 s estoura a função, e quem morre não fecha o
  // ciclo nem solta o lock.
  it("recusa o cluster que não terminaria dentro do orçamento", () => {
    expect(cabeMaisUmCluster(170_000, 180_000, 81_000)).toBe(false)
  })

  it("aceita o que cabe exatamente", () => {
    expect(cabeMaisUmCluster(99_000, 180_000, 81_000)).toBe(true)
  })

  it("com o relógio zerado, o primeiro sempre cabe se o orçamento comporta", () => {
    expect(cabeMaisUmCluster(0, 180_000, 81_000)).toBe(true)
  })
})

describe("ordemDaCaptura", () => {
  const c = (country: string) => ({ country, niches: [] })

  // Sem rotação, o orçamento cortaria sempre o mesmo fim da fila e os
  // últimos países nunca teriam tendência — a lição do backfill de avatar.
  it("quem foi capturado há mais tempo vai primeiro", () => {
    const ordem = ordemDaCaptura(
      [c("BR"), c("US"), c("DE")],
      new Map([
        ["BR", "2026-09-15T00:00:00Z"],
        ["US", "2026-09-01T00:00:00Z"],
        ["DE", "2026-09-10T00:00:00Z"],
      ]),
    )
    expect(ordem.map((x) => x.country)).toEqual(["US", "DE", "BR"])
  })

  it("país nunca capturado vem antes de todos", () => {
    const ordem = ordemDaCaptura(
      [c("BR"), c("PL")],
      new Map([["BR", "2026-09-01T00:00:00Z"]]),
    )
    expect(ordem.map((x) => x.country)).toEqual(["PL", "BR"])
  })

  it("empate desempata pelo país, para a ordem ser estável", () => {
    const mesma = "2026-09-10T00:00:00Z"
    const ordem = ordemDaCaptura(
      [c("US"), c("BR"), c("DE")],
      new Map([
        ["US", mesma],
        ["BR", mesma],
        ["DE", mesma],
      ]),
    )
    expect(ordem.map((x) => x.country)).toEqual(["BR", "DE", "US"])
  })

  it("data ilegível conta como nunca capturado, não como recentíssimo", () => {
    const ordem = ordemDaCaptura(
      [c("BR"), c("US")],
      new Map([
        ["BR", "2026-09-01T00:00:00Z"],
        ["US", "não é data"],
      ]),
    )
    expect(ordem[0]?.country).toBe("US")
  })

  it("casa o país sem depender da caixa", () => {
    const ordem = ordemDaCaptura(
      [{ country: "br", niches: [] }, { country: "us", niches: [] }],
      new Map([
        ["BR", "2026-09-15T00:00:00Z"],
        ["US", "2026-09-01T00:00:00Z"],
      ]),
    )
    expect(ordem[0]?.country).toBe("us")
  })

  it("não muta a lista recebida", () => {
    const entrada = [c("US"), c("BR")]
    ordemDaCaptura(entrada, new Map())
    expect(entrada.map((x) => x.country)).toEqual(["US", "BR"])
  })
})

describe("avisoDeCapturaParcial", () => {
  it("tudo capturado não gera aviso", () => {
    expect(avisoDeCapturaParcial({ total: 7, feitos: 7, adiados: [] })).toBeNull()
  })

  it("diz quantos ficaram e que eles vêm primeiro", () => {
    const aviso = avisoDeCapturaParcial({ total: 7, feitos: 4, adiados: ["PL", "DK", "IT"] })
    expect(aviso).toContain("4 de 7")
    expect(aviso).toContain("PL, DK, IT")
    expect(aviso).toMatch(/começa por eles/)
  })
})

describe("ciclosInterrompidos", () => {
  const AGORA = new Date("2026-09-16T01:00:00Z").getTime()
  const ciclo = (p: Partial<CicloEmAndamento>): CicloEmAndamento => ({
    id: "c",
    number: 1,
    status: "generating",
    createdAt: new Date(AGORA - 60_000).toISOString(),
    ...p,
  })

  // O caso medido: 15 ciclos em `generating`, o mais novo de 14/09, e a
  // tela mostrando "gerando…" de uma execução de dois dias atrás.
  it("fecha o que está gerando há mais que o teto", () => {
    const r = ciclosInterrompidos(
      [ciclo({ id: "velho", createdAt: "2026-09-14T01:02:26Z" })],
      AGORA,
    )
    expect(r.map((c) => c.id)).toEqual(["velho"])
  })

  it("não toca no ciclo que pode estar vivo", () => {
    expect(ciclosInterrompidos([ciclo({ id: "novo" })], AGORA)).toEqual([])
  })

  it("só olha o que está gerando — ready, partial e failed já terminaram", () => {
    const antigo = "2026-09-01T00:00:00Z"
    const r = ciclosInterrompidos(
      [
        ciclo({ id: "r", status: "ready", createdAt: antigo }),
        ciclo({ id: "p", status: "partial", createdAt: antigo }),
        ciclo({ id: "f", status: "failed", createdAt: antigo }),
      ],
      AGORA,
    )
    expect(r).toEqual([])
  })

  // Afirmar que morreu sem ter como medir a idade é inventar desfecho, e
  // o engano aqui apaga o "gerando" de uma execução viva.
  it("sem carimbo de criação, não fecha", () => {
    expect(ciclosInterrompidos([ciclo({ createdAt: null })], AGORA)).toEqual([])
    expect(ciclosInterrompidos([ciclo({ createdAt: "ontem" })], AGORA)).toEqual([])
  })
})
