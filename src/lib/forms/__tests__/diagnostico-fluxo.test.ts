import { describe, expect, it } from "vitest"
import {
  contarProblemas,
  diagnosticarFluxo,
  opcoesDaPergunta,
  type ProblemaDoFluxo,
} from "../diagnostico-fluxo"
import { normalizarSchema } from "../schema"
import type { FormSchema } from "@/types/forms-conversational"
import type { QualifiedOperator } from "@/types/form-tracking"
import { refDoPiso } from "../derivados"

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

/* ------------------------------------------------------------------ *
 * O valor CALCULADO não é uma pergunta apagada
 * ------------------------------------------------------------------ */

describe("condição sobre valor derivado", () => {
  const comPiso = (operator: QualifiedOperator, value: unknown): FormSchema => ({
    version: 1,
    display_mode: "conversational",
    locale: "pt-BR",
    blocks: [
      { ref: "regiao", type: "select", label: "Região", options: [] },
      {
        ref: "fat",
        type: "select",
        label: "Faturamento",
        opcoes_por_moeda: true,
        moeda_de: "regiao",
        options: [],
        logic: [
          {
            conditions: [
              { ref: refDoPiso("fat"), operator, value: value as string | string[] | number | null },
            ],
            logic: "or",
            goto: "ending:abaixo",
          },
        ],
      },
    ],
    endings: [{ ref: "ok", title: "Recebemos" }, { ref: "abaixo", title: "Não é para você" }],
  })

  it("a régua do corte NÃO é 'pergunta que não existe mais'", () => {
    // O erro falso apareceu no funil de produção, no topo da aba Fluxo,
    // sobre a condição que sustenta o corte de R$200 mil. Quem fosse
    // consertá-lo escolhendo outra pergunta no select desligaria o corte.
    expect(diagnosticarFluxo(comPiso("lt", 200000))).toEqual([])
  })

  it("comparar o número com operador de texto é erro", () => {
    const p = diagnosticarFluxo(comPiso("in", ["Até R$100k"]))
    expect(p.map((x) => x.tipo)).toEqual(["operador_incompativel"])
  })

  it("valor em branco continua sendo erro", () => {
    const p = diagnosticarFluxo(comPiso("gte", null))
    expect(p.map((x) => x.tipo)).toEqual(["condicao_sem_valor"])
  })

  it("origem apagada é o erro de verdade, e ele é dito com outra palavra", () => {
    const s = comPiso("lt", 200000)
    const semOrigem: FormSchema = {
      ...s,
      blocks: s.blocks.map((b) => (b.ref === "fat" ? { ...b, opcoes_por_moeda: false } : b)),
    }
    const p = diagnosticarFluxo(semOrigem)
    expect(p.map((x) => x.tipo)).toEqual(["derivado_sem_origem"])
  })
})

describe("posterioridade é medida por TELA", () => {
  const agrupado: FormSchema = {
    version: 1,
    display_mode: "conversational",
    locale: "pt-BR",
    blocks: [
      {
        ref: "nome",
        type: "text",
        label: "Nome",
        logic: [
          { conditions: [{ ref: "email", operator: "is_set" }], logic: "and", goto: "ending:ok" },
        ],
      },
      { ref: "email", type: "email", label: "E-mail", mesma_tela: true },
      { ref: "depois", type: "text", label: "Depois" },
    ],
    endings: [{ ref: "ok", title: "Fim" }],
  }

  it("testar campo da MESMA tela não é adiantado — é o caso comum de agrupar", () => {
    expect(diagnosticarFluxo(agrupado)).toEqual([])
  })

  it("testar campo de tela posterior continua sendo aviso", () => {
    const s: FormSchema = {
      ...agrupado,
      blocks: agrupado.blocks.map((b) =>
        b.ref === "nome"
          ? {
              ...b,
              logic: [
                { conditions: [{ ref: "depois", operator: "is_set" }], logic: "and", goto: "ending:ok" },
              ],
            }
          : b,
      ),
    }
    expect(diagnosticarFluxo(s).map((p) => p.tipo)).toEqual(["condicao_de_pergunta_posterior"])
  })
})

