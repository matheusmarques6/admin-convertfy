import { describe, it, expect } from "vitest"
import { buildImageSlots } from "./build-image-slots"
import type { BlueprintBlockField } from "@/types/email-generation"

function f(p: Partial<BlueprintBlockField>): BlueprintBlockField {
  return {
    key: "x",
    label: "X",
    type: "text_short",
    max_len: 40,
    min_len: null,
    required: false,
    example: "",
    guidance: "",
    source: "schema",
    ...p,
  }
}

describe("buildImageSlots", () => {
  it("bloco sem campo de imagem → string vazia", () => {
    expect(buildImageSlots([f({ key: "headline" })], {})).toBe("")
    expect(buildImageSlots(null, null)).toBe("")
  })

  it("T8: asset_fixo NÃO vira slot (arte da biblioteca fica intacta)", () => {
    const fields = [
      f({ key: "hero_image", type: "image" }),
      f({
        key: "selo_qualidade",
        type: "image",
        nature: "asset_fixo",
      }),
    ]
    const out = buildImageSlots(fields, {})
    expect(out).toContain('<slot_imagem tag="HERO_IMAGE">')
    expect(out).not.toContain("SELO_QUALIDADE")
    // bloco SÓ com asset_fixo → sem slots (não cai no brief legado com arte)
    expect(
      buildImageSlots(
        [f({ key: "selo", type: "image", nature: "asset_fixo" })],
        {},
      ),
    ).toBe("")
  })

  it("hero: schema + formato por dims + slot_note + áreas do grupo (prefixo hero)", () => {
    const fields = [
      f({ key: "hero_headline", type: "text_short" }),
      f({ key: "hero_body", type: "text_long" }),
      f({
        key: "hero_image",
        type: "image",
        image_spec: "pessoa aplicando o sérum",
        example: "close no rosto",
        image_width: 600,
        image_height: 700,
        slot_note: "luz natural difusa",
      }),
    ]
    const content = {
      hero_headline: "Bem-vinda ao seu glow",
      hero_body: "Sua rotina começa aqui.",
    }
    const out = buildImageSlots(fields, content)
    expect(out).toContain('<slot_imagem tag="HERO_IMAGE">')
    expect(out).toContain("campo: hero_image")
    expect(out).toContain("especificidade: pessoa aplicando o sérum")
    expect(out).toContain("exemplo: close no rosto")
    expect(out).toContain("formato: 600x700px · proporção 6:7")
    expect(out).toContain("comentario: luz natural difusa")
    expect(out).toContain("areas_de_texto")
    // A FORMA da área, nunca a frase.
    expect(out).toContain("- hero_headline: linha de texto, ~21 caracteres")
    expect(out).toContain("- hero_body: parágrafo, ~23 caracteres")
    expect(out).not.toContain("Bem-vinda ao seu glow")
    expect(out).not.toContain("Sua rotina começa aqui.")
  })

  it("multi-imagem: cada slot pega só a copy do SEU grupo (product_1 vs product_2)", () => {
    const fields = [
      f({ key: "product_1_name", type: "text_short" }),
      f({ key: "product_1_cta", type: "text_short" }),
      f({ key: "product_1_image", type: "image" }),
      f({ key: "product_2_name", type: "text_short" }),
      f({ key: "product_2_image", type: "image" }),
    ]
    const content = {
      product_1_name: "Sérum",
      product_1_cta: "Comprar",
      product_2_name: "Creme",
    }
    const out = buildImageSlots(fields, content)
    const s1 = out.slice(out.indexOf("PRODUCT_1_IMAGE"), out.indexOf("PRODUCT_2_IMAGE"))
    const s2 = out.slice(out.indexOf("PRODUCT_2_IMAGE"))
    expect(s1).toContain("- product_1_name: linha de texto, ~5 caracteres")
    // `_cta` no key → o modelo sabe que ali vai um botão, não uma frase.
    expect(s1).toContain("- product_1_cta: rótulo de botão, ~7 caracteres")
    expect(s1).not.toContain("product_2")
    expect(s2).toContain("- product_2_name: linha de texto, ~5 caracteres")
    expect(s2).not.toContain("product_1")
  })

  it("especificidade cai no guidance quando image_spec vazio; formato usa image_aspect livre", () => {
    const out = buildImageSlots(
      [
        f({
          key: "bg_image",
          type: "image",
          guidance: "textura suave",
          image_aspect: "16:9",
        }),
      ],
      {},
    )
    expect(out).toContain("especificidade: textura suave")
    expect(out).toContain("formato: proporção 16:9")
  })

  it("prefixo vazio (key 'image') → todos os campos de copy do bloco", () => {
    const fields = [
      f({ key: "headline", type: "text_short" }),
      f({ key: "image", type: "image" }),
    ]
    const out = buildImageSlots(fields, { headline: "Olá" })
    expect(out).toContain("- headline: linha de texto, ~3 caracteres")
  })

  it("campos de copy vazios são omitidos; sem grupo não imprime areas_de_texto", () => {
    const out = buildImageSlots(
      [
        f({ key: "hero_headline", type: "text_short" }),
        f({ key: "hero_image", type: "image" }),
      ],
      { hero_headline: "  " },
    )
    expect(out).not.toContain("areas_de_texto")
  })

  // A INVARIANTE deste módulo desde 01/09: o prompt do gerador de imagem não
  // carrega uma única frase da copy. A regra "não escreva texto" já estava
  // no prompt três vezes e o modelo desenhou a headline, os selos e o cupom
  // assim mesmo — o que muda o resultado é não mandar o material.
  it("nenhum valor do content aparece na saída", () => {
    const fields = [
      f({ key: "headline", type: "text_short" }),
      f({ key: "body", type: "text_long" }),
      f({ key: "ps_line", type: "text_short" }),
      f({ key: "image", type: "image", image_spec: "loja iluminada" }),
    ]
    const content = {
      headline: "STOP WASTING, START SAVING ENERGY AND MONEY",
      body: "Fair question — and the most common one we get.",
      ps_line: "P.S. Discount code INNOVA10 expires August 31st.",
    }
    const out = buildImageSlots(fields, content)

    for (const valor of Object.values(content)) {
      expect(out).not.toContain(valor)
      // Nem em pedaços: uma palavra distintiva já basta para o modelo
      // desenhar. "INNOVA10" foi o cupom que saiu carimbado na arte.
      for (const palavra of valor.split(/\s+/).filter((w) => w.length > 5)) {
        expect(out).not.toContain(palavra)
      }
    }
    // O que SOBRA é a direção de arte e a forma das áreas.
    expect(out).toContain("especificidade: loja iluminada")
    expect(out).toContain("- headline: linha de texto, ~43 caracteres")
    expect(out).toContain("- ps_line: linha de texto")
  })

  it("fieldKey: só a seção do alvo, com os irmãos em outras_imagens_deste_bloco (hero 5)", () => {
    const fields = [
      f({ key: "headline_l1", type: "text_short" }),
      f({
        key: "hero_lifestyle_consumo",
        type: "image",
        image_spec:
          "Proporção: 1:1. Slot de 598 × 632px.\nIdeia: pessoa em cena de consumo real, meio corpo, com o produto grande e nítido nas mãos. Ambiente reconhecível.",
      }),
      f({
        key: "main_image_rounded",
        type: "image",
        image_spec:
          "Proporção: 1:1. Slot de 534 × 534px.\nIdeia: produto ou cena secundária em enquadramento quadrado, com o mesmo tratamento de cor da foto principal. Serve como fecho visual.",
      }),
      f({ key: "selo", type: "image", nature: "asset_fixo" }),
    ]
    const out = buildImageSlots(fields, { headline_l1: "Welcome to" }, {
      fieldKey: "main_image_rounded",
    })
    expect(out).toContain('<slot_imagem tag="MAIN_IMAGE_ROUNDED">')
    expect(out).not.toContain('<slot_imagem tag="HERO_LIFESTYLE_CONSUMO">')
    expect(out).toContain("outras_imagens_deste_bloco")
    expect(out).toContain(
      "- hero_lifestyle_consumo: pessoa em cena de consumo real, meio corpo, com o produto grande e nítido nas mãos.",
    )
    // asset_fixo não é "outra imagem" (não é gerada)
    expect(out).not.toContain("- selo")
    // sem fieldKey: todas as seções, sem a lista de irmãos
    const todos = buildImageSlots(fields, {})
    expect(todos).toContain('<slot_imagem tag="HERO_LIFESTYLE_CONSUMO">')
    expect(todos).toContain('<slot_imagem tag="MAIN_IMAGE_ROUNDED">')
    expect(todos).not.toContain("outras_imagens_deste_bloco")
    // fieldKey inexistente → vazio (o caller cai no brief legado)
    expect(buildImageSlots(fields, {}, { fieldKey: "nada" })).toBe("")
  })
})
