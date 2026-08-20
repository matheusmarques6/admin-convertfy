import { describe, expect, it } from "vitest"

import { buildBlockContracts } from "./block-contract"

const campo = (over: Record<string, unknown> = {}) => ({
  key: "hero_headline",
  label: "Headline",
  type: "text_short",
  nature: "copy",
  max_len: 40,
  min_len: null,
  required: true,
  example: "Bem-vinda ao seu glow",
  guidance: "Tom acolhedor",
  source: "schema",
  ...over,
})

const bloco = (over: Record<string, unknown> = {}) => ({
  id: "b1",
  position: 3,
  block_type: "hero",
  label: "Hero",
  fields: [campo()],
  ...over,
})

describe("buildBlockContracts", () => {
  it("indexa os campos pela key e mantém a ordem do schema", () => {
    const [c] = buildBlockContracts([
      bloco({ fields: [campo(), campo({ key: "hero_cta_2_label" })] }),
    ])
    expect(Object.keys(c.campos)).toEqual(["hero_headline", "hero_cta_2_label"])
    expect(c.block_id).toBe("b1")
    expect(c.position).toBe(3)
    expect(c.tipo).toBe("hero")
  })

  it("o campo leva só o que interessa a quem formata — o example é a âncora", () => {
    const [c] = buildBlockContracts([bloco()])
    expect(c.campos.hero_headline).toEqual({
      label: "Headline",
      tipo: "text_short",
      natureza: "copy",
      max_caracteres: 40,
      exemplo_ancora: "Bem-vinda ao seu glow",
    })
    const item = c.campos.hero_headline as unknown as Record<string, unknown>
    expect(item.source).toBeUndefined()
    expect(item.required).toBeUndefined()
    expect(item.placeholder_no_html).toBeUndefined()
  })

  it("natureza ausente deriva do tipo", () => {
    const [c] = buildBlockContracts([
      bloco({
        fields: [
          campo({ key: "foto", type: "image", nature: undefined }),
          campo({ key: "texto", type: "text_long", nature: undefined }),
        ],
      }),
    ])
    expect(c.campos.foto.natureza).toBe("imagem_gerada")
    expect(c.campos.texto.natureza).toBe("copy")
  })

  it("bloco sem contrato fica FORA da lista", () => {
    // Mandar um bloco vazio é convite para o agente inventar o que fazer.
    expect(buildBlockContracts([bloco({ fields: [] })])).toEqual([])
    expect(buildBlockContracts([bloco({ fields: null })])).toEqual([])
  })

  it("campo sem key e key duplicada: descarta e mantém a primeira", () => {
    const [c] = buildBlockContracts([
      bloco({
        fields: [
          campo({ key: null }),
          campo(),
          campo({ label: "Sobrescrita" }),
        ],
      }),
    ])
    expect(Object.keys(c.campos)).toEqual(["hero_headline"])
    expect(c.campos.hero_headline.label).toBe("Headline")
  })

  it("max_len zerado vira null (0 = sem teto no snapshot)", () => {
    const [c] = buildBlockContracts([bloco({ fields: [campo({ max_len: 0 })] })])
    expect(c.campos.hero_headline.max_caracteres).toBeNull()
  })

  it("example vazio → exemplo_ancora null (campo sem âncora declarada)", () => {
    const [c] = buildBlockContracts([bloco({ fields: [campo({ example: "  " })] })])
    expect(c.campos.hero_headline.exemplo_ancora).toBeNull()
  })
})

describe("contexto incompleto não derruba a cadeia", () => {
  // O contrato é informação ADICIONAL. Um contexto sem blocos carregados
  // degrada para o comportamento anterior — nunca lança.
  it("blocos ausentes → contrato vazio, sem exceção", () => {
    expect(buildBlockContracts(undefined)).toEqual([])
    expect(buildBlockContracts(null)).toEqual([])
  })
})
