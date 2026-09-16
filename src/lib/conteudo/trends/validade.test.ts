import { describe, expect, it } from "vitest"
import {
  INTERVALO_MINIMO_HORAS,
  VALIDADE_DIAS,
  daRodadaMaisRecente,
  expirados,
  idadeCurta,
  idadeEmHoras,
  ordenarParaOPainel,
  precisaRodar,
  type AssuntoDatado,
} from "./validade"

const AGORA = new Date("2026-09-16T12:00:00Z").getTime()
const hAtras = (h: number) => new Date(AGORA - h * 3_600_000).toISOString()
const a = (id: string, score: number, horas: number): AssuntoDatado => ({ id, score, geradoEm: hAtras(horas) })

describe("validade do radar", () => {
  it("expira o que passou dos 14 dias e mantém o resto", () => {
    const ids = expirados([a("velho", 90, VALIDADE_DIAS * 24 + 1), a("no_limite", 50, VALIDADE_DIAS * 24 - 1), a("novo", 10, 2)], AGORA)
    expect(ids).toEqual(["velho"])
  })

  it("data ilegível NÃO expira — não medir não é motivo para apagar", () => {
    expect(expirados([{ id: "x", score: 50, geradoEm: "amanhã" }], AGORA)).toEqual([])
    expect(idadeEmHoras("amanhã", AGORA)).toBeNull()
  })

  it("a rodada mais recente é um GRUPO, não uma janela de horas", () => {
    // Três de hoje (segundos de diferença) e dois de ontem: a faixa separa
    // por rodada, e não por um horizonte escolhido a dedo.
    const hoje1 = { id: "h1", score: 70, geradoEm: new Date(AGORA - 1000).toISOString() }
    const hoje2 = { id: "h2", score: 60, geradoEm: new Date(AGORA - 3000).toISOString() }
    const hoje3 = { id: "h3", score: 50, geradoEm: new Date(AGORA - 60_000).toISOString() }
    const recentes = daRodadaMaisRecente([hoje1, hoje2, hoje3, a("ontem", 99, 24), a("anteontem", 95, 48)])
    expect(recentes).toEqual(new Set(["h1", "h2", "h3"]))
  })

  it("o 92 de três dias atrás NÃO fica acima do 88 de hoje", () => {
    // É o defeito que o cron criaria sozinho: rodada que só acrescenta faz o
    // painel virar arquivo ordenado por score.
    const ordem = ordenarParaOPainel([a("antigo", 92, 72), a("hoje_alto", 88, 0.1), a("hoje_baixo", 40, 0.1)]).map((x) => x.id)
    expect(ordem).toEqual(["hoje_alto", "hoje_baixo", "antigo"])
  })

  it("empate de score e data desempata por id — ordem estável entre renders", () => {
    const um = ordenarParaOPainel([a("b", 50, 1), a("a", 50, 1)]).map((x) => x.id)
    const dois = ordenarParaOPainel([a("a", 50, 1), a("b", 50, 1)]).map((x) => x.id)
    expect(um).toEqual(dois)
  })

  it("lista vazia não quebra nenhuma das regras", () => {
    expect(daRodadaMaisRecente([])).toEqual(new Set())
    expect(ordenarParaOPainel([])).toEqual([])
    expect(expirados([], AGORA)).toEqual([])
  })

  it("o cron não gasta duas chamadas de modelo no mesmo dia", () => {
    expect(precisaRodar(null, AGORA)).toBe(true)
    expect(precisaRodar(hAtras(INTERVALO_MINIMO_HORAS - 1), AGORA)).toBe(false)
    expect(precisaRodar(hAtras(INTERVALO_MINIMO_HORAS + 1), AGORA)).toBe(true)
  })

  it("não saber quando rodou é indistinguível de não ter rodado", () => {
    expect(precisaRodar("sei lá", AGORA)).toBe(true)
  })

  it("a idade sai legível, e o futuro não vira número negativo", () => {
    expect(idadeCurta(hAtras(0.01), AGORA)).toBe("agora")
    expect(idadeCurta(hAtras(3), AGORA)).toBe("há 3h")
    expect(idadeCurta(hAtras(24), AGORA)).toBe("há 1 dia")
    expect(idadeCurta(hAtras(72), AGORA)).toBe("há 3 dias")
    expect(idadeCurta(hAtras(-5), AGORA)).toBe("agora")
    expect(idadeCurta(null, AGORA)).toBeNull()
  })
})
