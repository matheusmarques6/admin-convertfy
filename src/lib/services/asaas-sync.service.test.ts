import { describe, expect, it } from "vitest"
import { varrerPaginado, vencimentoDesde } from "./asaas-sync.service"

function listagem(total: number) {
  const chamadas: Array<[number, number]> = []
  const listar = async (offset: number, limit: number) => {
    chamadas.push([offset, limit])
    const data = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => offset + i)
    return { data, totalCount: total }
  }
  return { listar, chamadas }
}

describe("varrerPaginado", () => {
  it("lê todas as páginas até o total — a rota manual parava na primeira", async () => {
    const { listar, chamadas } = listagem(250)
    const r = await varrerPaginado(listar, { tamanhoPagina: 100 })
    expect(r.itens).toHaveLength(250)
    expect(r.paginas).toBe(3)
    expect(r.truncado).toBe(false)
    expect(chamadas).toEqual([
      [0, 100],
      [100, 100],
      [200, 100],
    ])
  })

  it("lista vazia: uma chamada, nada lido, não truncado", async () => {
    const { listar, chamadas } = listagem(0)
    const r = await varrerPaginado(listar, { tamanhoPagina: 100 })
    expect(r.itens).toEqual([])
    expect(chamadas).toHaveLength(1)
    expect(r.truncado).toBe(false)
  })

  it("orçamento estourado devolve o que já leu e DIZ que não terminou", async () => {
    const { listar } = listagem(300)
    let t = 0
    const agora = () => (t += 60_000) // cada consulta ao relógio avança 1 min
    const r = await varrerPaginado(listar, { tamanhoPagina: 100, orcamentoMs: 90_000, agora })
    expect(r.truncado).toBe(true)
    expect(r.itens.length).toBeGreaterThan(0)
    expect(r.itens.length).toBeLessThan(300)
  })

  it("página que volta vazia antes do total encerra (o Asaas nunca fica em loop)", async () => {
    const listar = async (offset: number) => ({ data: offset === 0 ? [1, 2] : [], totalCount: 999 })
    const r = await varrerPaginado(listar, { tamanhoPagina: 2 })
    expect(r.itens).toEqual([1, 2])
    expect(r.paginas).toBe(2)
    expect(r.truncado).toBe(false)
  })
})

describe("vencimentoDesde", () => {
  it("primeiro dia do mês, N meses atrás, sem depender de fuso", () => {
    expect(vencimentoDesde(24, new Date("2026-09-09T03:00:00Z"))).toBe("2024-09-01")
    expect(vencimentoDesde(1, new Date("2026-01-15T00:00:00Z"))).toBe("2025-12-01")
  })
})
