import { describe, expect, it } from "vitest"
import { camposDoSchema, normalizarOpcoes, normalizarSchema, schemaDeCampos } from "../schema"

/** As 6 linhas reais do "Pagina de vendas", como o banco as guarda. */
const CAMPOS_REAIS = [
  { id: "a1", field_type: "text", label: "Nome", required: true, position: 0, map_to_lead_field: "name" },
  { id: "a2", field_type: "email", label: "Email", required: true, position: 1, map_to_lead_field: "email" },
  { id: "a3", field_type: "phone", label: "WhatsApp", required: true, position: 2, validation: { countryCode: true } },
  {
    id: "b645918f-83cd-42a6-8025-3053261a4506",
    field_type: "select",
    label: "Qual sua média de faturamento mensal?",
    required: true,
    position: 3,
    options: ["R$0 - R$99.000", "R$100.000 - R$300.000"],
  },
  { id: "a5", field_type: "url", label: "Site", required: false, position: 4 },
  { id: "a6", field_type: "textarea", label: "Desafio", required: false, position: 5 },
]

describe("schemaDeCampos", () => {
  it("o ref é o id do campo — a regra do evento qualificado depende disso", () => {
    const s = schemaDeCampos(CAMPOS_REAIS)
    const faixa = s.blocks.find((b) => b.label.startsWith("Qual sua média"))
    expect(faixa?.ref).toBe("b645918f-83cd-42a6-8025-3053261a4506")
  })

  it("respeita a posição, não a ordem do array", () => {
    const fora = [CAMPOS_REAIS[3], CAMPOS_REAIS[0], CAMPOS_REAIS[1]]
    expect(schemaDeCampos(fora).blocks.map((b) => b.label)).toEqual([
      "Nome",
      "Email",
      "Qual sua média de faturamento mensal?",
    ])
  })

  it("nasce clássico — publicar não pode mudar o modo por acidente", () => {
    expect(schemaDeCampos(CAMPOS_REAIS).display_mode).toBe("classic")
  })
})

describe("normalizarOpcoes", () => {
  it("a opção-string mantém o TEXTO como value — mudá-lo quebraria a regra", () => {
    expect(normalizarOpcoes(["R$100.000 - R$300.000"])).toEqual([
      { label: "R$100.000 - R$300.000", value: "R$100.000 - R$300.000" },
    ])
  })

  it("aceita o formato objeto e descarta lixo", () => {
    expect(normalizarOpcoes([{ label: "Sim", value: "s" }, null, 42, { value: "x" }])).toEqual([
      { label: "Sim", value: "s" },
      { label: "x", value: "x" },
    ])
  })

  it("não é array vira lista vazia, sem lançar", () => {
    expect(normalizarOpcoes(null)).toEqual([])
    expect(normalizarOpcoes("a,b")).toEqual([])
  })
})

describe("normalizarSchema", () => {
  it("lê `fields` (o backfill da migration) e `blocks` (o editor)", () => {
    const backfill = { version: 1, fields: [{ field_id: "x", type: "email", label: "Email" }] }
    expect(normalizarSchema(backfill).blocks[0]).toMatchObject({ ref: "x", type: "email" })
    const editor = { version: 2, blocks: [{ ref: "y", type: "text", label: "Nome" }] }
    expect(normalizarSchema(editor).blocks[0]).toMatchObject({ ref: "y", type: "text" })
  })

  it("JSONB ilegível vira schema vazio em vez de derrubar a página", () => {
    for (const lixo of [null, undefined, {}, "texto", 42, []]) {
      const s = normalizarSchema(lixo)
      expect(s.blocks).toEqual([])
      expect(s.display_mode).toBe("classic")
    }
  })

  it("tipo desconhecido vira texto — o campo perde a máscara, não some", () => {
    const s = normalizarSchema({ blocks: [{ ref: "a", type: "assinatura", label: "Assine" }] })
    expect(s.blocks).toHaveLength(1)
    expect(s.blocks[0].type).toBe("text")
  })

  it("bloco sem ref é descartado — sem endereço ele não navega nem grava", () => {
    const s = normalizarSchema({ blocks: [{ type: "text", label: "Órfão" }, { ref: "ok", type: "text", label: "A" }] })
    expect(s.blocks.map((b) => b.ref)).toEqual(["ok"])
  })

  it("`field_type: hidden` do editor clássico vira bloco oculto", () => {
    const s = normalizarSchema({ blocks: [{ ref: "u", field_type: "hidden", label: "utm" }] })
    expect(s.blocks[0].hidden).toBe(true)
  })

  it("regra com operador inválido perde a condição, não a regra inteira", () => {
    const s = normalizarSchema({
      blocks: [
        {
          ref: "a",
          type: "radio",
          label: "A",
          logic: [
            {
              goto: "b",
              logic: "or",
              conditions: [{ ref: "a", operator: "inventado", value: "x" }, { ref: "a", operator: "in", value: ["y"] }],
            },
          ],
        },
      ],
    })
    expect(s.blocks[0].logic?.[0].conditions).toEqual([{ ref: "a", operator: "in", value: ["y"] }])
  })

  it("regra sem goto é descartada — salto sem destino não é salto", () => {
    const s = normalizarSchema({
      blocks: [{ ref: "a", type: "text", label: "A", logic: [{ logic: "and", conditions: [] }] }],
    })
    expect(s.blocks[0].logic).toBeUndefined()
  })

  it("progresso e Enter vêm ligados por padrão", () => {
    const s = normalizarSchema({})
    expect(s.settings?.mostrar_progresso).toBe(true)
    expect(s.settings?.enter_avanca).toBe(true)
  })

  it("welcome sem título não vira tela de abertura em branco", () => {
    expect(normalizarSchema({ settings: { welcome: { description: "só isso" } } }).settings?.welcome)
      .toBeUndefined()
  })
})

describe("camposDoSchema", () => {
  it("ida e volta preserva id, tipo, ordem e mapeamento", () => {
    const volta = camposDoSchema(schemaDeCampos(CAMPOS_REAIS))
    expect(volta.map((c) => c.id)).toEqual(CAMPOS_REAIS.map((c) => c.id))
    expect(volta.map((c) => c.field_type)).toEqual(CAMPOS_REAIS.map((c) => c.field_type))
    expect(volta[0].map_to_lead_field).toBe("name")
    expect(volta[3].options).toEqual(["R$0 - R$99.000", "R$100.000 - R$300.000"])
  })

  it("`statement` não atravessa para o clássico — lá seria campo vazio", () => {
    const s = normalizarSchema({
      blocks: [
        { ref: "s", type: "statement", label: "Falta pouco!" },
        { ref: "e", type: "email", label: "Email" },
      ],
    })
    expect(camposDoSchema(s).map((c) => c.id)).toEqual(["e"])
  })
})
