import { describe, expect, it } from "vitest"
import type { FormSchema } from "@/types/forms-conversational"
import {
  alvosDoFluxo,
  resolverAlvo,
  sujeitosDaCondicao,
  telasDoFluxo,
} from "../mapa-do-fluxo"
import { refDoPiso } from "../derivados"
import { proximoPasso } from "../engine"

/**
 * O funil de diagnóstico como ele está publicado: a tela de contato
 * agrupa quatro perguntas, a da loja agrupa duas, e o corte de
 * faturamento sai de um valor CALCULADO — não de um rótulo.
 */
const SCHEMA: FormSchema = {
  version: 1,
  display_mode: "conversational",
  locale: "pt-BR",
  blocks: [
    { ref: "nome", type: "text", label: "Nome", titulo_da_tela: "Como falamos com você?" },
    { ref: "sobrenome", type: "text", label: "Sobrenome", mesma_tela: true },
    { ref: "zap", type: "phone", label: "WhatsApp", mesma_tela: true },
    { ref: "email", type: "email", label: "E-mail", mesma_tela: true },
    { ref: "loja", type: "url", label: "Endereço da loja" },
    { ref: "insta", type: "text", label: "@ do Instagram", mesma_tela: true },
    {
      ref: "fat",
      type: "select",
      label: "Faturamento",
      opcoes_por_moeda: true,
      moeda_de: "regiao",
      options: [{ label: "Até R$100k", value: "Até R$100k" }],
      logic: [
        {
          conditions: [{ ref: refDoPiso("fat"), operator: "lt", value: 200000 }],
          logic: "or",
          goto: "ending:abaixo",
        },
      ],
    },
    { ref: "regiao", type: "select", label: "Região", options: [] },
    { ref: "utm", type: "text", label: "UTM", hidden: true },
  ],
  endings: [
    { ref: "ok", title: "Recebemos" },
    { ref: "abaixo", title: "Ainda não é para você", disqualified: true },
  ],
}

describe("telasDoFluxo", () => {
  it("conta TELAS, não perguntas — 8 blocos visíveis viram 4 telas", () => {
    const telas = telasDoFluxo(SCHEMA)
    expect(telas.map((t) => t.blocos.length)).toEqual([4, 2, 1, 1])
    expect(telas.map((t) => t.numero)).toEqual([1, 2, 3, 4])
  })

  it("o oculto não é uma tela: o valor dele vem da URL", () => {
    const telas = telasDoFluxo(SCHEMA)
    expect(telas.flatMap((t) => t.blocos.map((b) => b.ref))).not.toContain("utm")
  })

  it("lista as perguntas que dividem a tela — era o que sumia", () => {
    const [contato] = telasDoFluxo(SCHEMA)
    expect(contato.blocos.map((b) => b.ref)).toEqual(["nome", "sobrenome", "zap", "email"])
    expect(contato.titulo).toBe("Como falamos com você?")
  })

  it("o destino padrão é a próxima TELA, não o próximo bloco", () => {
    const [contato] = telasDoFluxo(SCHEMA)
    // Sem isto, o construtor anunciava "segue para Sobrenome" — um passo
    // que nunca acontece, porque os quatro são o mesmo clique.
    expect(contato.destino).toMatchObject({ tipo: "tela", goto: "loja", numero: 2 })
  })

  it("a última tela termina no primeiro final", () => {
    const telas = telasDoFluxo(SCHEMA)
    expect(telas[telas.length - 1].destino).toMatchObject({ tipo: "final", ref: null })
  })

  it("o desvio diz de QUAL pergunta da tela ele parte", () => {
    const fat = telasDoFluxo(SCHEMA)[2]
    expect(fat.regras).toHaveLength(1)
    expect(fat.regras[0]).toMatchObject({ ref: "fat", indice: 0, deQuemParte: "Faturamento" })
  })

  it("a regra escrita na 2ª pergunta do grupo aparece na tela dela", () => {
    const s: FormSchema = {
      ...SCHEMA,
      blocks: SCHEMA.blocks.map((b) =>
        b.ref === "sobrenome"
          ? {
              ...b,
              logic: [
                { conditions: [{ ref: "sobrenome", operator: "is_set" }], logic: "and", goto: "fat" },
              ],
            }
          : b,
      ),
    }
    const [contato] = telasDoFluxo(s)
    // A engine lê as regras de TODAS as perguntas da tela; o construtor
    // mostrava a de "sobrenome" como se fosse um passo próprio.
    expect(contato.regras[0]).toMatchObject({ ref: "sobrenome", deQuemParte: "Sobrenome" })
  })
})

