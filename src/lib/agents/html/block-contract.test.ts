import { describe, expect, it } from "vitest"

import {
  buildBlockContracts,
  contractTags,
  isPlatformTag,
  measureOpsAgainstContract,
} from "./block-contract"

const campo = (over: Record<string, unknown> = {}) => ({
  key: "hero_headline",
  label: "Headline",
  type: "text_short",
  nature: "copy",
  max_len: 40,
  min_len: null,
  required: true,
  example: "Bem-vinda",
  guidance: "Tom acolhedor",
  tag: "HERO_HEADLINE",
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
      bloco({ fields: [campo(), campo({ key: "hero_cta_2_label", tag: "HERO_CTA_2_LABEL" })] }),
    ])
    expect(Object.keys(c.campos)).toEqual(["hero_headline", "hero_cta_2_label"])
    expect(c.block_id).toBe("b1")
    expect(c.position).toBe(3)
    expect(c.tipo).toBe("hero")
  })

  it("o campo leva só o que interessa a quem formata", () => {
    const [c] = buildBlockContracts([bloco()])
    expect(c.campos.hero_headline).toEqual({
      label: "Headline",
      tipo: "text_short",
      natureza: "copy",
      max_caracteres: 40,
      placeholder_no_html: "{{HERO_HEADLINE}}",
    })
    const item = c.campos.hero_headline as unknown as Record<string, unknown>
    expect(item.source).toBeUndefined()
    expect(item.required).toBeUndefined()
    expect(item.example).toBeUndefined()
  })

  it("natureza ausente deriva do tipo", () => {
    const [c] = buildBlockContracts([
      bloco({
        fields: [
          campo({ key: "foto", type: "image", tag: "HERO_IMAGE", nature: undefined }),
          campo({ key: "texto", type: "text_long", tag: "BODY", nature: undefined }),
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
})

describe("contractTags", () => {
  it("junta as tags de todos os blocos, ignorando campo sem tag", () => {
    const tags = contractTags([
      bloco(),
      bloco({ id: "b2", fields: [campo({ key: "orfao", tag: null })] }),
      bloco({ id: "b3", fields: [campo({ key: "x", tag: "REVIEW_1_TEXT" })] }),
    ])
    expect([...tags].sort()).toEqual(["HERO_HEADLINE", "REVIEW_1_TEXT"])
  })
})

describe("isPlatformTag", () => {
  it("logo e preheader são da plataforma", () => {
    expect(isPlatformTag("LOGO")).toBe(true)
    expect(isPlatformTag("PREHEADER")).toBe(true)
  })
  it("campo de copy não é", () => {
    expect(isPlatformTag("HERO_HEADLINE")).toBe(false)
  })
})

describe("measureOpsAgainstContract", () => {
  const tags = new Set(["HERO_HEADLINE", "HERO_CTA_2_LABEL"])

  it("conta dentro, fora e plataforma separadamente", () => {
    const r = measureOpsAgainstContract(
      [
        { action: "set_text", tag: "HERO_HEADLINE", block_id: "b1" },
        { action: "set_text", tag: "HERO_CTA_2_LABEL", block_id: "b1" },
        { action: "img", tag: "LOGO" },
        { action: "set_text", tag: "TAG_INVENTADA", block_id: "b9" },
      ],
      tags,
    )
    expect(r.total).toBe(4)
    expect(r.com_tag).toBe(4)
    expect(r.no_contrato).toBe(2)
    expect(r.plataforma).toBe(1)
    expect(r.taxa_pct).toBe(67) // 2 de 3 — plataforma fica fora da conta
    expect(r.fora).toEqual([
      { action: "set_text", tag: "TAG_INVENTADA", block_id: "b9" },
    ])
  })

  it("op sem tag (replace/recolor) não entra na medida", () => {
    // Sem isto o color_format, que emite recolor global, apareceria como
    // 100% fora do contrato — e o número perderia o sentido.
    const r = measureOpsAgainstContract(
      [
        { action: "recolor" },
        { action: "replace" },
        { action: "set_text", tag: "HERO_HEADLINE" },
      ],
      tags,
    )
    expect(r.total).toBe(3)
    expect(r.com_tag).toBe(1)
    expect(r.taxa_pct).toBe(100)
  })

  it("nada mensurável → taxa null, não 0", () => {
    // 0% diria "o agente errou tudo"; null diz "não havia o que medir".
    const r = measureOpsAgainstContract([{ action: "recolor" }], tags)
    expect(r.taxa_pct).toBeNull()
    expect(r.fora).toEqual([])
  })

  it("só tags de plataforma → taxa null", () => {
    const r = measureOpsAgainstContract([{ action: "img", tag: "LOGO" }], tags)
    expect(r.plataforma).toBe(1)
    expect(r.taxa_pct).toBeNull()
  })

  it("a amostra de `fora` tem teto, mas a contagem não", () => {
    const ops = Array.from({ length: 30 }, (_, i) => ({
      action: "set_text",
      tag: `INVENTADA_${i}`,
    }))
    const r = measureOpsAgainstContract(ops, tags, 5)
    expect(r.com_tag).toBe(30)
    expect(r.taxa_pct).toBe(0)
    expect(r.fora).toHaveLength(5)
  })
})

describe("contexto incompleto não derruba a cadeia", () => {
  // O contrato é informação ADICIONAL para os formatadores. Um contexto
  // sem blocos carregados degrada para o comportamento anterior — nunca
  // lança (uma exceção aqui mataria a formatação inteira do email).
  it("blocos ausentes → contrato vazio, sem exceção", () => {
    expect(buildBlockContracts(undefined)).toEqual([])
    expect(buildBlockContracts(null)).toEqual([])
    expect([...contractTags(undefined)]).toEqual([])
  })

  it("ops ausentes → relatório zerado, sem exceção", () => {
    const r = measureOpsAgainstContract(undefined, new Set(["X"]))
    expect(r.total).toBe(0)
    expect(r.taxa_pct).toBeNull()
  })
})
