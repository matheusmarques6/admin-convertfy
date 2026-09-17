import { describe, expect, it } from "vitest"
import {
  contarProblemas,
  diagnosticarFluxo,
  opcoesDaPergunta,
  type ProblemaDoFluxo,
} from "../diagnostico-fluxo"
import { normalizarSchema } from "../schema"
import type { FormSchema } from "@/types/forms-conversational"

function schema(parcial: Record<string, unknown>): FormSchema {
  return normalizarSchema({ display_mode: "conversational", ...parcial })
}

const tipos = (lista: readonly ProblemaDoFluxo[]) => lista.map((p) => p.tipo)

describe("diagnosticarFluxo", () => {
  it("não reclama de um fluxo linear sem lógica", () => {
    const s = schema({
      blocks: [
        { ref: "a", type: "text", label: "Nome" },
        { ref: "b", type: "email", label: "Email" },
      ],
      endings: [{ ref: "ok", title: "Obrigado" }],
    })
    expect(diagnosticarFluxo(s)).toEqual([])
  })

  it("acusa destino que não existe mais", () => {
    const s = schema({
      blocks: [
        {
          ref: "a",
          type: "radio",
          label: "Faturamento",
          options: ["Até 100k"],
          logic: [{ conditions: [{ ref: "a", operator: "equals", value: "Até 100k" }], logic: "and", goto: "sumiu" }],
        },
      ],
      endings: [{ ref: "ok", title: "Obrigado" }],
    })
    expect(tipos(diagnosticarFluxo(s))).toContain("destino_inexistente")
  })

  it("acusa final que não existe mais", () => {
    const s = schema({
      blocks: [
        {
          ref: "a",
          type: "text",
          label: "Nome",
          logic: [{ conditions: [{ ref: "a", operator: "is_set" }], logic: "and", goto: "ending:fantasma" }],
        },
      ],
      endings: [{ ref: "ok", title: "Obrigado" }],
    })
    expect(tipos(diagnosticarFluxo(s))).toContain("destino_inexistente")
  })

  it("`ending:` sem nome é 'termine aqui' e não é destino inexistente", () => {
    const s = schema({
      blocks: [
        {
          ref: "a",
          type: "text",
          label: "Nome",
          logic: [{ conditions: [{ ref: "a", operator: "is_set" }], logic: "and", goto: "ending:" }],
        },
      ],
      endings: [{ ref: "ok", title: "Obrigado" }],
    })
    expect(tipos(diagnosticarFluxo(s))).not.toContain("destino_inexistente")
  })

  it("acusa a regra sem condição, que nunca casa", () => {
    const s = schema({
      blocks: [
        { ref: "a", type: "text", label: "Nome", logic: [{ conditions: [], logic: "and", goto: "ending:" }] },
        { ref: "b", type: "email", label: "Email" },
      ],
    })
    expect(tipos(diagnosticarFluxo(s))).toContain("regra_sem_condicao")
  })

  it("acusa condição com valor em branco", () => {
    const s = schema({
      blocks: [
        {
          ref: "a",
          type: "text",
          label: "Nome",
          logic: [{ conditions: [{ ref: "a", operator: "equals", value: "" }], logic: "and", goto: "ending:" }],
        },
      ],
    })
    expect(tipos(diagnosticarFluxo(s))).toContain("condicao_sem_valor")
  })

  it("`is_set` não precisa de valor", () => {
    const s = schema({
      blocks: [
        {
          ref: "a",
          type: "text",
          label: "Nome",
          logic: [{ conditions: [{ ref: "a", operator: "is_set" }], logic: "and", goto: "ending:" }],
        },
      ],
    })
    expect(tipos(diagnosticarFluxo(s))).not.toContain("condicao_sem_valor")
  })

  it("acusa valor que nenhuma opção oferece — o defeito do 'renomeei a opção'", () => {
    const s = schema({
      blocks: [
        {
          ref: "a",
          type: "radio",
          label: "Faturamento",
          options: ["Até R$100 mil", "Acima de R$1 milhão"],
          logic: [
            {
              conditions: [{ ref: "a", operator: "in", value: ["R$1 milhão - R$5 milhões"] }],
              logic: "and",
              goto: "ending:",
            },
          ],
        },
      ],
    })
    const p = diagnosticarFluxo(s)
    expect(tipos(p)).toContain("valor_fora_das_opcoes")
    expect(p[0].mensagem).toContain("R$1 milhão - R$5 milhões")
  })

  it("compara como o envio compara: acento e caixa não são divergência", () => {
    const s = schema({
      blocks: [
        {
          ref: "a",
          type: "radio",
          label: "Cidade",
          options: ["São Paulo"],
          logic: [
            { conditions: [{ ref: "a", operator: "equals", value: "sao paulo" }], logic: "and", goto: "ending:" },
          ],
        },
      ],
    })
    expect(tipos(diagnosticarFluxo(s))).not.toContain("valor_fora_das_opcoes")
  })

  it("não cobra correspondência em pergunta de texto livre", () => {
    const s = schema({
      blocks: [
        {
          ref: "a",
          type: "text",
          label: "Cargo",
          logic: [{ conditions: [{ ref: "a", operator: "equals", value: "CEO" }], logic: "and", goto: "ending:" }],
        },
      ],
    })
    expect(tipos(diagnosticarFluxo(s))).not.toContain("valor_fora_das_opcoes")
  })

  it("`contains` é fragmento de propósito — não cobra a lista", () => {
    const s = schema({
      blocks: [
        {
          ref: "a",
          type: "radio",
          label: "Faturamento",
          options: ["Até R$100 mil"],
          logic: [{ conditions: [{ ref: "a", operator: "contains", value: "100" }], logic: "and", goto: "ending:" }],
        },
      ],
    })
    expect(tipos(diagnosticarFluxo(s))).not.toContain("valor_fora_das_opcoes")
  })

  it("acusa laço entre telas que avançam sozinhas", () => {
    const s = schema({
      blocks: [
        {
          ref: "t1",
          type: "statement",
          label: "Aviso",
          logic: [{ conditions: [{ ref: "t1", operator: "is_set" }], logic: "and", goto: "t2" }],
        },
        {
          ref: "t2",
          type: "statement",
          label: "Outro aviso",
          logic: [{ conditions: [{ ref: "t2", operator: "is_set" }], logic: "and", goto: "t1" }],
        },
      ],
    })
    expect(tipos(diagnosticarFluxo(s))).toContain("laco_de_tela")
  })

  it("salto para trás entre PERGUNTAS é aviso, não erro — a pessoa responde de novo", () => {
    const s = schema({
      blocks: [
        { ref: "a", type: "text", label: "Nome" },
        {
          ref: "b",
          type: "email",
          label: "Email",
          logic: [{ conditions: [{ ref: "b", operator: "is_set" }], logic: "and", goto: "a" }],
        },
      ],
    })
    const p = diagnosticarFluxo(s)
    expect(tipos(p)).toContain("salto_para_tras")
    expect(p.find((x) => x.tipo === "salto_para_tras")?.gravidade).toBe("aviso")
  })

  it("o primeiro final nunca é órfão — é o desfecho de quem chega ao fim", () => {
    const s = schema({
      blocks: [{ ref: "a", type: "text", label: "Nome" }],
      endings: [{ ref: "ok", title: "Obrigado" }],
    })
    expect(tipos(diagnosticarFluxo(s))).not.toContain("final_orfao")
  })

  it("final que nenhuma regra alcança vira aviso", () => {
    const s = schema({
      blocks: [{ ref: "a", type: "text", label: "Nome" }],
      endings: [
        { ref: "ok", title: "Obrigado" },
        { ref: "fora", title: "Ainda não é para você", disqualified: true },
      ],
    })
    expect(tipos(diagnosticarFluxo(s))).toContain("final_orfao")
  })

  it("condição que testa pergunta posterior é aviso: no caminho normal ela ainda está vazia", () => {
    const s = schema({
      blocks: [
        {
          ref: "a",
          type: "text",
          label: "Nome",
          logic: [{ conditions: [{ ref: "b", operator: "is_set" }], logic: "and", goto: "ending:" }],
        },
        { ref: "b", type: "email", label: "Email" },
      ],
    })
    expect(tipos(diagnosticarFluxo(s))).toContain("condicao_de_pergunta_posterior")
  })

  it("erro vem antes de aviso", () => {
    const s = schema({
      blocks: [
        { ref: "a", type: "text", label: "Nome" },
        {
          ref: "b",
          type: "email",
          label: "Email",
          logic: [
            { conditions: [{ ref: "b", operator: "is_set" }], logic: "and", goto: "a" },
            { conditions: [], logic: "and", goto: "ending:" },
          ],
        },
      ],
    })
    const p = diagnosticarFluxo(s)
    expect(p[0].gravidade).toBe("erro")
    expect(p[p.length - 1].gravidade).toBe("aviso")
  })

  it("conta erros e avisos separados", () => {
    const s = schema({
      blocks: [
        {
          ref: "a",
          type: "text",
          label: "Nome",
          logic: [{ conditions: [], logic: "and", goto: "nao-existe" }],
        },
      ],
      endings: [
        { ref: "ok", title: "Obrigado" },
        { ref: "fora", title: "Fora" },
      ],
    })
    const c = contarProblemas(diagnosticarFluxo(s))
    expect(c.erros).toBeGreaterThan(0)
    expect(c.avisos).toBeGreaterThan(0)
  })

  it("clássico sem final não é reclamação — a mensagem de sucesso é o desfecho", () => {
    const s = normalizarSchema({
      display_mode: "classic",
      blocks: [{ ref: "a", type: "text", label: "Nome" }],
    })
    expect(tipos(diagnosticarFluxo(s))).not.toContain("sem_final")
  })
})

