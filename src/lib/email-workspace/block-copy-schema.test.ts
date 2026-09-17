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

  it("o item não repete a key; o exemplo É o endereço (sem placeholder)", () => {
    const s = buildBlockCopySchema(hero, {})
    expect(s.campos.hero_headline).toEqual({
      label: "Headline",
      tipo: "text_short",
      obrigatorio: true,
      max_caracteres: 48,
      min_caracteres: null,
      exemplo: "Bem-vinda ao clube",
      orientacao: "Promessa central em 2ª pessoa",
    })
    expect("key" in s.campos.hero_headline).toBe(false)
    expect("placeholder_no_html" in s.campos.hero_headline).toBe(false)
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
      [{ key: "x", label: "  ", example: "", guidance: "   " }],
      { variantName: "  ", purpose: "" },
    )
    expect(s.campos.x.label).toBe("x")
    expect(s.campos.x.exemplo).toBeNull()
    expect(s.campos.x.orientacao).toBeNull()
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

describe("omitir, papel e requisitos (09/09)", () => {
  it("campo omitido pela arbitragem NÃO entra no schema; papel e requisitos entram quando existem", () => {
    const schema = buildBlockCopySchema(
      [
        { key: "headline_l1", type: "text_short", max_len: 40 },
        { key: "coupon_line", type: "text_short", max_len: 40, omitir: true },
        { key: "cta_label", type: "text_short", max_len: 20, required: true, omitir: true },
      ],
      { variantName: "hero 3", purpose: "p", papel: "Apresenta a marca", requisitos: { cupom: false, cta: false } },
    )
    expect(Object.keys(schema.campos)).toEqual(["headline_l1"])
    expect(schema.obrigatorios).toEqual([])
    expect(schema.total_campos).toBe(1)
    expect(schema.papel).toBe("Apresenta a marca")
    expect(schema.requisitos).toEqual({ cupom: false, cta: false })
  })
  it("sem papel/requisitos as chaves não aparecem (aditivo)", () => {
    const schema = buildBlockCopySchema([{ key: "a", type: "text_short" }], { variantName: null, purpose: null })
    expect("papel" in schema).toBe(false)
    expect("requisitos" in schema).toBe(false)
  })
})

describe("buildBlockCopySchema — Passo 13: o exemplo que promete o que a decisão nega", () => {
  const campo = { key: "cta_label", label: "CTA", type: "text_short", max_len: 24, example: "SHOP 10% OFF" }
  it("com incentivo negado, o exemplo sai e vira directive; a remoção fica registrada", () => {
    const s = buildBlockCopySchema([campo, { key: "headline", type: "text_short", example: "Welcome" }], {
      incentivo: { existe: false, codigo: null, valor: null },
      requisitos: { cupom: false, exige: ["falar de caimento"] },
    })
    expect(s.campos.cta_label.exemplo).toBeNull()
    expect(s.campos.cta_label.directive).toContain("Sem oferta")
    expect(s.campos.cta_label.directive).toContain("falar de caimento")
    expect(s.campos.headline.exemplo).toBe("Welcome")
    expect(s.exemplos_removidos).toHaveLength(1)
    expect(s.exemplos_removidos?.[0]).toMatchObject({ campo: "cta_label", exemplo: "SHOP 10% OFF" })
  })
  it("com incentivo de 10%, o exemplo de 10% fica; o de 15% sai", () => {
    const s = buildBlockCopySchema([campo, { key: "cta_2", type: "text_short", example: "SAVE 15% TODAY" }], {
      incentivo: { existe: true, codigo: "WELCOME10", valor: "10%" },
    })
    expect(s.campos.cta_label.exemplo).toBe("SHOP 10% OFF")
    expect(s.campos.cta_2.exemplo).toBeNull()
  })
  it("sem decisão nada muda (legado)", () => {
    const s = buildBlockCopySchema([campo], {})
    expect(s.campos.cta_label.exemplo).toBe("SHOP 10% OFF")
    expect(s.exemplos_removidos).toBeUndefined()
  })
})

// 17/09 — o redator recebia contrato (chave, limite, exemplo) e nenhuma
// linha sobre COMO escrever cada parte. A régua do papel é o piso; a
// orientação cadastrada na variante continua sendo o teto.
describe("orientação por papel de campo", () => {
  const campos = [
    { key: "hero_headline", label: "Headline", type: "text_short", max_len: 48, guidance: "Promessa central em 2ª pessoa" },
    { key: "hero_subhead", label: "Subhead", type: "text_short", max_len: 90, guidance: null },
    { key: "hero_cta_label", label: "Botão", type: "text_short", max_len: 20, guidance: "" },
    { key: "coupon_code", label: "Código", type: "text_short", max_len: 12, guidance: null },
    { key: "zzz_desconhecido", label: "?", type: "text_short", max_len: 30, guidance: null },
  ]

  it("a orientação cadastrada vence e não é concatenada", () => {
    const s = buildBlockCopySchema(campos, {})
    expect(s.campos.hero_headline.orientacao).toBe("Promessa central em 2ª pessoa")
  })

  it("campo sem orientação recebe a régua do papel", () => {
    const s = buildBlockCopySchema(campos, {})
    expect(s.campos.hero_subhead.orientacao).toMatch(/Completa a headline/)
    expect(s.campos.hero_cta_label.orientacao).toMatch(/2 a 4 palavras/)
  })

  it("campo que é dado, e chave que ninguém classifica, seguem sem orientação", () => {
    const s = buildBlockCopySchema(campos, {})
    expect(s.campos.coupon_code.orientacao).toBeNull()
    expect(s.campos.zzz_desconhecido.orientacao).toBeNull()
  })
})
