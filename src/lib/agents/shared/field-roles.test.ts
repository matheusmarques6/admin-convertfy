import { describe, expect, it } from "vitest"
import { conflitoDeContrato, filtrarPorRequisitos, papelDoCampo, resumirContrato } from "./field-roles"

// Schemas REAIS da biblioteca (09/09) — só as chaves importam aqui.
const campos = (s: string) =>
  s.split(" ").map((tok) => {
    const [key, type] = tok.split(":")
    return { key, type: type ?? "text_short", max_len: 60, required: false, example: "", guidance: "", label: key }
  })

const HERO_3 = campos(
  "welcome_eyebrow logo headline_l1 headline_l2 coupon_line cta_label hero_flatlay_kit:image",
)
const HERO_9 = campos("hero_headline hero_copy cta_primary_label cta_secondary_label hero_gesto_uso:image brand_logo:image")
const PRODUTOS_9 = campos(
  "section_title section_subtitle product_1_name product_2_name product_3_name product_4_name product_cta_label_1 product_cta_label_2 product_cta_label_3 product_cta_label_4 product_1_photo:image product_2_photo:image product_3_photo:image product_4_photo:image",
)
const PRODUTOS_4 = campos(
  "section_title section_copy_1 section_copy_2 product_name price_old price_new badge_label badge_deadline cta_label product_kit_grid:image",
)
const REVIEW_2 = campos(
  "reviews_headline review_1_title review_1_body review_1_name review_1_credential review_2_title review_2_body review_2_name review_2_credential reviews_cta_label review_1_portrait:image review_2_portrait:image",
)
const BODY_4 = campos(
  "section_title column_a_title column_a_item_1 column_a_item_2 column_b_title column_b_item_1 column_b_item_2 column_b_item_6 closing_copy cta_label column_a_top:image",
)
const OFFER_3 = campos("coupon_intro coupon_code coupon_connector coupon_value coupon_scope coupon_cta_label coupon_background_image:image")

describe("papelDoCampo", () => {
  it("cupom, cta, preço, avaliação pela chave", () => {
    expect(papelDoCampo("coupon_line").cupom).toBe(true)
    expect(papelDoCampo("cart_coupon_code").cupom).toBe(true)
    expect(papelDoCampo("cta_label").cta).toBe(true)
    expect(papelDoCampo("product_cta_label_2").cta).toBe(true)
    expect(papelDoCampo("price_new").preco).toBe(true)
    expect(papelDoCampo("verified_badge").avaliacao).toBe(true)
    // "code" só como token inteiro: `decode_title` não é cupom.
    expect(papelDoCampo("decode_title").cupom).toBe(false)
  })
  it("famílias numeradas — e linhas/botões numerados NÃO são item", () => {
    expect(papelDoCampo("product_3_name")).toMatchObject({ familia: "product", indice: 3 })
    expect(papelDoCampo("product_cta_label_4")).toMatchObject({ familia: "product", indice: 4 })
    expect(papelDoCampo("panel_2_title")).toMatchObject({ familia: "product", indice: 2 })
    expect(papelDoCampo("review_1_credential")).toMatchObject({ familia: "review", indice: 1, credencial: true })
    expect(papelDoCampo("testimonial_3_author")).toMatchObject({ familia: "review", indice: 3, nome: true })
    expect(papelDoCampo("column_b_item_6")).toMatchObject({ familia: "item", indice: 6 })
    expect(papelDoCampo("seal_2_image")).toMatchObject({ familia: "feature", indice: 2 })
    expect(papelDoCampo("headline_l2").familia).toBeNull()
    expect(papelDoCampo("cta_2_label").familia).toBeNull()
    expect(papelDoCampo("section_copy_2").familia).toBeNull()
  })
})

describe("resumirContrato", () => {
  it("hero-3 TEM cupom e CTA (o caso da Hero Boxers); hero-9 não tem cupom", () => {
    const c = resumirContrato(HERO_3)
    expect(c).toMatchObject({ tem_cupom: true, tem_cta: true, n_itens: null, copy: 6, imagens: 1 })
    expect(resumirContrato(HERO_9)).toMatchObject({ tem_cupom: false, tem_cta: true })
  })
  it("grade de produtos conta os itens; produto único mostra preço", () => {
    expect(resumirContrato(PRODUTOS_9)).toMatchObject({ n_itens: 4, itens: { product: 4 }, tem_preco: false })
    expect(resumirContrato(PRODUTOS_4)).toMatchObject({ n_itens: null, tem_preco: true })
  })
  it("reviews com credencial; colunas comparativas contam item", () => {
    expect(resumirContrato(REVIEW_2)).toMatchObject({ itens: { review: 2 }, tem_credencial: true, tem_cta: true })
    expect(resumirContrato(BODY_4)).toMatchObject({ itens: { item: 6 }, n_itens: 6 })
  })
  it("imagem de fundo do cupom não obriga a escrever código — mas o slot de copy sim", () => {
    const c = resumirContrato(OFFER_3)
    expect(c.tem_cupom).toBe(true)
    expect(resumirContrato(campos("offer_title coupon_background_image:image")).tem_cupom).toBe(false)
  })
  it("schema inválido → contrato vazio; required:true entra em campos_obrigatorios", () => {
    expect(resumirContrato(null)).toMatchObject({ copy: 0, imagens: 0, n_itens: null })
    const c = resumirContrato([{ key: "coupon_line", required: true }, { key: "x" }])
    expect(c.campos_obrigatorios).toEqual(["coupon_line"])
  })
})

describe("conflitoDeContrato + filtrarPorRequisitos", () => {
  const H3 = { variant_id: "h3", contrato: resumirContrato(HERO_3) }
  const H9 = { variant_id: "h9", contrato: resumirContrato(HERO_9) }
  it("decisão sem cupom elimina a hero com slot de cupom", () => {
    expect(conflitoDeContrato(H3.contrato, { cupom: false })).toContain("cupom")
    expect(conflitoDeContrato(H9.contrato, { cupom: false })).toBeNull()
    const r = filtrarPorRequisitos([H3, H9], { cupom: false })
    expect(r.elegiveis.map((v) => v.variant_id)).toEqual(["h9"])
    expect(r.eliminadas[0]).toMatchObject({ variant_id: "h3" })
    expect(r.zerou).toBe(false)
  })
  it("grade acima do máximo pedido é eliminada; sem requisito, nada é", () => {
    const P9 = { variant_id: "p9", contrato: resumirContrato(PRODUTOS_9) }
    expect(conflitoDeContrato(P9.contrato, { n_itens: { max: 3 } })).toContain("no máximo 3")
    expect(conflitoDeContrato(P9.contrato, null)).toBeNull()
    expect(filtrarPorRequisitos([P9], undefined).eliminadas).toEqual([])
  })
  it("FAIL-OPEN: filtro que zera a seção devolve todas e declara", () => {
    const r = filtrarPorRequisitos([H3], { cupom: false })
    expect(r.elegiveis).toHaveLength(1)
    expect(r.zerou).toBe(true)
    expect(r.eliminadas).toHaveLength(1)
  })
  it("candidata sem contrato nunca é eliminada", () => {
    const r = filtrarPorRequisitos([{ variant_id: "x" }], { cupom: false })
    expect(r.elegiveis).toHaveLength(1)
  })
})
