import { describe, expect, it } from "vitest"
import type { FormSchema } from "@/types/forms-conversational"
import {
  avaliarCondicao,
  blocoDoAbandono,
  calcularProgresso,
  caminhoAte,
  passoAnterior,
  primeiroBloco,
  progressoMonotonico,
  proximoPasso,
  respostasForaDoCaminho,
  totalRespondido,
  ultimoAlcancavel,
} from "../engine"

/**
 * O formulário de diagnóstico, na forma que os anúncios vão usar: a faixa
 * de faturamento decide entre seguir para a qualificação ou terminar num
 * final de "ainda não é para você".
 */
const SCHEMA: FormSchema = {
  version: 1,
  display_mode: "conversational",
  locale: "pt-BR",
  blocks: [
    { ref: "nome", type: "text", label: "Como você se chama?", required: true },
    {
      ref: "fat",
      type: "radio",
      label: "Qual seu faturamento mensal?",
      required: true,
      options: [
        { label: "Até R$100 mil", value: "ate-100k" },
        { label: "R$100 mil a R$200 mil", value: "100-200k" },
        { label: "R$200 mil a R$500 mil", value: "200-500k" },
        { label: "Acima de R$5 milhões", value: "acima-5m" },
      ],
      logic: [
        {
          conditions: [{ ref: "fat", operator: "in", value: ["ate-100k", "100-200k"] }],
          logic: "or",
          goto: "ending:pequeno",
          set: [{ nome: "score", operacao: "set", valor: 0 }],
        },
        {
          conditions: [{ ref: "fat", operator: "in", value: ["200-500k", "acima-5m"] }],
          logic: "or",
          goto: "email",
          set: [{ nome: "score", operacao: "add", valor: 10 }],
        },
      ],
    },
    { ref: "email", type: "email", label: "Para onde mando o diagnóstico?", required: true },
    { ref: "tel", type: "phone", label: "E seu WhatsApp?", required: true },
    { ref: "origem", type: "text", label: "utm", hidden: true },
  ],
  endings: [
    { ref: "ok", title: "Recebemos, {{nome}}!" },
    { ref: "pequeno", title: "Ainda não é o momento", disqualified: true },
  ],
}

describe("proximoPasso", () => {
  it("sem lógica que case, segue a ordem do schema", () => {
    const r = proximoPasso(SCHEMA, "nome", { answers: { nome: "Bruno" } })
    expect(r.destino).toEqual({ tipo: "bloco", ref: "fat" })
  })

  it("a faixa de baixo termina num final de desqualificação", () => {
    const r = proximoPasso(SCHEMA, "fat", { answers: { fat: "ate-100k" } })
    expect(r.destino).toEqual({ tipo: "fim", ending: "pequeno" })
    expect(r.variables).toEqual({ score: 0 })
  })

  it("a faixa de cima salta para o email e pontua", () => {
    const r = proximoPasso(SCHEMA, "fat", { answers: { fat: "200-500k" } })
    expect(r.destino).toEqual({ tipo: "bloco", ref: "email" })
    expect(r.variables).toEqual({ score: 10 })
  })

  it("o último bloco visível termina o formulário", () => {
    const r = proximoPasso(SCHEMA, "tel", { answers: {} })
    expect(r.destino).toEqual({ tipo: "fim", ending: null })
  })

  it("bloco oculto nunca é o destino — a navegação passa por cima", () => {
    // `origem` é hidden e é o último do schema; o bloco antes dele
    // precisa terminar o form, não pousar num campo invisível.
    const vis = primeiroBloco(SCHEMA)
    expect(vis).toEqual({ tipo: "bloco", ref: "nome" })
    const r = proximoPasso(SCHEMA, "tel", { answers: {} })
    expect(r.destino).not.toEqual({ tipo: "bloco", ref: "origem" })
  })

  it("destino que não existe vira erro nomeado, não tela em branco", () => {
    const quebrado: FormSchema = {
      ...SCHEMA,
      blocks: [
        {
          ref: "a",
          type: "text",
          label: "A",
          logic: [{ conditions: [{ ref: "a", operator: "is_set" }], logic: "and", goto: "sumiu" }],
        },
      ],
    }
    const r = proximoPasso(quebrado, "a", { answers: { a: "x" } })
    expect(r.destino).toEqual({ tipo: "erro", motivo: "destino_inexistente", ref: "a" })
  })

  it("laço de statements é cortado em vez de travar a aba", () => {
    const laco: FormSchema = {
      version: 1,
      display_mode: "conversational",
      locale: "pt-BR",
      blocks: [
        {
          ref: "s1",
          type: "statement",
          label: "um",
          logic: [{ conditions: [{ ref: "x", operator: "is_set" }], logic: "and", goto: "s2" }],
        },
        {
          ref: "s2",
          type: "statement",
          label: "dois",
          logic: [{ conditions: [{ ref: "x", operator: "is_set" }], logic: "and", goto: "s1" }],
        },
      ],
    }
    const r = proximoPasso(laco, "s1", { answers: { x: "sim" } })
    expect(r.destino).toEqual({ tipo: "erro", motivo: "laco", ref: "s1" })
  })
})

