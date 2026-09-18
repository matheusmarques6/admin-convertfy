import { describe, expect, it } from "vitest"
import {
  montarEspinha,
  podarSelecao,
  refDaPergunta,
  rotuloDoTipo,
  selecaoDeReserva,
  selecaoValida,
  telaDaPrevia,
  type CampoDaEspinha,
  type Selecao,
} from "../estrutura-do-editor"
import type { FormSchema } from "@/types/forms-conversational"

const CAMPOS: CampoDaEspinha[] = [
  { ref: "f1", label: "Nome", field_type: "text", required: true },
  { ref: "f2", label: "WhatsApp", field_type: "phone", required: true },
  { ref: "f3", label: "Endereço da loja", field_type: "url", required: true },
  { ref: "f4", label: "Faturamento", field_type: "select", required: true },
]

const SCHEMA: FormSchema = {
  version: 1,
  display_mode: "conversational",
  locale: "pt-BR",
  blocks: [
    { ref: "f1", type: "text", label: "Nome", titulo_da_tela: "Como falamos com você?" },
    { ref: "f2", type: "phone", label: "WhatsApp", mesma_tela: true },
    { ref: "f3", type: "url", label: "Endereço da loja" },
    {
      ref: "f4",
      type: "select",
      label: "Faturamento",
      logic: [{ logic: "or", goto: "ending:fora", conditions: [{ ref: "f4", operator: "equals", value: "x" }] }],
    },
  ],
  endings: [
    { ref: "ok", title: "Pronto", destino: { tipo: "whatsapp", numero: "+5511999998888" } },
    { ref: "fora", title: "Ainda não", disqualified: true },
  ],
  settings: { welcome: { title: "Bem-vindo" } },
}

describe("montarEspinha · conversacional", () => {
  const e = montarEspinha(CAMPOS, SCHEMA, "conversational")

  it("agrupa pelas telas do schema, não uma tela por pergunta", () => {
    expect(e.telas).toHaveLength(3)
    expect(e.telas[0].perguntas.map((p) => p.ref)).toEqual(["f1", "f2"])
    expect(e.telas[0].titulo).toBe("Como falamos com você?")
    expect(e.telas.map((t) => t.numero)).toEqual([1, 2, 3])
  })

  it("só a primeira da tela é cabeça — é ela que carrega título e destino", () => {
    expect(e.telas[0].perguntas.map((p) => p.cabecaDaTela)).toEqual([true, false])
  })

  it("soma os desvios da tela a partir das perguntas dela", () => {
    expect(e.telas[2].desvios).toBe(1)
    expect(e.telas[0].desvios).toBe(0)
  })

  it("abre com a tela de abertura e fecha com os finais", () => {
    expect(e.abre).toMatchObject({ tipo: "abertura", preenchido: true })
    expect(e.fecha).toBeNull()
    expect(e.finais.map((f) => f.ref)).toEqual(["ok", "fora"])
    expect(e.finais[0]).toMatchObject({ padrao: true, temDestino: true })
    expect(e.finais[1]).toMatchObject({ desqualifica: true, temDestino: false })
  })
})

describe("montarEspinha · página única", () => {
  const e = montarEspinha(CAMPOS, { ...SCHEMA, display_mode: "classic" }, "classic")

  it("não inventa telas: tudo aparece de uma vez", () => {
    // Numerar seis "telas" prometeria um passo a passo que o visitante
    // desse formato nunca vê.
    expect(e.telas).toHaveLength(1)
    expect(e.telas[0].perguntas).toHaveLength(4)
  })

  it("abre com cabeçalho e fecha com o botão de envio — não com finais", () => {
    expect(e.abre).toMatchObject({ tipo: "cabecalho" })
    expect(e.fecha).toMatchObject({ tipo: "envio" })
    expect(e.finais).toEqual([])
  })

  it("não conta desvio: não há para onde desviar", () => {
    expect(e.telas[0].desvios).toBe(0)
    expect(e.telas[0].perguntas.every((p) => p.desvios === 0)).toBe(true)
  })
})

