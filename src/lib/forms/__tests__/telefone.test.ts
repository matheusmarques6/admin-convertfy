import { describe, expect, it } from "vitest"
import {
  mascaraDeTelefone,
  paisDeTelefone,
  paisSugeridoPeloNavegador,
  partesDoTelefone,
  telefoneCanonico,
  PAISES_DE_TELEFONE,
} from "../telefone"

describe("mascaraDeTelefone", () => {
  it("formata o celular brasileiro com 9 dígitos", () => {
    expect(mascaraDeTelefone("BR", "11999998888")).toBe("(11) 99999-8888")
  })

  it("formata o fixo brasileiro de 10 dígitos", () => {
    expect(mascaraDeTelefone("BR", "1133334444")).toBe("(11) 3333-4444")
  })

  it("ignora o que já vem pontuado — a máscara é sobre os dígitos", () => {
    expect(mascaraDeTelefone("BR", "(11) 99999-8888")).toBe("(11) 99999-8888")
  })

  it("corta o excedente em vez de deixar o campo crescer sem fim", () => {
    expect(mascaraDeTelefone("BR", "119999988889999")).toBe("(11) 99999-8888")
  })

  it("formata o americano", () => {
    expect(mascaraDeTelefone("US", "5551234567")).toBe("(555) 123-4567")
  })

  it("país sem plano conhecido agrupa de 4 em 4 em vez de fingir máscara", () => {
    expect(mascaraDeTelefone("DE", "301234567")).toBe("3012 3456 7")
  })
})

describe("telefoneCanonico", () => {
  it("manda DDI + só dígitos — é o que a CAPI hasheia", () => {
    expect(telefoneCanonico("BR", "(11) 99999-8888")).toBe("+5511999998888")
  })

  it("campo vazio NÃO vira um DDI solto", () => {
    expect(telefoneCanonico("BR", "")).toBe("")
    expect(telefoneCanonico("BR", "   ")).toBe("")
    expect(telefoneCanonico("BR", "()-")).toBe("")
  })

  it("país desconhecido cai no primeiro da lista em vez de sair sem DDI", () => {
    expect(telefoneCanonico("XX", "11999998888")).toBe("+5511999998888")
  })
})

describe("partesDoTelefone", () => {
  it("desfaz o canônico", () => {
    expect(partesDoTelefone("+5511999998888")).toEqual({ country: "BR", numero: "(11) 99999-8888" })
  })

  it("casa o DDI mais longo primeiro — +55 não pode virar +5", () => {
    expect(partesDoTelefone("+551133334444").country).toBe("BR")
    expect(partesDoTelefone("+15551234567").country).toBe("US")
    expect(partesDoTelefone("+351912345678").country).toBe("PT")
  })

  it("número sem DDI assume BR e não duplica prefixo na volta", () => {
    const p = partesDoTelefone("11999998888")
    expect(p.country).toBe("BR")
    expect(telefoneCanonico(p.country, p.numero)).toBe("+5511999998888")
  })

  it("ida e volta é estável", () => {
    const canonico = telefoneCanonico("US", "5551234567")
    const p = partesDoTelefone(canonico)
    expect(telefoneCanonico(p.country, p.numero)).toBe(canonico)
  })

  it("vazio não inventa telefone", () => {
    expect(partesDoTelefone("")).toEqual({ country: "BR", numero: "" })
  })
})

describe("paisDeTelefone", () => {
  it("devolve o país da lista", () => {
    expect(paisDeTelefone("PT").dial).toBe("+351")
  })

  it("código fora da lista cai no padrão, nunca em undefined", () => {
    expect(paisDeTelefone("ZZ").code).toBe("BR")
  })

  it("todo DDI começa com + e todo código tem 2 letras", () => {
    for (const p of PAISES_DE_TELEFONE) {
      expect(p.dial.startsWith("+")).toBe(true)
      expect(p.code).toMatch(/^[A-Z]{2}$/)
    }
  })
})

describe("paisSugeridoPeloNavegador", () => {
  const original = globalThis.navigator
  const comIdioma = (language: string | undefined) => {
    Object.defineProperty(globalThis, "navigator", {
      value: language === undefined ? undefined : { language },
      configurable: true,
    })
  }
  const restaurar = () =>
    Object.defineProperty(globalThis, "navigator", { value: original, configurable: true })

  it("pt-BR → BR", () => {
    comIdioma("pt-BR")
    expect(paisSugeridoPeloNavegador()).toBe("BR")
    restaurar()
  })

  it("en-US → US", () => {
    comIdioma("en-US")
    expect(paisSugeridoPeloNavegador()).toBe("US")
    restaurar()
  })

  it("idioma sem região não chuta país — fica no padrão", () => {
    comIdioma("pt")
    expect(paisSugeridoPeloNavegador()).toBe("BR")
    restaurar()
  })

  it("região fora da lista cai no padrão", () => {
    comIdioma("ja-JP")
    expect(paisSugeridoPeloNavegador()).toBe("BR")
    restaurar()
  })

  it("sem navigator (servidor) devolve o padrão sem lançar", () => {
    comIdioma(undefined)
    expect(paisSugeridoPeloNavegador()).toBe("BR")
    restaurar()
  })
})
