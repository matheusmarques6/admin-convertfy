import { describe, expect, it } from "vitest"
import { contarPorFunil, filtrarIdeias, fonteLabel, ideiaCasaBusca, palavrasDaBusca, type Ideia } from "./banco"

const base: Ideia = {
  id: "a", titulo: "", funil: "topo", formato: "Reels", pilar: null, tags: [], fonte: "time",
  fonteDetalhe: null, score: 50, porQue: null, molde: null, status: "banco", votos: 0, votei: false,
  reelId: null, documentoId: null, criadoEm: "2026-09-01T10:00:00Z",
}
const ideia = (o: Partial<Ideia>): Ideia => ({ ...base, ...o })

const lista: Ideia[] = [
  ideia({ id: "1", titulo: "Mito: cupom fideliza", tags: ["#segmentação", "#LTV"], score: 91, votos: 4 }),
  ideia({ id: "2", titulo: "Seu carrinho abandonado tem algo a dizer", tags: ["#carrinho", "#viral"], score: 88, votos: 6 }),
  ideia({ id: "3", titulo: "Por que a Sephora não dá desconto", tags: ["#Sephora"], score: 84, votos: 5, funil: "meio", formato: "Carrossel" }),
  ideia({ id: "4", titulo: "Ideia crua do time", tags: [], score: null, votos: 9, funil: null, formato: null }),
]

describe("banco de ideias", () => {
  it("cada palavra do termo casa no título OU numa tag", () => {
    expect(ideiaCasaBusca(lista[1], "carrinho viral")).toBe(true)
    expect(ideiaCasaBusca(lista[1], "carrinho cupom")).toBe(false)
    expect(palavrasDaBusca("  #LTV, segmentação! ")).toEqual(["#ltv", "segmentacao"])
  })

  it("busca ignora acento e caixa; termo vazio não filtra nada", () => {
    expect(filtrarIdeias(lista, { busca: "SEPHORA" }).map((i) => i.id)).toEqual(["3"])
    expect(filtrarIdeias(lista, { busca: "segmentacao" }).map((i) => i.id)).toEqual(["1"])
    expect(filtrarIdeias(lista, { busca: "   " })).toHaveLength(4)
  })

  it("ideia SEM score vai para o fim, nunca some da lista", () => {
    const r = filtrarIdeias(lista, { ordem: "score" })
    expect(r.map((i) => i.id)).toEqual(["1", "2", "3", "4"])
    expect(r).toHaveLength(4)
  })

  it("por votos, a não avaliada com mais votos lidera — são julgamentos diferentes", () => {
    expect(filtrarIdeias(lista, { ordem: "votos" }).map((i) => i.id)).toEqual(["4", "2", "3", "1"])
  })

  it("filtro de funil e de formato somam", () => {
    expect(filtrarIdeias(lista, { funil: "meio" }).map((i) => i.id)).toEqual(["3"])
    expect(filtrarIdeias(lista, { formato: "Reels" }).map((i) => i.id)).toEqual(["1", "2"])
    expect(filtrarIdeias(lista, { funil: "meio", formato: "Reels" })).toHaveLength(0)
  })

  it("empate de score desempata por data e id — ordem estável entre renders", () => {
    const a = ideia({ id: "z", score: 70, criadoEm: "2026-09-02T10:00:00Z" })
    const b = ideia({ id: "y", score: 70, criadoEm: "2026-09-03T10:00:00Z" })
    expect(filtrarIdeias([a, b]).map((i) => i.id)).toEqual(["y", "z"])
    expect(filtrarIdeias([b, a]).map((i) => i.id)).toEqual(["y", "z"])
  })

  it("contagem por funil separa a que ninguém classificou", () => {
    expect(contarPorFunil(lista)).toEqual({ topo: 2, meio: 1, fundo: 0, semFunil: 1 })
  })

  it("rótulo da fonte junta origem e detalhe", () => {
    expect(fonteLabel({ fonte: "convertia", fonteDetalhe: "trend" })).toBe("ConvertIA · trend")
    expect(fonteLabel({ fonte: "time", fonteDetalhe: null })).toBe("Time")
    expect(fonteLabel({ fonte: "dashboard", fonteDetalhe: "  " })).toBe("Dashboard")
  })
})
