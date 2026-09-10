import { describe, expect, it } from "vitest"
import {
  CONCORRENCIA_PADRAO,
  FRESCOR_MS,
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

describe("planoDeLote — frescor", () => {
  const agora = Date.parse("2026-09-09T12:00:00Z")
  const min = (n: number) => new Date(agora - n * 60_000).toISOString()

  it("quem sincronizou agora há pouco NÃO é buscado de novo", () => {
    // A plataforma limita por conta; re-tentar não traz número novo e
    // queima a cota — era o que fazia o contador de erro subir a cada
    // clique, com a segunda rodada atropelando a primeira.
    const p = planoDeLote(
      [
        { id: "fresca", temDado: true, sincronizadaEm: min(2) },
        { id: "velha", temDado: true, sincronizadaEm: min(90) },
        { id: "nova", temDado: false },
      ],
      10,
      5,
      agora,
    )
    expect(p.lote.map((l) => l.id)).toEqual(["nova", "velha"])
    expect(p.jaFrescas).toBe(1)
  })

  it("loja com ERRO entra mesmo fresca — pode ter sido vítima do limite", () => {
    const p = planoDeLote(
      [{ id: "a", temDado: true, falhou: true, sincronizadaEm: min(1) }],
      10,
      5,
      agora,
    )
    expect(p.lote.map((l) => l.id)).toEqual(["a"])
    expect(p.jaFrescas).toBe(0)
  })

  it("sem carimbo de sincronização, entra (não dá para afirmar frescor)", () => {
    const p = planoDeLote([{ id: "a", temDado: true }], 10, 5, agora)
    expect(p.lote).toHaveLength(1)
  })

  it("dado que a TELA já considera fresco não é re-buscado", () => {
    // A tela chama de desatualizado o que passou de 1 h (ADMIN_STALENESS_MS
    // em /api/dashboard/total-revenue). Com o frescor de 10 min de antes,
    // uma loja de 30 min voltava para a fila e gastava a cota sem mudar o
    // veredicto do banner — e as lojas de fato velhas, no fim da fila,
    // nunca eram alcançadas dentro do orçamento da função.
    expect(FRESCOR_MS).toBeLessThan(60 * 60_000)
    expect(FRESCOR_MS).toBeGreaterThanOrEqual(30 * 60_000)
    const p = planoDeLote(
      [
        { id: "meia-hora", temDado: true, sincronizadaEm: min(30) },
        { id: "duas-horas", temDado: true, sincronizadaEm: min(120) },
      ],
      10,
      5,
      agora,
    )
    expect(p.lote.map((l) => l.id)).toEqual(["duas-horas"])
    expect(p.jaFrescas).toBe(1)
  })

  it("dado que veio PELA METADE sobe na fila como falha", () => {
    // `partial` é a loja cuja plataforma não respondeu às estatísticas: a
    // receita ficou preservada do sync anterior. Contando como dado bom,
    // ela caía no peso 2 e a passada terminava antes de alcançá-la — as 5
    // `partial` de 10/09 seguiam carimbadas às 14:40 enquanto as `ok` já
    // tinham sido refeitas às 16:03. A rota traduz `partial` em `falhou`.
    const p = planoDeLote(
      [
        { id: "ok-velha", temDado: true, sincronizadaEm: min(120) },
        { id: "partial", temDado: true, falhou: true, sincronizadaEm: min(120) },
      ],
      10,
      5,
      agora,
    )
    expect(p.lote.map((l) => l.id)).toEqual(["partial", "ok-velha"])
  })
})

describe("CONCORRENCIA_PADRAO", () => {
  it("cabe a carteira inteira no orçamento de uma passada", () => {
    // Medido em 10/09 com 5 em voo: 25 lojas em ~4 min (≈48 s por onda) e a
    // função morria no teto de 300 s com metade da carteira por fazer. Como
    // a idade do dado é a da loja MAIS VELHA, o banner "Desatualizado" ficava
    // matematicamente inatingível: sempre sobrava alguém com o carimbo de
    // horas atrás. Uma passada tem de cobrir as 54 lojas.
    const LOJAS = 54
    const SEGUNDOS_POR_ONDA = 48
    const MARGEM = 1.25 // lojas mais lentas que a média
    const ORCAMENTO_S = 195 // LOOP_DEADLINE_MS da rota
    const ondas = Math.ceil(LOJAS / CONCORRENCIA_PADRAO)
    expect(ondas * SEGUNDOS_POR_ONDA * MARGEM).toBeLessThanOrEqual(ORCAMENTO_S)
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
