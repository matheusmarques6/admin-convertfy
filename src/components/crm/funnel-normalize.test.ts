/**
 * Regressão do crash "Algo deu errado" em /admin/comercial/funil.
 *
 * O fetcher devolvia o corpo de erro da API como se fosse dado válido;
 * `data` ficava truthy sem o shape esperado e o primeiro acesso a
 * `data.ad_spend.entries` lançava TypeError, derrubando a página inteira
 * no ErrorBoundary. Estes testes travam as duas defesas: o fetcher
 * rejeita resposta não-2xx e o normalizador preenche payload parcial.
 */

import { describe, it, expect, vi, afterEach } from "vitest"
import { fetchFunnel as fetcher, normalizeFunnelData } from "./funnel-data"

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  )
}

describe("fetcher", () => {
  it("rejeita corpo de erro da API em vez de devolver payload invalido", async () => {
    stubFetch(500, { success: false, error: "column deals.cash_collected does not exist" })
    await expect(fetcher("/api/crm/funnel")).rejects.toThrow(
      /cash_collected does not exist/,
    )
  })

  it("extrai mensagem de erro em objeto aninhado", async () => {
    stubFetch(403, { error: { message: "Sem org membership" } })
    await expect(fetcher("/api/crm/funnel")).rejects.toThrow("Sem org membership")
  })

  it("usa mensagem generica com status quando o corpo nao tem erro legivel", async () => {
    stubFetch(502, null)
    await expect(fetcher("/api/crm/funnel")).rejects.toThrow(/502/)
  })

  it("devolve o payload quando a resposta e 2xx", async () => {
    stubFetch(200, { success: true, funnel: { leads: 3 } })
    await expect(fetcher("/api/crm/funnel")).resolves.toMatchObject({
      funnel: { leads: 3 },
    })
  })
})

describe("normalizeFunnelData", () => {
  it("preenche payload parcial sem lancar (o crash original)", () => {
    // Exatamente o shape que derrubava a pagina: sem ad_spend/funnel/rates
    const parcial = { success: true } as never
    const d = normalizeFunnelData(parcial)

    expect(d).toBeDefined()
    // Os acessos que lancavam TypeError agora sao seguros
    expect(d!.ad_spend.entries).toEqual([])
    expect(d!.ad_spend.by_account).toEqual([])
    expect(d!.ad_spend.total).toBe(0)
    expect(d!.funnel.leads).toBe(0)
    expect(d!.rates.leads_mql).toBeNull()
    expect(d!.mapped_steps).toEqual([])
    expect(d!.creatives).toEqual([])
    expect(d!.vendas).toEqual([])
    expect(d!.utm_options.sources).toEqual([])
  })

  it("preserva os dados reais quando o payload esta completo", () => {
    const d = normalizeFunnelData({
      funnel: { leads: 184, mql: 83, agendamento: 76, reuniao: 48, venda: 18 },
      ad_spend: { total: 19831, manual: 19831, synced: 0, by_account: [], entries: [] },
      mapped_steps: ["mql", "venda"],
    } as never)

    expect(d!.funnel.leads).toBe(184)
    expect(d!.funnel.venda).toBe(18)
    expect(d!.ad_spend.total).toBe(19831)
    expect(d!.mapped_steps).toEqual(["mql", "venda"])
  })

  it("completa etapas faltantes do funil sem apagar as presentes", () => {
    const d = normalizeFunnelData({ funnel: { leads: 10 } } as never)
    expect(d!.funnel.leads).toBe(10)
    expect(d!.funnel.venda).toBe(0)
  })

  it("devolve undefined para ausencia de dados", () => {
    expect(normalizeFunnelData(undefined)).toBeUndefined()
  })
})
