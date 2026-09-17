import { describe, expect, it } from "vitest"
import { montarVersao } from "../publicar"
import type { CampoLegado } from "../schema"

const CAMPOS: CampoLegado[] = [
  { id: "a", field_type: "text", label: "Nome", position: 0, required: true },
  { id: "b", field_type: "radio", label: "Faturamento", position: 1, required: true, options: ["baixo", "alto"] },
  { id: "c", field_type: "email", label: "Email", position: 2, required: true },
]

const ANTERIOR = {
  version: 1,
  display_mode: "conversational",
  locale: "pt-BR",
  settings: { welcome: { title: "Bem-vindo" }, rotulo_avancar: "Seguir" },
  blocks: [
    { ref: "a", type: "text", label: "Nome (antigo)", alias: "nome" },
    {
      ref: "b",
      type: "radio",
      label: "Faturamento",
      logic: [{ logic: "or", goto: "ending:fora", conditions: [{ ref: "b", operator: "in", value: ["baixo"] }] }],
    },
    { ref: "c", type: "email", label: "Email" },
  ],
  endings: [
    { ref: "ok", title: "Recebemos, {{nome}}" },
    { ref: "fora", title: "Ainda não", disqualified: true },
  ],
}

describe("montarVersao", () => {
  it("a lógica, os finais e a tela de abertura SOBREVIVEM ao republicar", () => {
    const r = montarVersao(CAMPOS, ANTERIOR, { display_mode: "conversational", version: 2 })
    expect(r.schema.blocks.find((b) => b.ref === "b")?.logic).toHaveLength(1)
    expect(r.schema.endings?.map((e) => e.ref)).toEqual(["ok", "fora"])
    expect(r.schema.settings?.welcome?.title).toBe("Bem-vindo")
    expect(r.schema.settings?.rotulo_avancar).toBe("Seguir")
    expect(r.regras_descartadas).toEqual([])
  })

  it("o texto novo da pergunta vence o da versão antiga", () => {
    const r = montarVersao(CAMPOS, ANTERIOR, { display_mode: "conversational", version: 2 })
    expect(r.schema.blocks.find((b) => b.ref === "a")?.label).toBe("Nome")
  })

  it("o alias vem da versão — a tabela de campos não o tem, e {{nome}} quebraria", () => {
    const r = montarVersao(CAMPOS, ANTERIOR, { display_mode: "conversational", version: 2 })
    expect(r.schema.blocks.find((b) => b.ref === "a")?.alias).toBe("nome")
  })

  it("regra que aponta para campo apagado é DESCARTADA, não mantida", () => {
    const anterior = {
      ...ANTERIOR,
      blocks: [
        ANTERIOR.blocks[0],
        { ref: "b", type: "radio", label: "F", logic: [{ logic: "or", goto: "sumiu", conditions: [{ ref: "b", operator: "is_set" }] }] },
      ],
    }
    const r = montarVersao(CAMPOS, anterior, { display_mode: "conversational", version: 2 })
    expect(r.schema.blocks.find((b) => b.ref === "b")?.logic).toBeUndefined()
    expect(r.regras_descartadas).toEqual([{ ref: "b", goto: "sumiu" }])
  })

  it("regra para final que não existe mais também cai", () => {
    const anterior = { ...ANTERIOR, endings: [{ ref: "ok", title: "X" }] }
    const r = montarVersao(CAMPOS, anterior, { display_mode: "conversational", version: 2 })
    expect(r.regras_descartadas).toEqual([{ ref: "b", goto: "ending:fora" }])
  })

  it("campo novo entra sem lógica e é nomeado", () => {
    const comNovo = [...CAMPOS, { id: "d", field_type: "url", label: "Site", position: 3 }]
    const r = montarVersao(comNovo, ANTERIOR, { display_mode: "conversational", version: 2 })
    expect(r.novos).toEqual(["d"])
    expect(r.schema.blocks).toHaveLength(4)
  })

  it("campo apagado some do schema", () => {
    const semEmail = CAMPOS.filter((c) => c.id !== "c")
    const r = montarVersao(semEmail, ANTERIOR, { display_mode: "conversational", version: 2 })
    expect(r.schema.blocks.map((b) => b.ref)).toEqual(["a", "b"])
  })

  it("final que ninguém alcança vira aviso — e o PRIMEIRO nunca é órfão", () => {
    const semLogica = {
      ...ANTERIOR,
      blocks: ANTERIOR.blocks.map((b) => ({ ...b, logic: undefined })),
    }
    const r = montarVersao(CAMPOS, semLogica, { display_mode: "conversational", version: 2 })
    expect(r.finais_orfaos).toEqual(["fora"])
  })

  it("sem versão anterior, publica o que existe — sem inventar lógica", () => {
    const r = montarVersao(CAMPOS, null, { display_mode: "conversational", version: 1 })
    expect(r.schema.blocks).toHaveLength(3)
    expect(r.schema.blocks.every((b) => !b.logic)).toBe(true)
    expect(r.schema.endings).toEqual([])
    expect(r.novos).toHaveLength(3)
  })

  it("o modo vem do parâmetro, não da versão antiga — é o toggle da tela", () => {
    const r = montarVersao(CAMPOS, ANTERIOR, { display_mode: "classic", version: 2 })
    expect(r.schema.display_mode).toBe("classic")
  })
})

