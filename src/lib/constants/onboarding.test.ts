import { describe, expect, it } from "vitest"
import {
  COUNTRIES,
  COUNTRIES_BY_REGION,
  COUNTRY_TIMEZONE,
  COUNTRY_VALUES,
  countryLabel,
} from "./onboarding"

describe("COUNTRIES", () => {
  it("não tem código repetido", () => {
    const vistos = new Set(COUNTRIES.map((c) => c.value))
    expect(vistos.size).toBe(COUNTRIES.length)
  })

  it("cobre as praças em que a casa tem loja", () => {
    // Cada um destes é uma loja real que estava marcada como 'BR' porque
    // o país dela não existia na lista: Lena Warszawa (.pl), Bryn Grill
    // (-dk), Van Aldijk (.nl), Velurena/Treuquell (.de).
    for (const code of ["PL", "DK", "NL", "DE", "SE", "NO", "CH", "AT"]) {
      expect(COUNTRY_VALUES).toContain(code)
    }
  })

  it("'Outro' é o último item", () => {
    // É a saída, não uma opção entre as outras — no meio da lista ela
    // vira a escolha preguiçosa.
    expect(COUNTRIES[COUNTRIES.length - 1].value).toBe("OTHER")
  })
})

describe("COUNTRIES_BY_REGION", () => {
  it("não perde nem duplica país ao agrupar", () => {
    const agrupados = COUNTRIES_BY_REGION.flatMap((g) => g.paises.map((p) => p.value))
    expect(agrupados.sort()).toEqual([...COUNTRY_VALUES].sort())
  })

  it("não devolve grupo vazio", () => {
    // Grupo vazio vira um cabeçalho solto no select.
    for (const g of COUNTRIES_BY_REGION) expect(g.paises.length).toBeGreaterThan(0)
  })
})

describe("COUNTRY_TIMEZONE", () => {
  it("todo país oferecido na tela tem fuso", () => {
    // É o guard que justifica o mapa morar neste arquivo: país que a
    // tela oferece e o mapa não conhece cai no fuso de São Paulo em
    // silêncio, e a janela do relatório sai deslocada.
    const semFuso = COUNTRIES.filter((c) => c.value !== "OTHER" && !COUNTRY_TIMEZONE[c.value])
    expect(semFuso.map((c) => c.label)).toEqual([])
  })

  it("todo fuso é um IANA que o runtime reconhece", () => {
    // Um IANA digitado errado não lança na hora — só faz a data cair no
    // fallback muito depois.
    const invalidos = Object.entries(COUNTRY_TIMEZONE).filter(([, tz]) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz })
        return false
      } catch {
        return true
      }
    })
    expect(invalidos).toEqual([])
  })

  it("'Outro' NÃO tem fuso — não existe fuso de 'outro país'", () => {
    expect(COUNTRY_TIMEZONE["OTHER"]).toBeUndefined()
  })
})

describe("countryLabel", () => {
  it("traduz o código", () => {
    expect(countryLabel("PL")).toBe("Polônia")
    expect(countryLabel("BR")).toBe("Brasil")
  })

  it("código fora da lista volta como está, em vez de virar nada", () => {
    // Loja com país gravado antes de a lista mudar continua legível.
    expect(countryLabel("ZZ")).toBe("ZZ")
    expect(countryLabel(null)).toBeNull()
  })
})
