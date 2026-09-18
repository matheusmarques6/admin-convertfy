import { describe, expect, it } from "vitest"
import { desfechoNoCrm, normalizarTag } from "./desfecho"
import type { FormSchema } from "@/types/forms-conversational"

const schema: FormSchema = {
  version: 1,
  display_mode: "conversational",
  locale: "pt-BR",
  blocks: [
    { ref: "mercado", type: "radio", label: "Vende pra onde?", options: [
      { label: "Brasil", value: "br" },
      { label: "Europa", value: "eu" },
    ] },
    { ref: "gateway", type: "multi_select", label: "Já aconteceu?", options: [
      { label: "Seguraram meu dinheiro", value: "reserva", tag: "Risco de gateway" },
      { label: "Conta desligada", value: "conta", tag: "risco-de-gateway" },
      { label: "Nunca aconteceu", value: "nunca" },
    ] },
    { ref: "muda", type: "radio", label: "O que muda pra você?", destaque: true, options: [
      { label: "Caixa previsível", value: "caixa" },
    ] },
  ],
  endings: [
    { ref: "ok", title: "Aprovado", tags: ["Qualificado"] },
    { ref: "fora", title: "Fora", disqualified: true, tags: ["fora do corte"], cria_negocio: false },
  ],
}

describe("normalizarTag", () => {
  it("é a mesma tag escrita de três jeitos", () => {
    expect(normalizarTag("Risco de Gateway")).toBe("risco-de-gateway")
    expect(normalizarTag("  risco  de gateway ")).toBe("risco-de-gateway")
    expect(normalizarTag("risco-de-gateway")).toBe("risco-de-gateway")
  })
})

describe("desfechoNoCrm", () => {
  const caminho = new Set(["mercado", "gateway", "muda"])

  it("junta a tag do final com a das respostas, sem repetir", () => {
    const d = desfechoNoCrm(
      schema,
      "ok",
      { mercado: "eu", gateway: ["reserva", "conta"], muda: "caixa" },
      caminho,
    )
    expect(d.tags).toEqual(["qualificado", "risco-de-gateway"])
    expect(d.criaNegocio).toBe(true)
    expect(d.desqualificado).toBe(false)
  })

  it("resposta FORA do caminho não marca o lead", () => {
    // Respondeu o gateway, voltou e trocou o mercado para Brasil: a
    // resposta antiga continua em `answers` e a pergunta não é mais
    // feita. Marcar "risco de gateway" mandaria o time abrir uma
    // conversa sobre um problema que a pessoa não disse ter.
    const d = desfechoNoCrm(
      schema,
      "ok",
      { mercado: "br", gateway: ["reserva"], muda: "caixa" },
      new Set(["mercado", "muda"]),
    )
    expect(d.tags).toEqual(["qualificado"])
  })

  it("o final desqualificante não cria negócio", () => {
    const d = desfechoNoCrm(schema, "fora", { mercado: "br" }, new Set(["mercado"]))
    expect(d.criaNegocio).toBe(false)
    expect(d.desqualificado).toBe(true)
    expect(d.tags).toEqual(["fora-do-corte"])
  })

  it("o padrão é CRIAR — o que está no ar não pode mudar de comportamento", () => {
    expect(desfechoNoCrm(schema, "ok", {}, null).criaNegocio).toBe(true)
    expect(desfechoNoCrm(schema, null, {}, null).criaNegocio).toBe(true)
    // Final que o schema não conhece não decide nada.
    expect(desfechoNoCrm(schema, "inventado", {}, null).criaNegocio).toBe(true)
    expect(desfechoNoCrm(null, "fora", {}, null).criaNegocio).toBe(true)
  })

  it("a resposta em destaque é a da pergunta marcada, com o rótulo", () => {
    const d = desfechoNoCrm(schema, "ok", { muda: "caixa" }, caminho)
    expect(d.destaque).toEqual({ pergunta: "O que muda pra você?", resposta: "Caixa previsível" })
  })

  it("sem pergunta marcada, não há destaque", () => {
    const semDestaque: FormSchema = {
      ...schema,
      blocks: schema.blocks.map((b) => ({ ...b, destaque: undefined })),
    }
    expect(desfechoNoCrm(semDestaque, "ok", { muda: "caixa" }, caminho).destaque).toBeNull()
  })

  it("pergunta em destaque sem resposta não inventa frase", () => {
    expect(desfechoNoCrm(schema, "ok", { mercado: "br" }, caminho).destaque).toBeNull()
  })
})