describe("o rascunho é a saída da própria montagem", () => {
  // O editor grava como rascunho exatamente o que `montarVersao` devolve
  // — "o rascunho é o que seria publicado". Isso só é seguro se montar de
  // novo sobre a própria saída não mudar nada: se mudasse, cada save
  // deslocaria o fluxo um pouco, e depois de alguns o que está na tela
  // deixaria de ser o que vai ao ar.
  const campos = [
    { id: "a", field_type: "radio", label: "Faixa", position: 0, options: ["baixa", "alta"] },
    { id: "b", field_type: "url", label: "Loja", position: 1 },
  ]
  const publicado = {
    version: 1,
    display_mode: "conversational",
    blocks: [
      {
        ref: "a",
        type: "radio",
        label: "Faixa",
        alias: "faixa",
        options: ["baixa", "alta"],
        logic: [
          { conditions: [{ ref: "a", operator: "equals", value: "baixa" }], logic: "and", goto: "ending:fora" },
        ],
      },
      { ref: "b", type: "url", label: "Loja" },
    ],
    endings: [
      { ref: "ok", title: "Obrigado" },
      { ref: "fora", title: "Fora", disqualified: true },
    ],
    settings: { welcome: { title: "Vamos?" }, mostrar_progresso: false },
  }

  const opts = { display_mode: "conversational" as const, version: 2 }

  it("montar sobre a própria saída não muda o fluxo", () => {
    const um = montarVersao(campos, publicado, opts)
    const dois = montarVersao(campos, um.schema, opts)
    expect(dois.schema).toEqual(um.schema)
    expect(dois.regras_descartadas).toEqual([])
  })

  it("preserva salto, alias, finais e tela de abertura", () => {
    const r = montarVersao(campos, publicado, opts)
    expect(r.schema.blocks[0].logic?.[0].goto).toBe("ending:fora")
    expect(r.schema.blocks[0].alias).toBe("faixa")
    expect(r.schema.endings?.map((e) => e.ref)).toEqual(["ok", "fora"])
    expect(r.schema.settings?.welcome?.title).toBe("Vamos?")
    expect(r.schema.settings?.mostrar_progresso).toBe(false)
  })

  it("rótulo editado no editor vence o do rascunho — a pergunta é da tabela", () => {
    const renomeado = [{ ...campos[0], label: "Quanto fatura?" }, campos[1]]
    const r = montarVersao(renomeado, publicado, opts)
    expect(r.schema.blocks[0].label).toBe("Quanto fatura?")
    expect(r.schema.blocks[0].logic?.[0].goto).toBe("ending:fora")
  })
})

describe("o agrupamento atravessa a publicação", () => {
  it("mesma_tela e titulo_da_tela vêm da versão anterior, como a lógica", () => {
    const campos = [
      { id: "f1", field_type: "text", label: "Nome", position: 0 },
      { id: "f2", field_type: "email", label: "Email", position: 1 },
    ]
    const anterior = {
      blocks: [
        { ref: "f1", type: "text", label: "Nome", titulo_da_tela: "Seus dados" },
        { ref: "f2", type: "email", label: "Email", mesma_tela: true },
      ],
    }
    const { schema } = montarVersao(campos, anterior, {
      display_mode: "conversational",
      version: 2,
    })
    expect(schema.blocks[0].titulo_da_tela).toBe("Seus dados")
    expect(schema.blocks[1].mesma_tela).toBe(true)
  })
})
