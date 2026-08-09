import { describe, expect, it } from "vitest"

import { buildBlockCopySchema } from "./block-copy-schema"

describe("buildBlockCopySchema", () => {
  const hero = [
    {
      key: "hero_headline",
      label: "Headline",
      type: "text_short",
      max_len: 48,
      min_len: null,
      required: true,
      example: "Bem-vinda ao clube",
      guidance: "Promessa central em 2ª pessoa",
      tag: "HERO_HEADLINE",
      source: "schema",
    },
    {
      key: "hero_cta_2_label",
      label: "Botão secundário",
      type: "text_short",
      max_len: 20,
      min_len: null,
      required: false,
      example: "Ver coleção",
      guidance: "",
      tag: "HERO_CTA_2_LABEL",
      source: "schema",
    },
  ]

  it("indexa os campos pela key e mantém a ordem do schema", () => {
    const s = buildBlockCopySchema(hero, {
      variantName: "welcome - hero section 9",
      purpose: "Abertura calorosa",
    })
    expect(Object.keys(s.campos)).toEqual(["hero_headline", "hero_cta_2_label"])
    expect(s.total_campos).toBe(2)
    expect(s.variante).toBe("welcome - hero section 9")
    expect(s.diretriz).toBe("Abertura calorosa")
  })

  it("o item não repete a key e traz o placeholder com chaves", () => {
    const s = buildBlockCopySchema(hero, {})
    expect(s.campos.hero_headline).toEqual({
      label: "Headline",
      tipo: "text_short",
      obrigatorio: true,
      max_caracteres: 48,
      min_caracteres: null,
      exemplo: "Bem-vinda ao clube",
      orientacao: "Promessa central em 2ª pessoa",
      placeholder_no_html: "{{HERO_HEADLINE}}",
    })
    expect("key" in s.campos.hero_headline).toBe(false)
  })

  it("lista os obrigatórios separadamente", () => {
    const s = buildBlockCopySchema(hero, {})
    expect(s.obrigatorios).toEqual(["hero_headline"])
  })

  it("não vaza campos internos do snapshot (nature, source, image_*)", () => {
    const s = buildBlockCopySchema(
      [{ ...hero[0], nature: "copy", image_spec: "1:1" } as never],
      {},
    )
    const item = s.campos.hero_headline as unknown as Record<string, unknown>
    expect(item.nature).toBeUndefined()
    expect(item.source).toBeUndefined()
    expect(item.image_spec).toBeUndefined()
  })

  it("campo sem key é descartado (não teria como voltar)", () => {
    const s = buildBlockCopySchema([{ label: "Órfão" }, hero[0]], {})
    expect(Object.keys(s.campos)).toEqual(["hero_headline"])
    expect(s.total_campos).toBe(1)
  })

  it("key duplicada mantém a primeira ocorrência", () => {
    const s = buildBlockCopySchema(
      [hero[0], { ...hero[0], label: "Sobrescrita", required: false }],
      {},
    )
    expect(s.campos.hero_headline.label).toBe("Headline")
    expect(s.obrigatorios).toEqual(["hero_headline"])
  })

  it("normaliza vazio para null em vez de string em branco", () => {
    const s = buildBlockCopySchema(
      [{ key: "x", label: "  ", example: "", guidance: "   ", tag: null }],
      { variantName: "  ", purpose: "" },
    )
    expect(s.campos.x.label).toBe("x")
    expect(s.campos.x.exemplo).toBeNull()
    expect(s.campos.x.orientacao).toBeNull()
    expect(s.campos.x.placeholder_no_html).toBeNull()
    expect(s.variante).toBeNull()
    expect(s.diretriz).toBeNull()
  })

  it("max/min inválidos ou zerados viram null", () => {
    const s = buildBlockCopySchema(
      [{ key: "x", max_len: 0, min_len: Number.NaN }],
      {},
    )
    expect(s.campos.x.max_caracteres).toBeNull()
    expect(s.campos.x.min_caracteres).toBeNull()
  })

  it("bloco sem campos de copy devolve schema vazio (o dispatch omite)", () => {
    const s = buildBlockCopySchema([], { variantName: "coupon" })
    expect(s.total_campos).toBe(0)
    expect(s.campos).toEqual({})
  })
})
