import { describe, expect, it } from "vitest"
import {
  dataPorExtenso,
  duracaoPorExtenso,
  fusoValido,
  horaLocal,
  janelaLocal,
  siglaDoFuso,
} from "./formato"

// 11/09/2026 18:00 UTC = 15:00 em São Paulo
const ISO = "2026-09-11T18:00:00.000Z"

describe("fusoValido", () => {
  it("aceita IANA conhecido", () => {
    expect(fusoValido("Europe/Warsaw")).toBe("Europe/Warsaw")
  })

  it("cai no padrão quando é nulo ou o runtime não reconhece", () => {
    // Fuso inválido derrubaria o Intl e o email inteiro não sairia.
    expect(fusoValido(null)).toBe("America/Sao_Paulo")
    expect(fusoValido("")).toBe("America/Sao_Paulo")
    expect(fusoValido("Marte/Olympus")).toBe("America/Sao_Paulo")
  })
})

describe("horaLocal", () => {
  it("converte para o fuso da reunião", () => {
    expect(horaLocal(ISO, "America/Sao_Paulo")).toBe("15:00")
    expect(horaLocal(ISO, "UTC")).toBe("18:00")
  })

  it("um fuso diferente dá uma hora diferente — é o ponto do campo", () => {
    // Loja europeia: 15:00 em SP não é 15:00 em Varsóvia, e o email tem de
    // dizer o horário certo para quem lê.
    expect(horaLocal(ISO, "Europe/Warsaw")).toBe("20:00")
  })
})

describe("dataPorExtenso", () => {
  it("escreve a data em português", () => {
    const texto = dataPorExtenso(ISO, "America/Sao_Paulo")
    expect(texto).toContain("11")
    expect(texto).toContain("setembro")
    expect(texto).toContain("2026")
  })

  it("respeita a virada do dia no fuso do leitor", () => {
    // 11/09 23:00 em SP já é 12/09 em Varsóvia.
    const tardeNoBrasil = "2026-09-12T02:00:00.000Z"
    expect(dataPorExtenso(tardeNoBrasil, "America/Sao_Paulo")).toContain("11")
    expect(dataPorExtenso(tardeNoBrasil, "Europe/Warsaw")).toContain("12")
  })
})

describe("siglaDoFuso", () => {
  it("devolve algo que identifique o fuso ao leitor", () => {
    expect(siglaDoFuso(ISO, "America/Sao_Paulo")).toBeTruthy()
  })
})

describe("janelaLocal", () => {
  it("mostra início e fim", () => {
    const texto = janelaLocal(ISO, 30, "America/Sao_Paulo")
    expect(texto).toContain("15:00")
    expect(texto).toContain("15:30")
  })

  it("atravessa a hora corretamente", () => {
    expect(janelaLocal(ISO, 90, "UTC")).toContain("19:30")
  })

  it("duração zero não quebra — a janela colapsa no mesmo horário", () => {
    expect(janelaLocal(ISO, 0, "UTC")).toContain("18:00")
  })
})

describe("duracaoPorExtenso", () => {
  it("fala como gente", () => {
    expect(duracaoPorExtenso(30)).toBe("30 minutos")
    expect(duracaoPorExtenso(60)).toBe("1 hora")
    expect(duracaoPorExtenso(120)).toBe("2 horas")
    expect(duracaoPorExtenso(90)).toBe("1h30")
  })

  it("trata ausência e valor negativo sem inventar número", () => {
    expect(duracaoPorExtenso(0)).toBe("sem duração definida")
    expect(duracaoPorExtenso(-10)).toBe("sem duração definida")
  })
})
