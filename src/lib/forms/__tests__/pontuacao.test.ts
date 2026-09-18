import { describe, expect, it } from "vitest"
import type { FormSchema } from "@/types/forms-conversational"
import { acessoAoFormulario, avaliarFaixas, faixaDaPontuacao, pontuar, textosDoSistema } from "../pontuacao"

const schema = {
  version: 1,
  display_mode: "conversational",
  locale: "pt-BR",
  blocks: [
    { ref: "fat", type: "radio", label: "Faturamento", pontos: { baixo: 0, medio: 5, alto: 10 } },
    { ref: "canais", type: "multi_select", label: "Canais", pontos: { email: 3, sms: 2, push: -1 } },
    { ref: "sn", type: "yes_no", label: "Já roda?", pontos: { sim: 4, nao: 0 } },
    { ref: "nome", type: "text", label: "Nome" },
  ],
  endings: [],
  settings: {},
} as unknown as FormSchema

describe("pontuar", () => {
  it("soma o que foi respondido; múltipla soma cada marcada; o máximo é o teto real", () => {
    const r = pontuar(schema, { fat: "alto", canais: ["email", "sms"], sn: "nao" })
    expect(r.total).toBe(15)
    expect(r.perguntasQuePontuam).toBe(3)
    expect(r.respondidas).toBe(3)
    // 10 + (3+2, o negativo não entra no teto) + 4
    expect(r.maximo).toBe(19)
  })
  it("resposta fora da tabela vale 0, não erro — 'Outro' digitado", () => {
    const r = pontuar(schema, { fat: "Minha resposta" })
    expect(r.total).toBe(0)
    expect(r.respondidas).toBe(0)
  })
  it("sem resposta não conta como respondida", () => {
    expect(pontuar(schema, {}).respondidas).toBe(0)
  })
})

describe("faixaDaPontuacao", () => {
  const faixas = [
    { de: 0, ate: 5, tag: "frio" },
    { de: 6, ate: 12, stage_id: "s2" },
    { de: 13, ate: 99, stage_id: "s3", tag: "quente" },
  ]
  it("acha a faixa que contém o total", () => {
    expect(faixaDaPontuacao(faixas, 0)?.tag).toBe("frio")
    expect(faixaDaPontuacao(faixas, 12)?.stage_id).toBe("s2")
    expect(faixaDaPontuacao(faixas, 50)?.tag).toBe("quente")
  })
  it("fora de toda faixa é null — cai na etapa padrão", () => {
    expect(faixaDaPontuacao(faixas, 100)).toBeNull()
    expect(faixaDaPontuacao(undefined, 3)).toBeNull()
  })
  it("sobreposição: a PRIMEIRA cadastrada vence", () => {
    expect(faixaDaPontuacao([{ de: 0, ate: 10, tag: "a" }, { de: 5, ate: 20, tag: "b" }], 7)?.tag).toBe("a")
  })
})

describe("avaliarFaixas", () => {
  it("acusa sobreposição, lacuna e faixa que não faz nada", () => {
    const avisos = avaliarFaixas([
      { de: 0, ate: 10, tag: "a" },
      { de: 5, ate: 20, stage_id: "x" },
      { de: 30, ate: 40 },
    ])
    expect(avisos.some((a) => a.includes("sobrepõem"))).toBe(true)
    expect(avisos.some((a) => a.includes("Entre 21 e 29"))).toBe(true)
    expect(avisos.some((a) => a.includes("30–40") && a.includes("não faz nada"))).toBe(true)
  })
  it("faixas contíguas e úteis não geram aviso", () => {
    expect(avaliarFaixas([{ de: 0, ate: 5, tag: "a" }, { de: 6, ate: 10, tag: "b" }])).toEqual([])
  })
})

describe("textosDoSistema", () => {
  it("preenche os padrões e ignora chave vazia", () => {
    const t = textosDoSistema({ textos: { obrigatorio: "Responda, por favor.", email_invalido: "  " } })
    expect(t.obrigatorio).toBe("Responda, por favor.")
    expect(t.email_invalido).toBe("Confira o email — parece faltar algo.")
    expect(t.rotulo_avancar).toBe("OK")
  })
  it("o `rotulo_avancar` antigo (solto) vence o novo — é o que está no ar", () => {
    expect(textosDoSistema({ rotulo_avancar: "Próxima", textos: { rotulo_avancar: "Seguir" } }).rotulo_avancar).toBe("Próxima")
  })
})

describe("acessoAoFormulario", () => {
  it("aberto por padrão", () => {
    expect(acessoAoFormulario({}, 10)).toEqual({ aberto: true })
  })
  it("fechado à mão, com a mensagem própria ou a padrão", () => {
    expect(acessoAoFormulario({ fechado: true, mensagem_fechado: "Voltamos em março." }, 0)).toEqual({
      aberto: false,
      motivo: "fechado",
      mensagem: "Voltamos em março.",
    })
    expect(acessoAoFormulario({ fechado: true }, 0)).toMatchObject({ motivo: "fechado", mensagem: expect.stringContaining("não está recebendo") })
  })
  it("limite de envios fecha quando o contador chega lá; contador desconhecido NÃO fecha", () => {
    expect(acessoAoFormulario({ limite_envios: 100 }, 100)).toMatchObject({ aberto: false, motivo: "limite" })
    expect(acessoAoFormulario({ limite_envios: 100 }, 99)).toEqual({ aberto: true })
    expect(acessoAoFormulario({ limite_envios: 100 }, null)).toEqual({ aberto: true })
  })
})
