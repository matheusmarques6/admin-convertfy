import { describe, it, expect } from "vitest"
import { extractImageSlotNotes } from "./extract-image-slot-notes"

describe("extractImageSlotNotes", () => {
  it("pega o comentário do <td> que envolve o <img> da tag", () => {
    const html = `
      <table><tr>
        <td>
          <!-- modelo aplicando o sérum, luz natural, foco no rosto -->
          <img src="{{HERO_IMAGE}}" alt="" />
        </td>
      </tr></table>`
    expect(extractImageSlotNotes(html, ["HERO_IMAGE"])).toEqual({
      HERO_IMAGE: "modelo aplicando o sérum, luz natural, foco no rosto",
    })
  })

  it("cai no <tr> quando o <td> não tem comentário", () => {
    const html = `
      <tr>
        <!-- banner amplo, tom dourado -->
        <td><img src="{{HERO_IMAGE}}"></td>
      </tr>`
    expect(extractImageSlotNotes(html, ["HERO_IMAGE"])).toEqual({
      HERO_IMAGE: "banner amplo, tom dourado",
    })
  })

  it("casa background-image além de <img src>", () => {
    const html = `<tr><td style="background-image:url({{HERO_IMAGE}})">
      <!-- fundo lifestyle -->
    </td></tr>`
    expect(extractImageSlotNotes(html, ["HERO_IMAGE"])).toEqual({
      HERO_IMAGE: "fundo lifestyle",
    })
  })

  it("multi-imagem: cada tag pega o comentário do SEU td", () => {
    const html = `
      <tr>
        <td><!-- produto 1 em fundo claro --><img src="{{PRODUCT_1_IMAGE}}"></td>
        <td><!-- produto 2 em fundo escuro --><img src="{{PRODUCT_2_IMAGE}}"></td>
      </tr>`
    expect(
      extractImageSlotNotes(html, ["PRODUCT_1_IMAGE", "PRODUCT_2_IMAGE"]),
    ).toEqual({
      PRODUCT_1_IMAGE: "produto 1 em fundo claro",
      PRODUCT_2_IMAGE: "produto 2 em fundo escuro",
    })
  })

  it("sem comentário → tag ausente do mapa (não inventa)", () => {
    const html = `<tr><td><img src="{{HERO_IMAGE}}"></td></tr>`
    expect(extractImageSlotNotes(html, ["HERO_IMAGE"])).toEqual({})
  })

  it("tag inexistente no HTML → ignorada; html vazio → {}", () => {
    const html = `<tr><td><!-- x --><img src="{{HERO_IMAGE}}"></td></tr>`
    expect(extractImageSlotNotes(html, ["OFFER_IMAGE"])).toEqual({})
    expect(extractImageSlotNotes("", ["HERO_IMAGE"])).toEqual({})
  })
})