describe("avaliarCondicao", () => {
  it("compara sem caixa e sem acento, como o evento qualificado", () => {
    const c = { ref: "cidade", operator: "equals" as const, value: "sao paulo" }
    expect(avaliarCondicao(c, { answers: { cidade: "São Paulo" } })).toBe(true)
  })

  it("resposta múltipla casa quando QUALQUER item satisfaz", () => {
    const c = { ref: "canais", operator: "in" as const, value: ["email"] }
    expect(avaliarCondicao(c, { answers: { canais: ["sms", "email"] } })).toBe(true)
  })

  it("número em formato BR é comparado como número", () => {
    const c = { ref: "fat", operator: "gte" as const, value: "200000" }
    expect(avaliarCondicao(c, { answers: { fat: "250.000" } })).toBe(true)
    expect(avaliarCondicao(c, { answers: { fat: "150.000" } })).toBe(false)
  })

  it("`is_set` distingue vazio de não respondido", () => {
    const c = { ref: "x", operator: "is_set" as const }
    expect(avaliarCondicao(c, { answers: {} })).toBe(false)
    expect(avaliarCondicao(c, { answers: { x: "   " } })).toBe(false)
    expect(avaliarCondicao(c, { answers: { x: "a" } })).toBe(true)
  })

  it("campo oculto da URL entra na lógica como qualquer resposta", () => {
    const c = { ref: "plano", operator: "equals" as const, value: "anual" }
    expect(avaliarCondicao(c, { answers: {}, hidden: { plano: "anual" } })).toBe(true)
  })

  it("`not_in` sem resposta é falso — ausência não é 'não está na lista'", () => {
    const c = { ref: "x", operator: "not_in" as const, value: ["a"] }
    expect(avaliarCondicao(c, { answers: {} })).toBe(false)
  })
})

describe("caminho e voltar", () => {
  it("o caminho reflete o salto, não a ordem do schema", () => {
    const { caminho, alcancou } = caminhoAte(SCHEMA, "tel", {
      answers: { nome: "B", fat: "200-500k", email: "b@x.com" },
    })
    expect(caminho).toEqual(["nome", "fat", "email", "tel"])
    expect(alcancou).toBe(true)
  })

  it("voltar do email cai na faixa, não no bloco anterior do schema", () => {
    const anterior = passoAnterior(SCHEMA, "email", {
      answers: { nome: "B", fat: "acima-5m" },
    })
    expect(anterior).toBe("fat")
  })

  it("no primeiro bloco não há para onde voltar", () => {
    expect(passoAnterior(SCHEMA, "nome", { answers: {} })).toBeNull()
  })

  it("trocar a resposta torna o bloco atual inalcançável — e o caminho diz onde pousar", () => {
    // Estava no `email` e voltou para trocar a faixa para a de baixo.
    const ctx = { answers: { nome: "B", fat: "ate-100k" } }
    const { alcancou } = caminhoAte(SCHEMA, "email", ctx)
    expect(alcancou).toBe(false)
    expect(passoAnterior(SCHEMA, "email", ctx)).toBe("fat")
  })
})

describe("progresso", () => {
  it("cresce a cada passo do caminho default", () => {
    const ctx = { answers: { nome: "B", fat: "200-500k" } }
    const p1 = calcularProgresso(SCHEMA, "nome", ctx)
    const p2 = calcularProgresso(SCHEMA, "fat", ctx)
    const p3 = calcularProgresso(SCHEMA, "tel", ctx)
    expect(p1.fracao).toBeLessThan(p2.fracao)
    expect(p2.fracao).toBeLessThan(p3.fracao)
    expect(p3.fracao).toBe(1)
  })

  it("não conta o campo oculto no total", () => {
    const p = calcularProgresso(SCHEMA, "nome", { answers: { fat: "200-500k" } })
    expect(p.total).toBe(4) // nome, fat, email, tel — `origem` fora
  })

  it("a barra nunca recua quando a estimativa encolhe", () => {
    expect(progressoMonotonico(0.8, 0.5)).toBe(0.8)
    expect(progressoMonotonico(0.2, 0.6)).toBe(0.6)
    expect(progressoMonotonico(0.9, 2)).toBe(1)
  })
})

