import { describe, expect, it } from "vitest"

import { camposComEndereco, chaveDoCampo } from "./tem-endereco"
import type { BlueprintBlockField } from "@/types/email-generation"

const img = (key: string): BlueprintBlockField => ({
  key,
  label: "",
  type: "image",
  nature: "imagem_gerada",
  max_len: 0,
  min_len: null,
  required: false,
  example: "",
  guidance: "",
  source: "schema",
})

const bloco = (id: string, tipo: string, keys: string[]) => ({
  block_id: id,
  block_type: tipo,
  position: 1,
  content: {} as Record<string, unknown>,
  fields: keys.map(img),
})

const marcado = (i: number, tipo: string, miolo: string) =>
  `<!-- cfy:block:${i}:${tipo}:start -->${miolo}<!-- cfy:block:${i}:${tipo}:end -->`

describe("camposComEndereco", () => {
  it("campo com token de src tem endereço", () => {
    const html = marcado(0, "products", `<img src="URL_FOTO_1" alt="x">`)
    const r = camposComEndereco(html, [bloco("b1", "products", ["product_1_photo"])])
    expect(r.has(chaveDoCampo("b1", "product_1_photo"))).toBe(true)
  })

  it("campo que o HTML não endereça NÃO tem — é a imagem que seria paga à toa", () => {
    const html = marcado(0, "body", `<p>bloco sem nenhum slot de imagem</p>`)
    const r = camposComEndereco(html, [bloco("b1", "body", ["collage_photo_1"])])
    expect(r.size).toBe(0)
  })

  it("a review 8 ancora as cinco SEM um único src=URL_ — é a armadilha", () => {
    // Anatomia real da variante, lida do banco:
    //   <img src="data:image/png;base64,…" width="255" height="318" alt="ALT_FOTO_1A">
    // O base64 é o xadrez de espera e o token mora no `alt`. Uma régua que
    // procurasse `src="URL_…"` reprovaria as cinco e o e-mail perderia as
    // fotos dos depoimentos — exatamente o erro que o guard não pode cometer.
    const b64 = "A".repeat(600)
    const fotos = ["ALT_FOTO_1A", "ALT_FOTO_1B", "ALT_FOTO_2A", "ALT_FOTO_2B", "ALT_FOTO_3"]
      .map(
        (alt) =>
          `<img src="data:image/png;base64,${b64}" width="255" height="318" alt="${alt}" style="display:block">`,
      )
      .join("")
    const html = marcado(0, "reviews", fotos)
    const b = bloco("b1", "reviews", [
      "review_1_photo_a",
      "review_1_photo_b",
      "review_2_photo_a",
      "review_2_photo_b",
      "review_3_photo",
    ])
    const r = camposComEndereco(html, [b])
    expect(r.size).toBe(5)
  })

  it("a MESMA variante duas vezes no e-mail: cada bloco tem os SEUS slots", () => {
    // É o caso do Welcome 1 da Hero Boxers (a `body 3` nas posições 2 e 3).
    // Antes do fix f6a143c os dois blocos disputavam o mesmo grupo e três
    // selos iam para `sem_lugar`; o guard tem de enxergar os dois lugares.
    const seals = `<img src="URL_SELO_1"><img src="URL_SELO_2">`
    const html = marcado(0, "body", seals) + marcado(1, "body", seals)
    const b1 = bloco("b1", "body", ["seal_1_image", "seal_2_image"])
    const b2 = { ...bloco("b2", "body", ["seal_1_image", "seal_2_image"]), position: 2 }
    const r = camposComEndereco(html, [b1, b2])
    expect(r.has(chaveDoCampo("b1", "seal_1_image"))).toBe(true)
    expect(r.has(chaveDoCampo("b2", "seal_1_image"))).toBe(true)
    expect(r.size).toBe(4)
  })

  it("campo de COPY não entra — o guard só fala de imagem gerada", () => {
    const html = marcado(0, "body", `<img src="URL_FOTO_1">`)
    const b = {
      ...bloco("b1", "body", ["foto"]),
      fields: [img("foto"), { ...img("headline"), type: "text_short" as const, nature: "copy" as const }],
    }
    const r = camposComEndereco(html, [b])
    expect(r.has(chaveDoCampo("b1", "headline"))).toBe(false)
  })

  it("documento sem marcadores de bloco não inventa endereço", () => {
    // Sem `cfy:block` não há como saber a que bloco o slot pertence. O guard
    // devolve vazio e o caller, que trata ausência como "gera", não muda
    // nada — o lado seguro de errar.
    const r = camposComEndereco("<p>legado</p>", [bloco("b1", "body", ["x_photo"])])
    expect(r.size).toBe(0)
  })
})
