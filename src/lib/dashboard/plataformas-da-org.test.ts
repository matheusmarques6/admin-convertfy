import { describe, expect, it } from "vitest"
import { plataformasPresentes } from "./plataformas-da-org"

describe("plataformasPresentes", () => {
  it("org só de Omnisend não faz o dashboard perguntar pelo Klaviyo", () => {
    // O caso medido: 54 lojas Omnisend, nenhuma Klaviyo, e
    // klaviyo_campaign_metrics com zero linhas — três rotas consultando
    // essa tabela em todo carregamento.
    const p = plataformasPresentes([
      { omnisend_api_key: "k1" },
      { omnisend_api_key: "k2" },
    ])
    expect(p).toEqual({ klaviyo: false, omnisend: true })
  })

  it("carteira mista consulta as duas", () => {
    expect(
      plataformasPresentes([{ omnisend_api_key: "k" }, { klaviyo_private_key: "pk" }]),
    ).toEqual({ klaviyo: true, omnisend: true })
  })

  it("a chave legada do Klaviyo também conta", () => {
    expect(plataformasPresentes([{ klaviyo_api_key: "legada" }])).toEqual({
      klaviyo: true,
      omnisend: false,
    })
  })

  it("sem as colunas no select, consulta as DUAS em vez de zerar a tela", () => {
    // Select degradado por migration pendente devolve linhas sem as colunas
    // de credencial. Concluir "nenhuma plataforma" faria o dashboard mostrar
    // zero achando que mediu.
    expect(plataformasPresentes([{}, {}])).toEqual({ klaviyo: true, omnisend: true })
    expect(plataformasPresentes([])).toEqual({ klaviyo: true, omnisend: true })
    expect(plataformasPresentes(null)).toEqual({ klaviyo: true, omnisend: true })
  })

  it("valor vazio não conta como credencial", () => {
    expect(plataformasPresentes([{ klaviyo_api_key: "", omnisend_api_key: "k" }])).toEqual({
      klaviyo: false,
      omnisend: true,
    })
  })
})