describe("abandono e respostas órfãs", () => {
  it("o bloco do abandono é a pergunta VISTA e não respondida", () => {
    const b = blocoDoAbandono(SCHEMA, { answers: { nome: "B", fat: "200-500k" } }, "email")
    expect(b?.ref).toBe("email")
    expect(b?.label).toBe("Para onde mando o diagnóstico?")
  })

  it("sem saber a tela atual, é o último alcançável pela lógica", () => {
    const b = blocoDoAbandono(SCHEMA, { answers: { nome: "B" } }, null)
    expect(b?.ref).toBe("fat")
  })

  it("resposta do ramo abandonado é nomeada para o submit descartar", () => {
    // Respondeu email e tel, voltou e trocou a faixa para a de baixo:
    // o ramo inteiro saiu do caminho.
    const ctx = {
      answers: { nome: "B", fat: "ate-100k", email: "b@x.com", tel: "11999999999" },
    }
    const orfas = respostasForaDoCaminho(SCHEMA, ctx, null)
    expect(orfas.sort()).toEqual(["email", "tel"])
  })

  it("campo oculto nunca é órfão", () => {
    const ctx = { answers: { nome: "B", origem: "meta-ads" } }
    expect(respostasForaDoCaminho(SCHEMA, ctx, null)).toEqual([])
  })

  it("conta só as respostas do caminho", () => {
    const ctx = { answers: { nome: "B", fat: "ate-100k", email: "b@x.com" } }
    expect(ultimoAlcancavel(SCHEMA, ctx)).toBe("fat")
    expect(totalRespondido(SCHEMA, ctx)).toBe(2)
  })
})

describe("obrigatório vale só no caminho percorrido", () => {
  /**
   * O bug que este teste trava: quem cai no final "abaixo do corte"
   * NUNCA vê as perguntas seguintes, e duas delas são obrigatórias. O
   * submit exigia todas e devolvia 400 — perdendo o lead que respondeu
   * tudo o que lhe foi perguntado.
   */
  const COM_OBRIGATORIO_ADIANTE: FormSchema = {
    ...SCHEMA,
    blocks: [
      SCHEMA.blocks[0],
      SCHEMA.blocks[1],
      { ...SCHEMA.blocks[2], required: true },
      { ...SCHEMA.blocks[3], required: true },
      SCHEMA.blocks[4],
    ],
  }

  it("o caminho curto NÃO inclui as perguntas que a lógica pulou", () => {
    const ctx = { answers: { nome: "B", fat: "ate-100k" } }
    const fim = ultimoAlcancavel(COM_OBRIGATORIO_ADIANTE, ctx)
    const { caminho } = caminhoAte(COM_OBRIGATORIO_ADIANTE, fim!, ctx)
    expect(caminho).toEqual(["nome", "fat"])
    expect(caminho).not.toContain("email")
    expect(caminho).not.toContain("tel")
  })

  it("o caminho longo inclui tudo — nada foi afrouxado para quem passou por lá", () => {
    const ctx = { answers: { nome: "B", fat: "200-500k", email: "b@x.com", tel: "119" } }
    const fim = ultimoAlcancavel(COM_OBRIGATORIO_ADIANTE, ctx)
    const { caminho } = caminhoAte(COM_OBRIGATORIO_ADIANTE, fim!, ctx)
    expect(caminho).toEqual(["nome", "fat", "email", "tel"])
  })

  it("sem lógica nenhuma, o caminho é a lista inteira — o clássico não muda", () => {
    const classico: FormSchema = {
      version: 1,
      display_mode: "classic",
      locale: "pt-BR",
      blocks: [
        { ref: "a", type: "text", label: "A", required: true },
        { ref: "b", type: "email", label: "B", required: true },
        { ref: "c", type: "text", label: "C" },
      ],
    }
    const ctx = { answers: {} }
    const fim = ultimoAlcancavel(classico, ctx)
    const { caminho } = caminhoAte(classico, fim!, ctx)
    expect(caminho).toEqual(["a", "b", "c"])
  })
})

// ─────────────────── perguntas que dividem a tela ────────────────────────

/**
 * A primeira tela pede contato inteiro — nome, email e telefone juntos —
 * e só depois o formulário volta a uma pergunta por vez. É o formato do
 * Typeform que o operador pediu, e é onde a engine mais tem como errar:
 * cada função que navega precisa pensar em TELA, não em pergunta.
 */
