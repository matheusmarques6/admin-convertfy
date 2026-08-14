import { describe, it, expect } from "vitest"
import {
  duplicateField,
  mergeSchemas,
  nextIndexedKey,
} from "./schema-duplicate"
import type { ComponentOutputField } from "@/types/email-generation"

const f = (
  key: string,
  extra: Partial<ComponentOutputField> = {},
): ComponentOutputField =>
  ({
    key,
    label: key,
    type: "text_short",
    max_len: 60,
    required: false,
    example: "",
    guidance: "",
    ...extra,
  }) as ComponentOutputField

describe("nextIndexedKey", () => {
  it("incrementa o ÚLTIMO número, não o primeiro", () => {
    // Duplicar uma miniatura é somar miniatura, não somar produto.
    expect(nextIndexedKey("product_1_thumb_2", [])).toBe("product_1_thumb_3")
  })

  it("key com um número só incrementa esse", () => {
    expect(nextIndexedKey("product_1_name", [])).toBe("product_2_name")
  })

  it("key sem número ganha _2", () => {
    expect(nextIndexedKey("section_headline", [])).toBe("section_headline_2")
  })

  it("pula as keys ocupadas — duplicar duas vezes não colide", () => {
    const taken = ["product_2_name", "product_3_name"]
    expect(nextIndexedKey("product_1_name", taken)).toBe("product_4_name")
  })

  it("ignora diferença de caixa ao checar ocupação", () => {
    expect(nextIndexedKey("item_1", ["ITEM_2"])).toBe("item_3")
  })

  it("key vazia vira novo_campo", () => {
    expect(nextIndexedKey("  ", [])).toBe("novo_campo")
  })
})

describe("duplicateField", () => {
  it("preserva tipo, limite, natureza e briefing de imagem", () => {
    const orig = f("product_1_image", {
      type: "image",
      nature: "imagem_gerada",
      max_len: 0,
      image_spec: "produto em fundo claro",
      image_width: 600,
      image_height: 600,
      example: "https://cdn.loja.com/rose.png",
    })
    const copia = duplicateField(orig, ["product_1_image"])
    expect(copia.key).toBe("product_2_image")
    expect(copia.type).toBe("image")
    expect(copia.nature).toBe("imagem_gerada")
    expect(copia.image_spec).toBe("produto em fundo claro")
    expect(copia.image_width).toBe(600)
    // O exemplo é o modelo que o curador vai ajustar — apagá-lo tiraria a
    // referência justamente de quem está preenchendo em série.
    expect(copia.example).toBe("https://cdn.loja.com/rose.png")
  })

  it("o rótulo acompanha o número da key", () => {
    const c = duplicateField(f("product_1_name", { label: "Produto 1" }), [])
    expect(c.label).toBe("Produto 2")
  })

  it("rótulo sem número ganha o índice novo", () => {
    const c = duplicateField(f("product_1_name", { label: "Nome" }), [])
    expect(c.label).toBe("Nome 2")
  })
})

describe("mergeSchemas", () => {
  it("traz o que falta e diz o que trouxe", () => {
    const r = mergeSchemas([f("body_title")], [f("body_text"), f("body_cta_label")])
    expect(r.schema.map((x) => x.key)).toEqual([
      "body_title",
      "body_text",
      "body_cta_label",
    ])
    expect(r.added).toEqual(["body_text", "body_cta_label"])
    expect(r.skipped).toEqual([])
  })

  it("NÃO sobrescreve campo que já existe no destino", () => {
    // O campo do destino pode já estar ancorado no HTML; trocá-lo pelo da
    // origem derrubaria a âncora sem avisar.
    const destino = [f("body_title", { max_len: 30, example: "meu titulo" })]
    const r = mergeSchemas(destino, [f("body_title", { max_len: 999 })])
    expect(r.schema).toHaveLength(1)
    expect(r.schema[0].max_len).toBe(30)
    expect(r.schema[0].example).toBe("meu titulo")
    expect(r.skipped).toEqual(["body_title"])
  })

  it("descarta campo sem key — não tem endereço", () => {
    const r = mergeSchemas([], [f(""), f("body_text")])
    expect(r.schema.map((x) => x.key)).toEqual(["body_text"])
  })

  it("saneia a key vinda da origem", () => {
    const r = mergeSchemas([], [f("Body Título")])
    expect(r.schema[0].key).toBe("body_titulo")
  })

  it("schema vazio recebe a origem inteira", () => {
    const r = mergeSchemas([], [f("a"), f("b"), f("c")])
    expect(r.added).toHaveLength(3)
  })
})
