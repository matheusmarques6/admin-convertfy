import { describe, expect, it, vi } from "vitest"
import { lerPaginado, PAGINA_POSTGREST } from "./paginar"

/** Uma tabela falsa de `n` linhas, servida com o teto real do PostgREST. */
function tabela(n: number, tetoDoServidor = PAGINA_POSTGREST) {
  const todas = Array.from({ length: n }, (_, i) => ({ i }))
  return vi.fn(async (de: number, ate: number) => ({
    data: todas.slice(de, Math.min(ate + 1, de + tetoDoServidor)),
    error: null,
  }))
}

describe("lerPaginado", () => {
  it("lê além das 1.000 linhas que o PostgREST entrega por vez", async () => {
    // O caso medido: 63 lojas × 90 dias de store_daily_metrics.
    const consulta = tabela(5670)
    const r = await lerPaginado(consulta)
    expect(r.linhas).toHaveLength(5670)
    expect(r.truncado).toBe(false)
    expect(consulta).toHaveBeenCalledTimes(6)
  })

  it("uma página cheia exata não para cedo nem pede uma página a mais à toa", async () => {
    const consulta = tabela(2000)
    const r = await lerPaginado(consulta)
    expect(r.linhas).toHaveLength(2000)
    // 2 páginas cheias + 1 vazia para saber que acabou.
    expect(consulta).toHaveBeenCalledTimes(3)
  })

  it("menos de uma página: uma requisição só", async () => {
    const consulta = tabela(12)
    const r = await lerPaginado(consulta)
    expect(r.linhas).toHaveLength(12)
    expect(consulta).toHaveBeenCalledTimes(1)
  })

  it("o teto de segurança é DECLARADO, não silencioso", async () => {
    // Consulta mal filtrada não pode varrer a base — mas quem chama precisa
    // saber que parou, senão mostra um total incompleto como se fosse tudo.
    const r = await lerPaginado(tabela(10_000), { teto: 2000 })
    expect(r.linhas).toHaveLength(2000)
    expect(r.truncado).toBe(true)
  })

  it("erro no meio devolve o que veio, marcado — não derruba o card", async () => {
    let chamada = 0
    const consulta = vi.fn(async (de: number, ate: number) => {
      chamada++
      if (chamada > 1) return { data: null, error: { message: "timeout" } }
      return { data: Array.from({ length: ate - de + 1 }, (_, i) => ({ i })), error: null }
    })
    const r = await lerPaginado(consulta)
    expect(r.linhas).toHaveLength(PAGINA_POSTGREST)
    expect(r.truncado).toBe(true)
  })

  it("tamanho de página acima do teto do servidor não engana a régua", async () => {
    // Pedir 5.000 por página faria a primeira resposta (1.000) parecer
    // "incompleta" e a leitura terminaria com um quinto do dado.
    const consulta = tabela(3000)
    const r = await lerPaginado(consulta, { tamanho: 5000 })
    expect(r.linhas).toHaveLength(3000)
  })
})