const COM_GRUPO: FormSchema = {
  version: 1,
  display_mode: "conversational",
  locale: "pt-BR",
  blocks: [
    { ref: "nome", type: "text", label: "Nome", required: true, titulo_da_tela: "Seus dados" },
    { ref: "email", type: "email", label: "Email", required: true, mesma_tela: true },
    { ref: "fone", type: "phone", label: "WhatsApp", required: true, mesma_tela: true },
    {
      ref: "fat",
      type: "radio",
      label: "Faturamento?",
      required: true,
      options: [
        { label: "Até 100k", value: "ate" },
        { label: "Acima", value: "acima" },
      ],
      logic: [
        { conditions: [{ ref: "fat", operator: "equals", value: "ate" }], logic: "and", goto: "ending:fora" },
      ],
    },
    { ref: "site", type: "url", label: "Site", required: true },
  ],
  endings: [
    { ref: "ok", title: "Recebemos" },
    { ref: "fora", title: "Ainda não é para você", disqualified: true },
  ],
}

describe("telas que agrupam perguntas", () => {
  it("o avanço pula a tela inteira, não o campo seguinte", () => {
    const r = proximoPasso(COM_GRUPO, "nome", { answers: {} })
    expect(r.destino).toEqual({ tipo: "bloco", ref: "fat" })
  })

  it("avançar a partir de um campo do meio do grupo dá no mesmo", () => {
    expect(proximoPasso(COM_GRUPO, "email", { answers: {} }).destino).toEqual({
      tipo: "bloco",
      ref: "fat",
    })
  })

  it("o caminho conta TELAS: o grupo de três é um passo", () => {
    const { caminho } = caminhoAte(COM_GRUPO, "site", { answers: { fat: "acima" } })
    expect(caminho).toEqual(["nome", "fat", "site"])
  })

  it("voltar de 'fat' pousa na cabeça do grupo, nunca no meio dele", () => {
    expect(passoAnterior(COM_GRUPO, "fat", { answers: {} })).toBe("nome")
  })

  it("a lógica escrita numa pergunta do grupo vale para a tela", () => {
    const comLogicaNoMeio: FormSchema = {
      ...COM_GRUPO,
      blocks: COM_GRUPO.blocks.map((b) =>
        b.ref === "email"
          ? {
              ...b,
              logic: [
                {
                  conditions: [{ ref: "email", operator: "contains", value: "@convertfy" }],
                  logic: "and" as const,
                  goto: "site",
                },
              ],
            }
          : b,
      ),
    }
    const r = proximoPasso(comLogicaNoMeio, "nome", { answers: { email: "bruno@convertfy.me" } })
    expect(r.destino).toEqual({ tipo: "bloco", ref: "site" })
  })

  it("salto que aponta para o meio de um grupo pousa no começo dele", () => {
    const apontaPraDentro: FormSchema = {
      ...COM_GRUPO,
      blocks: [
        { ref: "abre", type: "statement" as const, label: "Oi", logic: [] },
        ...COM_GRUPO.blocks,
      ].map((b) =>
        b.ref === "abre"
          ? {
              ...b,
              logic: [{ conditions: [{ ref: "x", operator: "is_set" }], logic: "and" as const, goto: "fone" }],
            }
          : b,
      ),
    }
    const r = proximoPasso(apontaPraDentro, "abre", { answers: { x: "1" } })
    expect(r.destino).toEqual({ tipo: "bloco", ref: "nome" })
  })

  it("a resposta de um campo agrupado NÃO é órfã — ela foi pedida", () => {
    const orfas = respostasForaDoCaminho(
      COM_GRUPO,
      { answers: { nome: "Bruno", email: "b@x.com", fone: "+5511999998888", fat: "acima" } },
      null,
    )
    expect(orfas).toEqual([])
  })

  it("conta as respostas do grupo, não só a da cabeça", () => {
    expect(
      totalRespondido(COM_GRUPO, { answers: { nome: "Bruno", email: "b@x.com" } }),
    ).toBe(2)
  })

  it("parar no 2º campo do grupo é parar NAQUELA tela", () => {
    const b = blocoDoAbandono(COM_GRUPO, { answers: { nome: "Bruno" } }, null)
    expect(b?.ref).toBe("nome")
  })

  it("o progresso do grupo é um passo, não três", () => {
    const p = calcularProgresso(COM_GRUPO, "nome", { answers: {} })
    expect(p.indice).toBe(1)
    expect(p.total).toBe(3)
  })
})
