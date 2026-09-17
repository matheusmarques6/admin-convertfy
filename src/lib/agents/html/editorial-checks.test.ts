import { describe, expect, it } from "vitest"

import {
  acharPadroesEditoriais,
  assuntoComecaPeloCodigo,
  computeEditorialChecks,
  preheaderRepeteAssunto,
} from "./editorial-checks"

describe("acharPadroesEditoriais", () => {
  it("pega as quatro famílias e devolve o trecho que reprovou", () => {
    expect(acharPadroesEditoriais("Não é uma cueca, é conforto o dia todo.")[0]).toMatchObject({ regra: "binario" })
    expect(acharPadroesEditoriais("E no fim das contas o que importa é caber.")[0]).toMatchObject({ regra: "cacoete" })
    expect(acharPadroesEditoriais("Neste e-mail vamos apresentar a marca.")[0]).toMatchObject({ regra: "abertura" })
    expect(acharPadroesEditoriais("Estudos mostram que 8 em 10 homens sofrem com isso.")[0]).toMatchObject({
      regra: "dado_sem_origem",
    })
  })

  // A carteira manda e-mail em 14 idiomas: reprovar por regex de português
  // uma peça em polonês seria alarme falso em escala.
  it("a mesma regra vale em inglês, e idioma não coberto não gera achado", () => {
    expect(acharPadroesEditoriais("It's not underwear, it's comfort.")[0]).toMatchObject({ regra: "binario" })
    expect(acharPadroesEditoriais("Studies show most men give up.").map((a) => a.regra)).toContain("dado_sem_origem")
    expect(acharPadroesEditoriais("To nie jest bielizna, to wygoda przez cały dzień.")).toEqual([])
    expect(acharPadroesEditoriais("Nasze bokserki z bambusa są miękkie.")).toEqual([])
  })

  it("texto limpo não produz achado", () => {
    expect(acharPadroesEditoriais("O cós assenta acima do abdômen e não crava.")).toEqual([])
    expect(acharPadroesEditoriais("")).toEqual([])
  })

  it("cada achado vem com o conserto, não só com a acusação", () => {
    expect(acharPadroesEditoriais("Estudos mostram que funciona.")[0].conserto).toMatch(/fonte|número/)
  })
})

describe("assunto e preheader", () => {
  // O assunto REAL entregue em 17/09.
  it("o assunto não começa pelo código do cupom", () => {
    expect(assuntoComecaPeloCodigo("WELCOME10: Cut for Your Body", "WELCOME10")).toBe(true)
    expect(assuntoComecaPeloCodigo("Cut for your body — with WELCOME10", "WELCOME10")).toBe(false)
    expect(assuntoComecaPeloCodigo("Bem-vindo à Hero Boxers", "WELCOME10")).toBe(false)
    // Sem código confirmado não há o que comparar.
    expect(assuntoComecaPeloCodigo("WELCOME10: algo", null)).toBe(false)
  })

  it("o preheader completa o assunto em vez de repeti-lo", () => {
    expect(preheaderRepeteAssunto("Cueca cortada para o seu corpo", "Cueca cortada para o seu corpo, sem apertar")).toBe(true)
    expect(preheaderRepeteAssunto("Cueca cortada para o seu corpo", "Bambu, cós que não crava e troca sem custo")).toBe(false)
    // Assunto curto demais não dá base para medir repetição.
    expect(preheaderRepeteAssunto("Oi", "Oi")).toBe(false)
  })
})

describe("computeEditorialChecks", () => {
  it("uma issue por REGRA, não uma por ocorrência", () => {
    const issues = computeEditorialChecks([
      "Não é uma cueca, é conforto.",
      "Não é um tecido, é bambu.",
      "Estudos mostram que funciona.",
    ])
    expect(issues).toHaveLength(2)
    expect(issues.every((i) => i.type === "padrao_editorial")).toBe(true)
    expect(issues.every((i) => i.severity === "medium")).toBe(true)
  })

  it("a regra vai nomeada na mensagem — é por ela que se conta cada uma", () => {
    const [i] = computeEditorialChecks(["Não é uma cueca, é conforto."])
    expect(i.message).toMatch(/^\[binario\]/)
  })

  it("o caso real de 17/09 acende o assunto e o preheader", () => {
    const issues = computeEditorialChecks([], {
      assunto: "WELCOME10: Cut for Your Body",
      preheader: "WELCOME10: Cut for Your Body, and more",
      incentivoCodigo: "WELCOME10",
    })
    expect(issues.map((i) => i.type)).toEqual(["assunto_comeca_pelo_codigo", "preheader_repete_o_assunto"])
  })

  it("sem assunto e sem texto, nada é acusado", () => {
    expect(computeEditorialChecks([])).toEqual([])
  })
})
