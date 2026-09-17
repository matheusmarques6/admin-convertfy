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