describe("destino padrão configurado", () => {
  const comProximo: FormSchema = {
    ...SCHEMA,
    blocks: SCHEMA.blocks.map((b) => (b.ref === "loja" ? { ...b, proximo: "regiao" } : b)),
  }

  it("a tela mostra o destino declarado e diz que ele foi declarado", () => {
    const [, lojaTela] = telasDoFluxo(comProximo)
    expect(lojaTela.proximoDeclarado).toBe("regiao")
    expect(lojaTela.destino).toMatchObject({ tipo: "tela", goto: "regiao", numero: 4 })
  })

  it("a engine obedece o mesmo destino que a tela mostra", () => {
    const r = proximoPasso(comProximo, "loja", { answers: {} })
    expect(r.destino).toEqual({ tipo: "bloco", ref: "regiao" })
  })

  it("declarado na 2ª pergunta do grupo vale igual — reagrupar não apaga", () => {
    // O construtor grava na cabeça, mas quem arrasta uma pergunta para
    // cima troca qual é a cabeça. Ler só ali faria o destino sumir em
    // silêncio.
    const s: FormSchema = {
      ...SCHEMA,
      blocks: SCHEMA.blocks.map((b) => (b.ref === "insta" ? { ...b, proximo: "regiao" } : b)),
    }
    expect(proximoPasso(s, "loja", { answers: {} }).destino).toEqual({
      tipo: "bloco",
      ref: "regiao",
    })
  })

  it("apontar para pergunta agrupada pousa no início da tela dela", () => {
    const s: FormSchema = {
      ...SCHEMA,
      blocks: SCHEMA.blocks.map((b) => (b.ref === "fat" ? { ...b, proximo: "insta", logic: undefined } : b)),
    }
    expect(resolverAlvo(s, "insta")).toMatchObject({ tipo: "tela", goto: "loja", numero: 2 })
    expect(proximoPasso(s, "fat", { answers: {} }).destino).toEqual({ tipo: "bloco", ref: "loja" })
  })

  it("destino apagado não vira fim nem some: vira 'perdido'", () => {
    expect(resolverAlvo(SCHEMA, "sumiu")).toMatchObject({ tipo: "perdido" })
    expect(resolverAlvo(SCHEMA, "ending:sumiu")).toMatchObject({ tipo: "perdido" })
  })
})

describe("alvosDoFluxo", () => {
  it("oferece uma entrada por tela, os finais e o 'terminar aqui'", () => {
    const alvos = alvosDoFluxo(SCHEMA)
    expect(alvos.filter((a) => a.tipo === "tela")).toHaveLength(4)
    expect(alvos.filter((a) => a.tipo === "final").map((a) => a.goto)).toEqual([
      "ending:ok",
      "ending:abaixo",
      "ending:",
    ])
  })

  it("endereça a tela pela CABEÇA — nunca pela pergunta do meio", () => {
    const alvos = alvosDoFluxo(SCHEMA)
    expect(alvos.filter((a) => a.tipo === "tela").map((a) => a.goto)).toEqual([
      "nome",
      "loja",
      "fat",
      "regiao",
    ])
  })
})

describe("sujeitosDaCondicao", () => {
  it("o valor calculado aparece — era ele que não estava na lista", () => {
    const lista = sujeitosDaCondicao(SCHEMA, "fat")
    const piso = lista.find((s) => s.ref === refDoPiso("fat"))
    expect(piso).toMatchObject({ grupo: "calculado", numerico: true })
  })

  it("separa o que já foi respondido do que só aparece depois", () => {
    const lista = sujeitosDaCondicao(SCHEMA, "fat")
    const grupo = (ref: string) => lista.find((s) => s.ref === ref)?.grupo
    expect(grupo("nome")).toBe("anteriores")
    expect(grupo("fat")).toBe("desta_tela")
    expect(grupo("regiao")).toBe("posteriores")
  })

  it("as perguntas da mesma tela são 'desta_tela', não 'anteriores'", () => {
    const lista = sujeitosDaCondicao(SCHEMA, "nome")
    for (const ref of ["nome", "sobrenome", "zap", "email"]) {
      expect(lista.find((s) => s.ref === ref)?.grupo).toBe("desta_tela")
    }
  })

  it("o oculto entra: dá para ramificar por ?plano=x sem ninguém responder", () => {
    const lista = sujeitosDaCondicao(SCHEMA, "nome")
    expect(lista.find((s) => s.ref === "utm")?.grupo).toBe("oculto")
  })
})