describe("opcoesDaPergunta", () => {
  it("devolve null em pergunta de lista aberta", () => {
    const s = schema({ blocks: [{ ref: "a", type: "text", label: "Nome" }] })
    expect(opcoesDaPergunta(s.blocks[0])).toBeNull()
  })

  it("devolve os valores da escolha", () => {
    const s = schema({ blocks: [{ ref: "a", type: "radio", label: "X", options: ["Sim", "Não"] }] })
    expect(opcoesDaPergunta(s.blocks[0])).toEqual(["Sim", "Não"])
  })
})

describe("recall de uma resposta da mesma tela", () => {
  const comGrupo = (labelDoEmail: string): FormSchema => ({
    version: 1,
    display_mode: "conversational",
    locale: "pt-BR",
    blocks: [
      { ref: "f1", type: "text", label: "Nome", alias: "nome", required: true },
      { ref: "f2", type: "email", label: labelDoEmail, required: true, mesma_tela: true },
    ],
    endings: [{ ref: "ok", title: "Pronto" }],
  })

  it("acusa {{nome}} quando as duas perguntas dividem a tela", () => {
    const p = diagnosticarFluxo(comGrupo("Prazer, {{nome}}. Seu email?"))
    const achado = p.find((x) => x.tipo === "recall_da_mesma_tela")
    expect(achado).toBeDefined()
    expect(achado?.gravidade).toBe("erro")
    expect(achado?.ref).toBe("f2")
  })

  it("resolve por ref e por label, como o recall de verdade", () => {
    expect(diagnosticarFluxo(comGrupo("Oi {{f1}}")).some((x) => x.tipo === "recall_da_mesma_tela")).toBe(true)
    expect(diagnosticarFluxo(comGrupo("Oi {{Nome}}")).some((x) => x.tipo === "recall_da_mesma_tela")).toBe(true)
  })

  it("não acusa quando as perguntas estão em telas diferentes", () => {
    const s = comGrupo("Prazer, {{nome}}. Seu email?")
    s.blocks[1].mesma_tela = false
    expect(diagnosticarFluxo(s).some((x) => x.tipo === "recall_da_mesma_tela")).toBe(false)
  })

  it("campo OCULTO no grupo continua citável — o valor vem da URL", () => {
    const s: FormSchema = {
      version: 1,
      display_mode: "conversational",
      locale: "pt-BR",
      blocks: [
        { ref: "utm", type: "text", label: "utm_source", hidden: true },
        { ref: "f1", type: "text", label: "Veio de {{utm_source}}?", required: true },
        { ref: "f2", type: "email", label: "Email", required: true, mesma_tela: true },
      ],
      endings: [{ ref: "ok", title: "Pronto" }],
    }
    expect(diagnosticarFluxo(s).some((x) => x.tipo === "recall_da_mesma_tela")).toBe(false)
  })
})