describe("tela inalcançável", () => {
  const base = (proximo?: string): FormSchema => ({
    version: 1,
    display_mode: "conversational",
    locale: "pt-BR",
    blocks: [
      { ref: "a", type: "text", label: "A", ...(proximo ? { proximo } : {}) },
      { ref: "b", type: "text", label: "B" },
      { ref: "c", type: "text", label: "C" },
    ],
    endings: [{ ref: "ok", title: "Fim" }],
  })

  it("sem destino configurado, nada dispara — a ordem alcança tudo", () => {
    // A régua é auto-limitada de propósito: é o que impede o alarme falso
    // em todo formulário linear, que são quase todos.
    expect(diagnosticarFluxo(base())).toEqual([])
  })

  it("pular uma tela sem ninguém apontar para ela é erro", () => {
    const p = diagnosticarFluxo(base("c"))
    expect(p.map((x) => x.tipo)).toEqual(["tela_inalcancavel"])
    expect(p[0].ref).toBe("b")
  })

  it("pular, mas ter um desvio que leva até ela, está certo", () => {
    const s = base("c")
    s.blocks[0].logic = [
      { conditions: [{ ref: "a", operator: "is_set" }], logic: "and", goto: "b" },
    ]
    expect(diagnosticarFluxo(s)).toEqual([])
  })

  it("a tela que agrupa diz quantas perguntas somem com ela", () => {
    const s = base("c")
    s.blocks = [
      s.blocks[0],
      s.blocks[1],
      { ref: "b2", type: "text", label: "B2", mesma_tela: true },
      s.blocks[2],
    ]
    const p = diagnosticarFluxo(s)
    expect(p[0].mensagem).toContain("2 perguntas")
  })

  it("destino padrão apontando para o vazio é erro, como um goto morto", () => {
    expect(diagnosticarFluxo(base("sumiu")).map((x) => x.tipo)).toContain("destino_inexistente")
  })
})

describe("laço no caminho padrão", () => {
  const tres = (patch: Record<string, string>): FormSchema => ({
    version: 1,
    display_mode: "conversational",
    locale: "pt-BR",
    blocks: [
      { ref: "a", type: "text", label: "A", ...(patch.a ? { proximo: patch.a } : {}) },
      { ref: "b", type: "text", label: "B", ...(patch.b ? { proximo: patch.b } : {}) },
      { ref: "c", type: "text", label: "C", ...(patch.c ? { proximo: patch.c } : {}) },
    ],
    endings: [{ ref: "ok", title: "Fim" }],
  })

  it("ordem normal não faz ciclo", () => {
    expect(diagnosticarFluxo(tres({}))).toEqual([])
  })

  it("tela que aponta para ela mesma é erro — a pessoa nunca sai", () => {
    const p = diagnosticarFluxo(tres({ b: "b" }))
    const laco = p.find((x) => x.tipo === "laco_de_destino_padrao")
    expect(laco?.gravidade).toBe("erro")
    expect(laco?.mensagem).toContain("ela mesma")
  })

  it("par que fica trocando de lugar também", () => {
    const p = diagnosticarFluxo(tres({ b: "c", c: "b" }))
    expect(p.some((x) => x.tipo === "laco_de_destino_padrao" && x.gravidade === "erro")).toBe(true)
  })

  it("com um desvio que sai do círculo, vira aviso: alguém pode escapar", () => {
    const s = tres({ b: "c", c: "b" })
    s.blocks[1].logic = [
      { conditions: [{ ref: "b", operator: "is_set" }], logic: "and", goto: "ending:ok" },
    ]
    const laco = diagnosticarFluxo(s).find((x) => x.tipo === "laco_de_destino_padrao")
    expect(laco?.gravidade).toBe("aviso")
  })

  it("o mesmo círculo é acusado uma vez, não uma por tela", () => {
    const p = diagnosticarFluxo(tres({ b: "c", c: "b" }))
    expect(p.filter((x) => x.tipo === "laco_de_destino_padrao")).toHaveLength(1)
  })
})
