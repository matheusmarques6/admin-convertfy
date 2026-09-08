import { describe, expect, it } from "vitest"
import {
  alternarPais,
  alternarPreset,
  definirPrincipal,
  presetEstaAtivo,
  presetPorId,
  PRESETS_DE_MERCADO,
  resumoDePaises,
  sanitizarPaises,
} from "./mercados"
import { COUNTRY_VALUES, countryLabel } from "@/lib/constants/onboarding"
import type { CountryValue } from "@/lib/constants/onboarding"

const bigFive = presetPorId("big-five")!

describe("PRESETS_DE_MERCADO", () => {
  it("todo país de todo preset existe na lista de países", () => {
    // Preset com código que a lista não tem vira um chip que não marca
    // nada — e o operador acha que aplicou.
    const fora: string[] = []
    for (const p of PRESETS_DE_MERCADO) {
      for (const c of p.paises) if (!COUNTRY_VALUES.includes(c)) fora.push(`${p.id}:${c}`)
    }
    expect(fora).toEqual([])
  })

  it("Big Five é o jargão do dropshipping, e o rótulo declara os membros", () => {
    // "Big Five" não é o G5 nem os cinco maiores países — sem os nomes
    // escritos, cada um entende uma coisa.
    expect(bigFive.paises).toEqual(["US", "GB", "CA", "AU", "NZ"])
    expect(bigFive.descricao).toContain("Nova Zelândia")
  })

  it("não tem id repetido", () => {
    const ids = PRESETS_DE_MERCADO.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("sanitizarPaises", () => {
  it("normaliza a caixa, descarta desconhecido e não duplica", () => {
    expect(sanitizarPaises(["br", "BR", "ZZ", null, " us "])).toEqual(["BR", "US"])
  })

  it("preserva a ORDEM — o primeiro é o principal", () => {
    expect(sanitizarPaises(["US", "BR"])).toEqual(["US", "BR"])
    expect(sanitizarPaises(["BR", "US"])).toEqual(["BR", "US"])
  })
})

describe("alternarPreset", () => {
  it("aplica o conjunto inteiro de uma vez", () => {
    const r = alternarPreset([], bigFive)
    expect(r).toEqual(["US", "GB", "CA", "AU", "NZ"])
  })

  it("NÃO troca o principal ao aplicar", () => {
    // Aplicar Big Five numa loja brasileira não pode transformá-la numa
    // loja americana — o país principal alimenta fuso e relatório.
    const r = alternarPreset(["BR"], bigFive)
    expect(r[0]).toBe("BR")
    expect(r).toContain("US")
  })

  it("não duplica quando parte do preset já está marcada", () => {
    const r = alternarPreset(["US", "BR"], bigFive)
    expect(r.filter((c) => c === "US")).toHaveLength(1)
    expect(r).toEqual(["US", "BR", "GB", "CA", "AU", "NZ"])
  })

  it("clicar de novo remove só os do preset", () => {
    const comTudo = alternarPreset(["BR"], bigFive)
    expect(alternarPreset(comTudo, bigFive)).toEqual(["BR"])
  })

  it("remover o preset NUNCA esvazia a seleção", () => {
    // Loja sem país nenhum é pior que loja com país sobrando, e um clique
    // que zera tudo em silêncio é armadilha.
    const so = alternarPreset([], bigFive)
    expect(alternarPreset(so, bigFive)).toEqual(so)
  })
})

describe("presetEstaAtivo", () => {
  it("ativo quando todos os membros estão marcados, mesmo com extras", () => {
    // Big Five + Brasil continua sendo Big Five. Exigir exclusividade
    // apagaria o chip assim que alguém somasse um país.
    expect(presetEstaAtivo(bigFive, ["US", "GB", "CA", "AU", "NZ", "BR"])).toBe(true)
    expect(presetEstaAtivo(bigFive, ["US", "GB", "CA", "AU"])).toBe(false)
  })
})

describe("alternarPais", () => {
  it("marca e desmarca", () => {
    expect(alternarPais(["BR"], "US" as CountryValue)).toEqual(["BR", "US"])
    expect(alternarPais(["BR", "US"], "US" as CountryValue)).toEqual(["BR"])
  })

  it("desmarcar o último é ignorado", () => {
    expect(alternarPais(["BR"], "BR" as CountryValue)).toEqual(["BR"])
  })
})

describe("definirPrincipal", () => {
  it("move para a frente sem perder os demais", () => {
    expect(definirPrincipal(["BR", "US", "GB"], "US" as CountryValue)).toEqual(["US", "BR", "GB"])
  })

  it("país fora da seleção não vira principal em silêncio", () => {
    // Senão o `country` gravado seria um país que a loja não vende.
    expect(definirPrincipal(["BR"], "JP" as CountryValue)).toEqual(["BR"])
  })
})

describe("resumoDePaises", () => {
  it("lista curta sai por extenso", () => {
    expect(resumoDePaises(["BR"], countryLabel as (c: string) => string)).toBe("Brasil")
    expect(resumoDePaises(["BR", "US"], countryLabel as (c: string) => string)).toBe(
      "Brasil e Estados Unidos",
    )
  })

  it("lista longa encurta com a contagem do resto", () => {
    expect(
      resumoDePaises(["US", "GB", "CA", "AU", "NZ"], countryLabel as (c: string) => string),
    ).toBe("Estados Unidos, Reino Unido e mais 3")
  })

  it("vazio diz que está vazio em vez de devolver string em branco", () => {
    expect(resumoDePaises([], countryLabel as (c: string) => string)).toBe("Nenhum país definido")
  })
})