describe("montarEspinha · bordas", () => {
  it("pergunta oculta fica fora da espinha, venha a marca do campo ou do bloco", () => {
    const campos = [...CAMPOS, { ref: "f5", label: "utm", field_type: "text", hidden: true }]
    const schema = {
      ...SCHEMA,
      blocks: [...SCHEMA.blocks, { ref: "f6", type: "text" as const, label: "x", hidden: true }],
    }
    const e = montarEspinha([...campos, { ref: "f6", label: "x", field_type: "text" }], schema, "conversational")
    const refs = e.telas.flatMap((t) => t.perguntas.map((p) => p.ref))
    expect(refs).not.toContain("f5")
    expect(refs).not.toContain("f6")
  })

  it("formulário vazio não quebra", () => {
    const e = montarEspinha([], { ...SCHEMA, blocks: [], endings: [] }, "conversational")
    expect(e.telas).toEqual([])
    expect(selecaoDeReserva(e)).toEqual({ tipo: "abertura" })
  })

  it("`mesma_tela` na PRIMEIRA pergunta não a deixa sem tela", () => {
    // O flag gravado sobrevive a reordenar; sem esta guarda a primeira
    // pergunta cairia num grupo que não existe.
    const schema = { ...SCHEMA, blocks: [{ ref: "f1", type: "text" as const, label: "Nome", mesma_tela: true }] }
    const e = montarEspinha([CAMPOS[0]], schema, "conversational")
    expect(e.telas).toHaveLength(1)
    expect(e.telas[0].ref).toBe("f1")
  })
})

describe("seleção", () => {
  const conv = montarEspinha(CAMPOS, SCHEMA, "conversational")
  const uni = montarEspinha(CAMPOS, { ...SCHEMA, display_mode: "classic" }, "classic")

  it("o que o formato não desenha é seleção inválida", () => {
    expect(selecaoValida({ tipo: "abertura" }, conv, "conversational")).toBe(true)
    expect(selecaoValida({ tipo: "abertura" }, uni, "classic")).toBe(false)
    expect(selecaoValida({ tipo: "envio" }, uni, "classic")).toBe(true)
    expect(selecaoValida({ tipo: "envio" }, conv, "conversational")).toBe(false)
    expect(selecaoValida({ tipo: "final", ref: "ok" }, conv, "conversational")).toBe(true)
    expect(selecaoValida({ tipo: "final", ref: "ok" }, uni, "classic")).toBe(false)
  })

  it("pergunta apagada volta para a primeira, nunca para o vazio", () => {
    const sel: Selecao = { tipo: "pergunta", ref: "sumiu" }
    expect(podarSelecao(sel, conv, "conversational")).toEqual({ tipo: "pergunta", ref: "f1" })
  })

  it("seleção válida atravessa intacta", () => {
    const sel: Selecao = { tipo: "pergunta", ref: "f3" }
    expect(podarSelecao(sel, conv, "conversational")).toBe(sel)
  })

  it("trocar de formato poda o que o novo não tem", () => {
    expect(podarSelecao({ tipo: "final", ref: "ok" }, uni, "classic")).toEqual({
      tipo: "pergunta",
      ref: "f1",
    })
  })
})

describe("telaDaPrevia", () => {
  const e = montarEspinha(CAMPOS, SCHEMA, "conversational")

  it("pergunta agrupada endereça a CABEÇA da tela", () => {
    // A prévia é o renderizador de produção e navega por tela: pousar no
    // meio de um grupo mostraria meia tela.
    expect(telaDaPrevia({ tipo: "pergunta", ref: "f2" }, e)).toBe("f1")
    expect(telaDaPrevia({ tipo: "pergunta", ref: "f3" }, e)).toBe("f3")
  })

  it("abertura e finais não têm tela de pergunta", () => {
    expect(telaDaPrevia({ tipo: "abertura" }, e)).toBeNull()
    expect(telaDaPrevia({ tipo: "final", ref: "ok" }, e)).toBeNull()
    expect(telaDaPrevia(null, e)).toBeNull()
  })

  it("refDaPergunta devolve null fora de pergunta e tela", () => {
    expect(refDaPergunta({ tipo: "pergunta", ref: "f2" }, e)).toBe("f2")
    expect(refDaPergunta({ tipo: "final", ref: "ok" }, e)).toBeNull()
  })
})

describe("rotuloDoTipo", () => {
  it("traduz o nome cru — `multi_select` não é legível na lista", () => {
    expect(rotuloDoTipo("multi_select")).toBe("Várias")
    expect(rotuloDoTipo("phone")).toBe("Telefone")
  })

  it("tipo desconhecido devolve o próprio nome em vez de sumir", () => {
    expect(rotuloDoTipo("assinatura")).toBe("assinatura")
  })
})
