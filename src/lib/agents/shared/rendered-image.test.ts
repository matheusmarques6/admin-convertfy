import { describe, it, expect } from "vitest"

import { imageUrlsIn, MAX_RENDERED_IMAGES } from "./rendered-image"

describe("imageUrlsIn", () => {
  it("acha a imagem do mockup — o caso que motivou a story", () => {
    const mockup = `<!DOCTYPE html><html><body>
      <img src="https://cdn.exemplo.com/hero-mockup.png" width="600" alt="">
    </body></html>`
    expect(imageUrlsIn(mockup)).toEqual([
      "https://cdn.exemplo.com/hero-mockup.png",
    ])
  })

  it("aceita as três formas de aspas do atributo", () => {
    const html = [
      '<img src="https://a/1.png">',
      "<img src='https://a/2.png'>",
      "<img src=https://a/3.png>",
    ].join("")
    expect(imageUrlsIn(html, 9)).toEqual([
      "https://a/1.png",
      "https://a/2.png",
      "https://a/3.png",
    ])
  })

  it("ignora data: URI — base64 no prompt estoura o payload", () => {
    expect(
      imageUrlsIn('<img src="data:image/png;base64,iVBORw0KGgoAAAA">'),
    ).toEqual([])
  })

  it("ignora URL relativa, que não dá para resolver", () => {
    expect(imageUrlsIn('<img src="/assets/logo.png">')).toEqual([])
  })

  it("ignora pixel de tracking e spacer", () => {
    const html = [
      '<img src="https://track/open.gif" width="1" height="1">',
      '<img src="https://a/spacer.gif" height="1">',
      '<img src="https://a/hero.png" width="600">',
    ].join("")
    expect(imageUrlsIn(html, 9)).toEqual(["https://a/hero.png"])
  })

  it("não repete a mesma URL", () => {
    const html = '<img src="https://a/x.png"><img src="https://a/x.png">'
    expect(imageUrlsIn(html, 9)).toEqual(["https://a/x.png"])
  })

  // Exemplo estrutural tem muitas imagens e ensina mais como TEXTO (o CSS
  // descreve o acabamento) do que como um álbum de screenshots.
  it("respeita o teto de anexos", () => {
    const html = Array.from(
      { length: 12 },
      (_, i) => `<img src="https://a/${i}.png">`,
    ).join("")
    expect(imageUrlsIn(html)).toHaveLength(MAX_RENDERED_IMAGES)
  })

  it("vazio e nulo devolvem lista vazia", () => {
    expect(imageUrlsIn(null)).toEqual([])
    expect(imageUrlsIn("")).toEqual([])
    expect(imageUrlsIn("<table><tr><td>sem imagem</td></tr></table>")).toEqual([])
  })

  it("não confunde <image> ou um src de outra tag", () => {
    const html = '<script src="https://a/x.js"></script><image src="https://a/y.png"/>'
    expect(imageUrlsIn(html, 9)).toEqual([])
  })
})
