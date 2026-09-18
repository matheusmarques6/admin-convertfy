import { describe, expect, it } from "vitest"
import type { FormSchema } from "@/types/forms-conversational"
import { caminhoDaAresta, idDoFinal, montarCanvas, noDaSelecao, NO, rotuloDaCondicao } from "../fluxo-canvas"
import { telasDoFluxo } from "../mapa-do-fluxo"

const schema: FormSchema = {
  version: 1,
  display_mode: "conversational",
  locale: "pt-BR",
  blocks: [
    { ref: "nome", type: "text", label: "Nome", required: true },
    { ref: "email", type: "email", label: "E-mail", required: true, mesma_tela: true },
    {
      ref: "fat",
      type: "radio",
      label: "Faturamento",
      required: true,
      options: [
        { label: "Até R$ 50 mil", value: "ate50" },
        { label: "Mais", value: "mais" },
      ],
      logic: [
        { conditions: [{ ref: "fat", operator: "equals", value: "ate50" }], logic: "and", goto: "ending:baixo" },
        { conditions: [{ ref: "fat", operator: "equals", value: "x" }], logic: "and", goto: "apagada" },
      ],
    },
    { ref: "sn", type: "yes_no", label: "Roda e-mail?", required: true, proximo: "ending:" },
  ],
  endings: [
    { ref: "ok", title: "Obrigado" },
    { ref: "baixo", title: "Ainda não", disqualified: true },
  ],
  settings: { welcome: { title: "Diagnóstico", description: null, button_label: "Começar" } },
} as FormSchema

describe("montarCanvas", () => {
  const c = montarCanvas(schema, { temAbertura: true })

  it("uma coluna por tela, finais na linha de baixo, abertura na frente", () => {
    const ids = c.nos.map((n) => n.id)
    expect(ids).toEqual(["abertura", "nome", "fat", "sn", idDoFinal("ok"), idDoFinal("baixo")])
    expect(c.nos[1].x).toBe(NO.x0 + (NO.largura + NO.gapX))
    expect(c.nos[4].y).toBeGreaterThan(c.nos[1].y)
    expect(c.nos[4].x).toBe(NO.x0)
  })

  it("a tela agrupada é UM nó, com o título da tela", () => {
    expect(c.nos.find((n) => n.id === "email")).toBeUndefined()
    expect(c.contagem.telas).toBe(3)
  })

  it("a aresta de ordem aponta para o destino efetivo — inclusive o final declarado", () => {
    const ordem = c.arestas.filter((a) => a.tipo === "ordem")
    expect(ordem).toContainEqual({ de: "abertura", para: "nome", tipo: "ordem" })
    expect(ordem).toContainEqual({ de: "nome", para: "fat", tipo: "ordem" })
    // `proximo: "ending:"` = terminar no final padrão (o primeiro).
    expect(ordem).toContainEqual({ de: "sn", para: idDoFinal("ok"), tipo: "ordem" })
  })

  it("desvio com destino vira aresta com rótulo; sem destino vai para `perdidas`", () => {
    const desvios = c.arestas.filter((a) => a.tipo === "desvio")
    expect(desvios).toEqual([{ de: "fat", para: idDoFinal("baixo"), tipo: "desvio", rotulo: "Até R$ 50 mil" }])
    expect(c.perdidas).toEqual([{ de: "fat", rotulo: "x" }])
    expect(c.contagem.desvios).toBe(1)
  })

  it("rótulos dos finais: padrão, desqualifica", () => {
    expect(c.nos[4].rotulo).toBe("Final · padrão")
    expect(c.nos[5].rotulo).toBe("Final · desqualifica")
  })

  it("sem abertura ligada a primeira tela ocupa a primeira coluna", () => {
    const s = montarCanvas({ ...schema, settings: {} }, { temAbertura: true })
    expect(s.nos[0].id).toBe("nome")
    expect(s.nos[0].x).toBe(NO.x0)
  })
})

describe("rotuloDaCondicao", () => {
  it("traduz o valor para o rótulo da opção e os operadores para símbolos", () => {
    expect(rotuloDaCondicao({ conditions: [{ ref: "fat", operator: "equals", value: "mais" }], logic: "and", goto: "x" }, schema)).toBe("Mais")
    expect(rotuloDaCondicao({ conditions: [{ ref: "sn", operator: "equals", value: "nao" }], logic: "and", goto: "x" }, schema)).toBe("Não")
    expect(rotuloDaCondicao({ conditions: [{ ref: "nps", operator: "lte", value: 5 }], logic: "and", goto: "x" }, schema)).toBe("≤ 5")
  })
  it("regra sem condição é dita, não escondida; várias viram +N", () => {
    expect(rotuloDaCondicao({ conditions: [], logic: "and", goto: "x" }, schema)).toBe("sem condição")
    expect(
      rotuloDaCondicao(
        { conditions: [{ ref: "fat", operator: "equals", value: "mais" }, { ref: "sn", operator: "is_set" }], logic: "and", goto: "x" },
        schema,
      ),
    ).toBe("Mais +1")
  })
})

describe("caminhoDaAresta", () => {
  const a = { x: 40, y: 60 } as Parameters<typeof caminhoDaAresta>[0]
  it("vizinhos na mesma linha ligam em reta", () => {
    const b = { x: 332, y: 60 } as typeof a
    expect(caminhoDaAresta(a, b, "ordem").d).toBe("M272,92 L332,92")
  })
  it("para a linha de baixo sai do pé em curva", () => {
    const b = { x: 40, y: 274 } as typeof a
    expect(caminhoDaAresta(a, b, "desvio").d.startsWith("M156,124 C")).toBe(true)
  })
})

describe("noDaSelecao", () => {
  const telas = telasDoFluxo(schema)
  it("pergunta agrupada resolve para a CABEÇA da tela", () => {
    expect(noDaSelecao(telas, { tipo: "pergunta", ref: "email" })).toBe("nome")
    expect(noDaSelecao(telas, { tipo: "final", ref: "ok" })).toBe(idDoFinal("ok"))
    expect(noDaSelecao(telas, null)).toBeNull()
  })
})
