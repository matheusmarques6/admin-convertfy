import { describe, expect, it } from "vitest"
import {
  fusoDaLoja,
  offsetForTimezone,
  omnisendDateRange,
  resolverFusoDaLoja,
} from "./timezone"

describe("offsetForTimezone", () => {
  it("resolve o horário de verão pela DATA — o que um mapa fixo não faz", () => {
    // É o bug que isto substitui: `offsetForCurrency` devolvia "+01:00"
    // para EUR o ano inteiro, então em julho a janela do relatório saía
    // uma hora deslocada e a receita caía no dia errado.
    expect(offsetForTimezone("Europe/Berlin", "2026-07-15")).toBe("+02:00")
    expect(offsetForTimezone("Europe/Berlin", "2026-01-15")).toBe("+01:00")
    expect(offsetForTimezone("America/New_York", "2026-07-15")).toBe("-04:00")
    expect(offsetForTimezone("America/New_York", "2026-01-15")).toBe("-05:00")
  })

  it("distingue fusos que compartilham a MESMA moeda", () => {
    // Berlim e Lisboa são as duas EUR e nunca estiveram no mesmo offset.
    const berlim = offsetForTimezone("Europe/Berlin", "2026-07-15")
    const lisboa = offsetForTimezone("Europe/Lisbon", "2026-07-15")
    expect(berlim).toBe("+02:00")
    expect(lisboa).toBe("+01:00")
    expect(berlim).not.toBe(lisboa)
  })

  it("hemisfério sul inverte, e o Brasil não tem mais horário de verão", () => {
    expect(offsetForTimezone("Australia/Sydney", "2026-01-15")).toBe("+11:00")
    expect(offsetForTimezone("Australia/Sydney", "2026-07-15")).toBe("+10:00")
    expect(offsetForTimezone("America/Sao_Paulo", "2026-01-15")).toBe("-03:00")
    expect(offsetForTimezone("America/Sao_Paulo", "2026-07-15")).toBe("-03:00")
  })

  it("UTC e fusos com meia hora", () => {
    expect(offsetForTimezone("UTC", "2026-07-15")).toBe("+00:00")
    expect(offsetForTimezone("Asia/Kolkata", "2026-07-15")).toBe("+05:30")
  })

  it("fuso ausente ou inválido cai no padrão em vez de derrubar o relatório", () => {
    // Roda dentro da montagem do relatório: um IANA digitado errado numa
    // loja não pode quebrar o relatório de todas.
    expect(offsetForTimezone(null, "2026-07-15")).toBe("-03:00")
    expect(offsetForTimezone("", "2026-07-15")).toBe("-03:00")
    expect(offsetForTimezone("Nao/Existe", "2026-07-15")).toBe("-03:00")
  })
})

describe("omnisendDateRange", () => {
  it("to é EXCLUSIVO (dia seguinte à meia-noite)", () => {
    const r = omnisendDateRange("2026-04-01", "2026-04-30", "-03:00")
    expect(r).toEqual({ from: "2026-04-01T00:00:00-03:00", to: "2026-05-01T00:00:00-03:00" })
  })

  it("aceita IANA e resolve o offset sozinho", () => {
    const r = omnisendDateRange("2026-07-01", "2026-07-31", "Europe/Berlin")
    expect(r.from).toBe("2026-07-01T00:00:00+02:00")
    expect(r.to).toBe("2026-08-01T00:00:00+02:00")
  })

  it("janela que ATRAVESSA a virada do horário de verão usa offset por ponta", () => {
    // Outubro/2026 na Europa: o DST cai no dia 25. Usar um offset só para
    // as duas pontas faria a janela ganhar ou perder uma hora exatamente
    // na fronteira do mês, que é onde o número é comparado com o painel.
    const r = omnisendDateRange("2026-10-01", "2026-10-31", "Europe/Berlin")
    expect(r.from).toBe("2026-10-01T00:00:00+02:00")
    expect(r.to).toBe("2026-11-01T00:00:00+01:00")
  })

  it("offset pronto continua funcionando (quem já chamava assim)", () => {
    const r = omnisendDateRange("2026-04-01", "2026-04-01", "+05:30")
    expect(r.from).toBe("2026-04-01T00:00:00+05:30")
    expect(r.to).toBe("2026-04-02T00:00:00+05:30")
  })

  it("vira o mês e o ano corretamente", () => {
    expect(omnisendDateRange("2026-12-31", "2026-12-31", "-03:00").to).toBe("2027-01-01T00:00:00-03:00")
  })
})

describe("fusoDaLoja", () => {
  it("diz quando está ASSUMINDO, para a tela poder avisar", () => {
    expect(fusoDaLoja("Europe/Berlin")).toEqual({
      tz: "Europe/Berlin",
      procedencia: "cadastro",
      assumido: false,
    })
    expect(fusoDaLoja(null)).toEqual({
      tz: "America/Sao_Paulo",
      procedencia: "padrao",
      assumido: true,
    })
    expect(fusoDaLoja("   ")).toEqual({
      tz: "America/Sao_Paulo",
      procedencia: "padrao",
      assumido: true,
    })
  })
})

describe("resolverFusoDaLoja", () => {
  const MAPA = { BR: "America/Sao_Paulo", US: "America/New_York", DE: "Europe/Berlin" }

  it("o cadastro vence, e não é assumido", () => {
    const r = resolverFusoDaLoja({ timezone: "Europe/Berlin", country: "US", mapaDePais: MAPA })
    expect(r).toEqual({ tz: "Europe/Berlin", procedencia: "cadastro", assumido: false })
  })

  it("sem cadastro, o país decide — e fica marcado como assumido", () => {
    // A Blue Wolf: timezone NULL, country 'US'. O relatório devolvia
    // America/Sao_Paulo por este mesmo input e o sync devolvia New York.
    const r = resolverFusoDaLoja({ timezone: null, country: "US", mapaDePais: MAPA })
    expect(r).toEqual({ tz: "America/New_York", procedencia: "pais", assumido: true })
  })

  it("sem cadastro e sem país conhecido, o padrão — declarado", () => {
    const r = resolverFusoDaLoja({ timezone: null, country: "ZZ", mapaDePais: MAPA })
    expect(r).toEqual({ tz: "America/Sao_Paulo", procedencia: "padrao", assumido: true })
  })

  it("fuso inválido no cadastro NÃO é usado", () => {
    // Gravar "Europe/Berlim" não quebra na hora; usar transforma todo
    // relatório da loja num offset assumido em silêncio.
    const r = resolverFusoDaLoja({ timezone: "Europe/Berlim", country: "DE", mapaDePais: MAPA })
    expect(r.tz).toBe("Europe/Berlin")
    expect(r.procedencia).toBe("pais")
  })

  it("país em caixa baixa e com espaço ainda casa", () => {
    expect(resolverFusoDaLoja({ country: " us ", mapaDePais: MAPA }).tz).toBe("America/New_York")
  })

  it("sem mapa, país nenhum resolve — cai no padrão em vez de lançar", () => {
    expect(resolverFusoDaLoja({ country: "US" }).procedencia).toBe("padrao")
  })

  it("fusoDaLoja é o mesmo resolvedor, sem país", () => {
    expect(fusoDaLoja("Europe/Berlin")).toEqual(resolverFusoDaLoja({ timezone: "Europe/Berlin" }))
    expect(fusoDaLoja(null).procedencia).toBe("padrao")
  })
})
